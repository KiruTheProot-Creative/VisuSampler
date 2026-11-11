// HyperSynth's sound engine (see Synth.h).
#include "Synth.h"
#include "Json.h"
#include <algorithm>
#include <cmath>
#include <chrono>
#include <complex>
#include <cstdio>
#include <cstring>
#include <mutex>

namespace visu {
namespace hs {

static constexpr double kPi = 3.14159265358979323846;
static inline float clampf(float v, float a, float b) { return v < a ? a : (v > b ? b : v); }

/* ---------- the parameter table ---------- */
static const char* kOscModes[] = { "Wavetable", "Spectrum", "Sample", "Analog", "FM", "Noise" };
enum OscMode { MWave = 0, MSpectrum, MSample, MAnalog, MFm, MNoise };

static std::vector<ParamDef> buildParams() {
    std::vector<ParamDef> v;
    auto num = [&](const std::string& id, const std::string& name, float mn, float mx, float def, const std::string& unit = "", bool lg = false) {
        ParamDef p; p.id = id; p.name = name; p.min = mn; p.max = mx; p.def = def; p.old = def; p.unit = unit; p.log = lg; v.push_back(p); };
    auto opt = [&](const std::string& id, const std::string& name, std::vector<std::string> o, int def) {
        ParamDef p; p.id = id; p.name = name; p.min = 0; p.max = (float) (o.size() - 1); p.def = (float) def; p.old = p.def; p.opts = std::move(o); v.push_back(p); };
    num("master", "Master", -48, 6, -3, "dB");
    opt("play", "Play", { "I", "II", "I+II" }, 0);
    num("xfade", "Crossfade", 0, 1, .5f);
    num("voices", "Voices", 1, 32, 32);
    opt("mode", "Mode", { "Poly", "Mono", "Legato" }, 0);
    num("glide", "Glide", 0, 2000, 0, "ms");
    num("bend", "Bend range", 0, 24, 2, "st");
    num("vib", "Vibrato (mod wheel)", 0, 2, .5f, "st");
    num("vibRate", "Vibrato rate", .1f, 12, 5.5f, "Hz", true);
    const std::vector<std::string> tables = wavetableNames();
    for (int L = 1; L <= 2; ++L) {
        const std::string l = "l" + std::to_string(L) + ".", ln = "Layer " + std::string(L == 1 ? "I" : "II") + " ";
        num(l + "level", ln + "level", -48, 6, 0, "dB");
        num(l + "pan", ln + "pan", -1, 1, 0);
        num(l + "vel", ln + "velocity", 0, 1, .5f);
        for (int k = 1; k <= 3; ++k) {
            const std::string o = l + "o" + std::to_string(k) + ".", on = ln + "osc " + std::to_string(k) + " ";
            opt(o + "on", on + "on", { "Off", "On" }, k == 1 ? 1 : 0);
            opt(o + "mode", on + "mode", { kOscModes, kOscModes + 6 }, k == 1 ? MAnalog : (k == 2 ? MWave : MFm));
            opt(o + "shape", on + "shape", { "Saw", "Square", "Triangle", "Sine" }, 0);
            num(o + "pw", on + "pulse width", .05f, .95f, .5f);
            opt(o + "table", on + "wavetable", tables, 0);
            opt(o + "wtsrc", on + "wavetable source", { "Factory", "Custom" }, 0);
            num(o + "pos", on + "position", 0, 1, 0);
            num(o + "ratio", on + "FM ratio", .5f, 16, 2, "", true);
            num(o + "fm", on + "FM amount", 0, 1, .3f);
            num(o + "oct", on + "octave", -3, 3, 0);
            num(o + "semi", on + "semitones", -12, 12, 0, "st");
            num(o + "fine", on + "fine", -100, 100, 0, "ct");
            num(o + "level", on + "level", 0, 1, .7f);
            num(o + "pan", on + "pan", -1, 1, 0);
            num(o + "voices", on + "Hyper voices", 1, (float) Synth::kMaxUnison, 1);
            num(o + "detune", on + "detune", 0, 100, 25, "ct");
            num(o + "spread", on + "stereo spread", 0, 1, .8f);
            num(o + "blend", on + "blend", 0, 1, .5f);
            opt(o + "phase", on + "phase", { "Random", "Reset" }, 0);
        }
        num(l + "sub", ln + "sub", 0, 1, 0);
        opt(l + "subOct", ln + "sub octave", { "-1 oct", "-2 oct" }, 0);
        num(l + "noise", ln + "noise", 0, 1, 0);
        num(l + "hp.cut", ln + "high-pass cutoff", 20, 20000, 20, "Hz", true);
        num(l + "hp.res", ln + "high-pass resonance", 0, 1, 0);
        opt(l + "lp.type", ln + "low-pass slope", { "12 dB", "24 dB" }, 1);
        num(l + "lp.cut", ln + "low-pass cutoff", 20, 20000, 12000, "Hz", true);
        num(l + "lp.res", ln + "low-pass resonance", 0, 1, .1f);
        num(l + "lp.drive", ln + "drive", 0, 1, 0);
        num(l + "lp.env", ln + "filter envelope", -1, 1, 0);
        num(l + "lp.key", ln + "key tracking", 0, 1, .5f);
        for (const char* e : { "fenv", "aenv" }) {
            const bool amp = e[0] == 'a'; const std::string p = l + e + ".", pn = ln + (amp ? "amp " : "filter ");
            num(p + "a", pn + "attack", .5f, 20000, amp ? 2.f : 5.f, "ms", true);
            num(p + "d", pn + "decay", 1, 20000, amp ? 300.f : 400.f, "ms", true);
            num(p + "s", pn + "sustain", 0, 1, amp ? 1.f : .5f);
            num(p + "r", pn + "release", 1, 20000, amp ? 200.f : 300.f, "ms", true);
        }
    }
    /* added with modulation (11 Nov 2026). Nothing modulates until a route exists, so older presets sound the same */
    for (int i = 1; i <= Synth::kMacros; ++i) num("macro" + std::to_string(i), "Macro " + std::to_string(i), 0, 1, 0);
    for (int i = 1; i <= Synth::kLfos; ++i) {
        const std::string l = "lfo" + std::to_string(i) + ".", ln = "LFO " + std::to_string(i) + " ";
        num(l + "rate", ln + "rate", .01f, 40, 2, "Hz", true);
        opt(l + "sync", ln + "sync", { "Off", "1/32", "1/16T", "1/16", "1/8T", "1/8", "1/4T", "1/4", "1/2", "1 bar", "2 bars", "4 bars", "8 bars" }, 0);
        opt(l + "mode", ln + "mode", { "Free", "Retrig", "Once" }, 1);
        opt(l + "shape", ln + "shape", { "Sine", "Triangle", "Saw Up", "Saw Down", "Square", "S&H", "Smooth Random", "Drawn" }, 0);
        num(l + "phase", ln + "phase", 0, 1, 0);
        num(l + "fade", ln + "fade in", 0, 10000, 0, "ms");
    }
    for (int i = 1; i <= 2; ++i) {
        const std::string e = "env" + std::to_string(i) + ".", en = "Mod env " + std::to_string(i) + " ";
        num(e + "a", en + "attack", .5f, 20000, 10, "ms", true);
        num(e + "d", en + "decay", 1, 20000, 500, "ms", true);
        num(e + "s", en + "sustain", 0, 1, .4f);
        num(e + "r", en + "release", 1, 20000, 400, "ms", true);
        num(e + "ac", en + "attack curve", -1, 1, 0);
        num(e + "dc", en + "decay curve", -1, 1, .6f);
        num(e + "rc", en + "release curve", -1, 1, .6f);
    }
    /* added with Spectrum / Sample modes and warps (11 Nov 2026): warps start Off, so older sounds are unchanged */
    for (int L = 1; L <= 2; ++L) for (int k = 1; k <= 3; ++k) {
        const std::string o = "l" + std::to_string(L) + ".o" + std::to_string(k) + ".", on = "Layer " + std::string(L == 1 ? "I" : "II") + " osc " + std::to_string(k) + " ";
        opt(o + "warp", on + "warp", { "Off", "Sync", "Bend", "Squeeze", "Mirror", "Phase Dist", "Quantize", "FM from Osc 1", "RM from Osc 1" }, 0);
        num(o + "warpAmt", on + "warp amount", 0, 1, .5f);
        num(o + "sp.parts", on + "partials", 1, 64, 32);
        num(o + "sp.tilt", on + "spectral tilt", -1, 1, 0);
        num(o + "sp.odd", on + "odd / even", -1, 1, 0);
        num(o + "sp.stretch", on + "stretch", -1, 1, 0);
        num(o + "sp.form", on + "formant", 100, 8000, 800, "Hz", true);
        num(o + "sp.fAmt", on + "formant amount", 0, 1, 0);
        num(o + "smp.start", on + "sample start", 0, 1, 0);
        opt(o + "smp.loop", on + "sample loop", { "Off", "Forward", "Ping-pong" }, 0);
        num(o + "smp.ls", on + "loop start", 0, 1, 0);
        num(o + "smp.le", on + "loop end", 0, 1, 1);
        num(o + "smp.root", on + "root key", 0, 127, 60);
    }
    return v;
}
const std::vector<ParamDef>& params() { static const std::vector<ParamDef> p = buildParams(); return p; }
int paramIndex(const std::string& id) {
    const auto& p = params(); for (size_t i = 0; i < p.size(); ++i) if (p[i].id == id) return (int) i; return -1;
}

/* ---------- wavetables: one band-limited copy per octave of every frame (no aliasing) ---------- */
static constexpr int kTab = 2048, kMips = 11;    // mip m holds harmonics up to 1024 >> m
// each octave copy is only as long as it needs to be (2048, 2048, 1024, 512 ... 64 samples), plus one wrap sample
static constexpr int mipLen(int m) { return (4096 >> m) > kTab ? kTab : ((4096 >> m) < 64 ? 64 : (4096 >> m)); }
static constexpr int mipOff(int m) { return m == 0 ? 0 : mipOff(m - 1) + mipLen(m - 1) + 1; }
static constexpr int kFrame = mipOff(kMips);     // floats per frame, all copies
struct Wavetable {
    std::string name; int frames = 0; std::vector<float> data;   // [frame][kFrame]: the octave copies at mipOff(m)
    std::vector<float> src;                                      // an imported table: its frames as loaded (kTab each), for saving
};

static void fft(std::vector<std::complex<double>>& a, bool inv) {
    const size_t n = a.size();
    for (size_t i = 1, j = 0; i < n; ++i) { size_t bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) std::swap(a[i], a[j]); }
    for (size_t len = 2; len <= n; len <<= 1) {
        const double ang = 2 * kPi / (double) len * (inv ? 1 : -1); const std::complex<double> wl(std::cos(ang), std::sin(ang));
        for (size_t i = 0; i < n; i += len) { std::complex<double> w(1); for (size_t j = 0; j < len / 2; ++j) { auto u = a[i + j], t = a[i + j + len / 2] * w; a[i + j] = u + t; a[i + j + len / 2] = u - t; w *= wl; } }
    }
}
// spec[h] (h = 1..1024): the frame's harmonics as an FFT of kTab samples would give them. Writes every mip of one frame,
// all scaled so the full-band copy peaks at 1 (or by `gainOut` when given: the same gain for a whole table).
static void renderSpectrum(const std::vector<std::complex<double>>& spec, float* out, const float* fixedGain = nullptr) {
    float gain = fixedGain ? *fixedGain : 1;
    for (int m = 0; m < kMips; ++m) {
        const int H = 1024 >> m, N = mipLen(m); std::vector<std::complex<double>> X((size_t) N);
        const double sc = (double) N / kTab;
        for (int h = 1; h <= H && h < (int) spec.size() && h < N / 2; ++h) { X[(size_t) h] = spec[(size_t) h] * sc; X[(size_t) (N - h)] = std::conj(X[(size_t) h]); }
        fft(X, true);
        float* d = out + mipOff(m);
        for (int i = 0; i < N; ++i) d[i] = (float) (X[(size_t) i].real() / N);
        if (m == 0 && !fixedGain) { float pk = 0; for (int i = 0; i < N; ++i) pk = std::max(pk, std::fabs(d[i])); gain = pk > 1e-9f ? 1 / pk : 1; }
        for (int i = 0; i < N; ++i) d[i] *= gain;
        d[N] = d[0];
    }
}
// amp[h] in sine phase (the original five tables)
static void renderFrame(const std::vector<double>& amp, float* out) {
    std::vector<std::complex<double>> spec(1025);
    for (int h = 1; h <= 1024 && h < (int) amp.size(); ++h) spec[(size_t) h] = std::complex<double>(0, -amp[(size_t) h] * kTab / 2);
    renderSpectrum(spec, out);
}
// one cycle as kTab samples -> its spectrum (DC dropped)
static std::vector<std::complex<double>> spectrumOf(const float* cycle) {
    std::vector<std::complex<double>> X(kTab); for (int i = 0; i < kTab; ++i) X[(size_t) i] = cycle[i];
    fft(X, false); X.resize(1025); X[0] = 0; return X;
}
static std::vector<Wavetable> buildTables() {
    std::vector<Wavetable> t;
    const int F = 32, NH = 1025;
    auto table = [&](const std::string& name, auto spectrum) {
        Wavetable w; w.name = name; w.frames = F; w.data.assign((size_t) F * kFrame, 0.f);
        for (int f = 0; f < F; ++f) { std::vector<double> a(NH, 0.0); spectrum((double) f / (F - 1), a); renderFrame(a, w.data.data() + (size_t) f * kFrame); }
        t.push_back(std::move(w));
    };
    // a table drawn in time (one cycle, x 0..1), made band-limited through its spectrum
    auto shapeTable = [&](const std::string& name, auto cycle) {
        Wavetable w; w.name = name; w.frames = F; w.data.assign((size_t) F * kFrame, 0.f); std::vector<float> c(kTab);
        for (int f = 0; f < F; ++f) { const double pos = (double) f / (F - 1); for (int i = 0; i < kTab; ++i) c[(size_t) i] = (float) cycle((double) i / kTab, pos);
            renderSpectrum(spectrumOf(c.data()), w.data.data() + (size_t) f * kFrame); }
        t.push_back(std::move(w));
    };
    auto shape = [](int s, int h) -> double {   // 0 sine, 1 triangle, 2 saw, 3 square
        if (s == 0) return h == 1 ? 1 : 0;
        if (s == 1) return (h % 2) ? (((h / 2) % 2) ? -1.0 : 1.0) / ((double) h * h) : 0;
        if (s == 2) return 1.0 / h;
        return (h % 2) ? 1.0 / h : 0;
    };
    const double TP = 2 * kPi;
    table("Basic Shapes", [&](double x, std::vector<double>& a) {   // sine -> triangle -> saw -> square
        const double s = x * 3; const int s0 = std::min(2, (int) s); const double fr = s - s0;
        for (int h = 1; h < (int) a.size(); ++h) a[(size_t) h] = shape(s0, h) * (1 - fr) + shape(s0 + 1, h) * fr; });
    table("PWM", [&](double x, std::vector<double>& a) {   // pulse width 50% -> 4%
        const double w = .5 - x * .46; for (int h = 1; h < (int) a.size(); ++h) a[(size_t) h] = 2 / (h * kPi) * std::sin(h * kPi * w); });
    table("Harmonic Sweep", [&](double x, std::vector<double>& a) {   // dark to bright
        const double b = 1 + x * x * 60; for (int h = 1; h < (int) a.size(); ++h) a[(size_t) h] = std::exp(-(h - 1) / b) / std::sqrt((double) h); });
    table("Vowels", [&](double x, std::vector<double>& a) {   // A, E, I, O, U (formants as harmonics of a 150 Hz voice)
        const double F1[5] = { 4.9, 3.5, 1.8, 3.8, 2.0 }, F2[5] = { 7.3, 12.3, 15.3, 5.6, 5.8 };
        const double s = x * 4; const int i0 = std::min(3, (int) s); const double fr = s - i0, f1 = F1[i0] * (1 - fr) + F1[i0 + 1] * fr, f2 = F2[i0] * (1 - fr) + F2[i0 + 1] * fr;
        for (int h = 1; h < (int) a.size(); ++h) { const double g = std::exp(-std::pow((h - f1) / 1.4, 2)) + .7 * std::exp(-std::pow((h - f2) / 2.2, 2)); a[(size_t) h] = (g + .02) / std::sqrt((double) h); } });
    table("Digital Grit", [&](double x, std::vector<double>& a) {   // hashed spectra that open up
        const int top = 4 + (int) (x * 120);
        for (int h = 1; h < (int) a.size(); ++h) { uint32_t z = (uint32_t) h * 2654435761u ^ 0x9e3779b9u; z ^= z >> 15; z *= 2246822519u; z ^= z >> 13;
            a[(size_t) h] = h <= top ? (.25 + .75 * (z % 1000) / 1000.0) / std::pow((double) h, .7) : 0; } });
    /* added 11 Nov 2026 (always appended: a preset stores the table's number) */
    shapeTable("Sync Sweep", [&](double x, double p) { const double r = 1 + p * 7; double y = std::fmod(x * r, 1.0); return 2 * y - 1; });   // hard-synced saw
    shapeTable("Phase Distortion", [&](double x, double p) {   // the Casio CZ trick: a bent sine that turns into a saw or a pulse
        const double d = .5 - p * .47, ph = x < d ? x * .5 / d : .5 + (x - d) * .5 / (1 - d); return -std::cos(TP * ph); });
    shapeTable("Wavefolder", [&](double x, double p) { return std::sin((.6 + p * 9) * std::sin(TP * x)); });
    shapeTable("FM Growl", [&](double x, double p) { return std::sin(TP * x + p * 6 * std::sin(TP * 2 * x)); });
    shapeTable("FM Metal", [&](double x, double p) { return std::sin(TP * x + p * 5 * std::sin(TP * 5 * x) + p * 2 * std::sin(TP * 9 * x)); });
    table("Organ", [&](double x, std::vector<double>& a) {   // drawbars, from soft flute to full organ
        const int hs[9] = { 1, 2, 3, 4, 6, 8, 10, 12, 16 }; for (int i = 0; i < 9; ++i) { const double on = std::min(1.0, std::max(0.0, x * 9 - i + 1.5)); a[(size_t) hs[i]] += (i == 0 ? 1 : .7 / std::sqrt((double) i)) * (i < 2 ? 1 : on); } });
    table("Formant Sweep", [&](double x, std::vector<double>& a) {   // a resonant peak climbing through a saw
        const double c = 2 * std::pow(40.0, x); for (int h = 1; h < (int) a.size(); ++h) a[(size_t) h] = (.15 + 3 * std::exp(-std::pow((h - c) / (1 + c * .12), 2))) / h; });
    table("Odd to Even", [&](double x, std::vector<double>& a) {   // hollow (odd harmonics) to nasal (even)
        for (int h = 1; h < (int) a.size(); ++h) a[(size_t) h] = (h == 1 ? 1 : (h % 2 ? 1 - x : x)) / h; });
    table("Spectral Comb", [&](double x, std::vector<double>& a) {   // notches moving through a saw (a flanger frozen in each frame)
        const double sp = 2 + x * 14; for (int h = 1; h < (int) a.size(); ++h) a[(size_t) h] = std::fabs(std::cos(kPi * h / sp)) / h; });
    shapeTable("Bitcrush", [&](double x, double p) { const double lv = std::pow(2.0, 6 - p * 5); return std::round(std::sin(TP * x) * lv) / lv; });
    table("Harmonics", [&](double x, std::vector<double>& a) {   // one harmonic at a time, 1 to 32
        const double hp = 1 + x * 31; const int h0 = (int) hp; const double fr = hp - h0; a[(size_t) h0] = 1 - fr; if (h0 + 1 <= 32) a[(size_t) h0 + 1] = fr; });
    table("Resonant Saw", [&](double x, std::vector<double>& a) {   // an analog filter sweep with resonance, frozen
        const double fc = 1.5 * std::pow(60.0, x), q = 6;
        for (int h = 1; h < (int) a.size(); ++h) { const double r = h / fc; a[(size_t) h] = 1.0 / h / std::sqrt(std::pow(1 - r * r, 2) + std::pow(r / q, 2)); } });
    return t;
}
static const std::vector<Wavetable>& tables() { static const std::vector<Wavetable> t = buildTables(); return t; }
// Analog's shapes as band-limited single cycles (saw, square, triangle, sine): what a warped Analog oscillator reads
static const std::vector<Wavetable>& analogTables() {
    static const std::vector<Wavetable> t = [] {
        std::vector<Wavetable> v;
        for (int sh = 0; sh < 4; ++sh) { Wavetable w; w.frames = 2; w.data.assign((size_t) 2 * kFrame, 0.f); std::vector<double> a(1025, 0.0);
            for (int h = 1; h <= 1024; ++h) a[(size_t) h] = sh == 0 ? 1.0 / h : sh == 1 ? (h % 2 ? 1.0 / h : 0) : sh == 2 ? (h % 2 ? ((h / 2) % 2 ? -1.0 : 1.0) / (h * h) : 0) : (h == 1 ? 1 : 0);
            renderFrame(a, w.data.data()); std::copy(w.data.begin(), w.data.begin() + kFrame, w.data.begin() + kFrame); v.push_back(std::move(w)); }
        return v; }();
    return t;
}
enum Warp { WOff = 0, WSync, WBend, WSqueeze, WMirror, WPd, WQuant, WFm, WRm };
static inline double warpPhase(int w, double ph, float a, float o1) {   // where in the cycle a warped oscillator reads
    switch (w) {
        case WSync: { const double x = ph * (1 + 7 * a); return x - std::floor(x); }
        case WBend: return std::pow(ph, 1 + 3 * a);
        case WSqueeze: { const double k = 1 + 4 * a; return ph < .5 ? .5 * std::pow(2 * ph, k) : 1 - .5 * std::pow(2 * (1 - ph), k); }
        case WMirror: { const double m = ph < .5 ? ph : 1 - ph; return (1 - a) * ph + a * 2 * m; }
        case WPd: { const double d = .5 - .49 * a; return ph < d ? ph / d * .5 : .5 + (ph - d) / (1 - d) * .5; }
        case WQuant: { const double q = 64 - 60 * a; return std::floor(ph * q) / q; }
        case WFm: { const double x = ph + a * 1.5 * o1; return x - std::floor(x); }
        default: return ph;
    }
}
static inline double warpHeadroom(int w, float a) { return w == WSync ? 1 + 7 * a : (w == WOff || w == WQuant || w == WRm) ? 1 : 2; }
const std::vector<std::string>& wavetableNames() {
    static const std::vector<std::string> n = { "Basic Shapes", "PWM", "Harmonic Sweep", "Vowels", "Digital Grit",
        "Sync Sweep", "Phase Distortion", "Wavefolder", "FM Growl", "FM Metal", "Organ", "Formant Sweep", "Odd to Even", "Spectral Comb", "Bitcrush", "Harmonics", "Resonant Saw" };
    return n;
}

std::vector<float> wavetablePreview(int table, int frames, int points) {
    const auto& t = tables(); std::vector<float> out; if (table < 0 || table >= (int) t.size() || frames < 1 || points < 2) return out;
    const auto& w = t[(size_t) table]; out.resize((size_t) frames * (size_t) points);
    for (int f = 0; f < frames; ++f) { const int src = frames == 1 ? 0 : f * (w.frames - 1) / (frames - 1); const float* d = w.data.data() + (size_t) src * kFrame;
        for (int i = 0; i < points; ++i) out[(size_t) f * points + i] = d[(size_t) i * kTab / points]; }
    return out;
}

/* ---------- imported wavetables ---------- */
// frames (kTab samples each) -> a playable table with its octave copies; the frames are kept for saving
static std::unique_ptr<Wavetable> makeCustom(const std::vector<float>& frames, const std::string& name) {
    const int F = (int) (frames.size() / kTab); if (F < 1) return nullptr;
    auto w = std::make_unique<Wavetable>(); w->name = name; w->frames = F; w->src.assign(frames.begin(), frames.begin() + (size_t) F * kTab);
    w->data.assign((size_t) std::max(2, F) * kFrame, 0.f);
    float pk = 0; for (float v : w->src) pk = std::max(pk, std::fabs(v)); const float g = pk > 1e-9f ? 1 / pk : 1;   // one gain for all frames: their levels stay as they were
    for (int f = 0; f < F; ++f) renderSpectrum(spectrumOf(w->src.data() + (size_t) f * kTab), w->data.data() + (size_t) f * kFrame, &g);
    if (F == 1) { std::copy(w->data.begin(), w->data.begin() + kFrame, w->data.begin() + kFrame); w->frames = 2; }   // one frame: Position has nothing to move through
    return w;
}

// YIN on part of the sound (the middle, or from `at`): its period in samples, 0 when there is no clear pitch
static double findPeriod(const float* x, size_t n, double sr, size_t at = (size_t) -1) {
    if (n < 64) return 0;
    const size_t W = std::min<size_t>(n / 2, 8192), mid = at == (size_t) -1 ? n / 2 - W / 2 : std::min(at, n - W); const int minP = std::max(2, (int) (sr / 2000)), maxP = std::min((int) W - 1, (int) (sr / 25));
    std::vector<double> d((size_t) maxP + 2, 0.0); double run = 0;
    for (int tau = 1; tau <= maxP; ++tau) { double s2 = 0; for (size_t i = 0; i + (size_t) tau < W; ++i) { const double e = x[mid + i] - x[mid + i + (size_t) tau]; s2 += e * e; } run += s2; d[(size_t) tau] = run > 0 ? s2 * tau / run : 1; }
    for (int tau = minP; tau < maxP; ++tau) if (d[(size_t) tau] < .15 && d[(size_t) tau] <= d[(size_t) tau + 1]) {
        const double a = d[(size_t) tau - 1], b = d[(size_t) tau], c = d[(size_t) tau + 1], den = a - 2 * b + c; return tau + (std::fabs(den) > 1e-12 ? .5 * (a - c) / den : 0); }
    return 0;
}
double detectKey(const float* x, size_t n, double sr) {
    if (n < 64) return -1;
    size_t at = 0; float pk = 0; for (size_t i = 0; i < n; ++i) if (std::fabs(x[i]) > pk) { pk = std::fabs(x[i]); at = i; }   // just after the loudest moment: past the attack, still loud
    const size_t W = std::min<size_t>(n / 2, 8192); const size_t from = std::min(n > W ? n - W : 0, at + (size_t) (sr * .05));
    double p = findPeriod(x, n, sr, from); if (p <= 0) p = findPeriod(x, n, sr);
    return p > 0 ? 69 + 12 * std::log2(sr / p / 440.0) : -1;
}

std::vector<float> framesFromAudio(const float* x, size_t n, double sr, int frameSize, std::string* how, int maxFrames) {
    std::vector<float> out; maxFrames = std::max(1, std::min(256, maxFrames));
    auto resampleCycle = [&](double start, double len, float* dst) {   // one stretch of the sound -> kTab samples
        for (int i = 0; i < kTab; ++i) { const double p = start + len * i / kTab; const size_t k = (size_t) p; const double f = p - (double) k;
            dst[i] = k + 1 < n ? (float) (x[k] * (1 - f) + x[k + 1] * f) : (k < n ? x[k] : 0.f); }
        double dc = 0; for (int i = 0; i < kTab; ++i) dc += dst[i]; dc /= kTab; for (int i = 0; i < kTab; ++i) dst[i] -= (float) dc;
    };
    auto slice = [&](int fs, const char* why) {   // a wavetable file: frames side by side
        const int F = std::min(maxFrames, std::max(1, (int) (n / (size_t) fs))); out.assign((size_t) F * kTab, 0.f);
        const int total = (int) (n / (size_t) fs), stepF = std::max(1, total / F);
        for (int f = 0; f < F; ++f) resampleCycle((double) f * stepF * fs, fs, out.data() + (size_t) f * kTab);
        if (how) *how = why;
    };
    if (n < 16) { if (how) *how = "the file is empty"; return out; }
    if (frameSize > 0) { slice(frameSize, "a wavetable file: its frames"); return out; }
    if (n % kTab == 0 && n / kTab >= 2 && n / kTab <= 256) { slice(kTab, "a wavetable file (2048-sample frames)"); return out; }
    if (n <= (size_t) kTab) { slice((int) n, "one short cycle"); return out; }
    /* any other sound: find its pitch (YIN), then take single cycles from across the file */
    const double period = findPeriod(x, n, sr);
    if (period <= 0) { slice(kTab, "no clear pitch: slices of the sound"); return out; }
    const int F = std::min(maxFrames, std::max(1, (int) ((double) n / period) - 1)); out.assign((size_t) F * kTab, 0.f);
    for (int f = 0; f < F; ++f) {
        double s0 = F == 1 ? 0 : (double) f * ((double) n - period - 2) / (F - 1);
        // start each cycle where the sound rises through zero, so neighbouring frames line up
        const size_t lim = std::min(n - 1, (size_t) (s0 + period)); for (size_t i = (size_t) s0; i + 1 < lim; ++i) if (x[i] <= 0 && x[i + 1] > 0) { s0 = (double) i + x[i] / (double) (x[i] - x[i + 1]); break; }
        if (s0 + period + 1 >= (double) n) s0 = std::max(0.0, (double) n - period - 2);
        resampleCycle(s0, period, out.data() + (size_t) f * kTab);
    }
    if (how) { char b[96]; std::snprintf(b, sizeof b, "single cycles at %.1f Hz, %d frames across the sound", sr / period, F); *how = b; }
    return out;
}

static inline int mipFor(double dt) {   // the octave copy whose harmonics all stay under half the sample rate
    const double maxH = .5 / std::max(dt, 1e-9); int m = 0; while (m < kMips - 1 && (double) (1024 >> m) > maxH) ++m; return m;
}
static inline float tabRead(const float* d, double ph, int len) {
    const double x = ph * len; const int i = (int) x; const float f = (float) (x - i); return d[i] + (d[i + 1] - d[i]) * f;
}

/* ---------- small DSP parts ---------- */
static inline double blep(double t, double dt) {   // polyBLEP: rounds the jump of a saw or pulse (much less aliasing)
    if (t < dt) { t /= dt; return t + t - t * t - 1; }
    if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
    return 0;
}
struct Svf {   // Andrew Simper's state-variable filter, stable while it moves
    double ic1 = 0, ic2 = 0;
    inline void tick(double x, double a1, double a2, double a3, double k, double& lp, double& hp) {
        const double v3 = x - ic2, v1 = a1 * ic1 + a2 * v3, v2 = ic2 + a2 * ic1 + a3 * v3; ic1 = 2 * v1 - ic1; ic2 = 2 * v2 - ic2; lp = v2; hp = x - k * v1 - v2;
    }
};
struct SvfCoef { double a1 = 1, a2 = 0, a3 = 0, k = 2;
    void set(double fc, double sr, double res) { setK(fc, sr, 2 - 1.96 * res); }
    void setK(double fc, double sr, double kk) { const double g = std::tan(kPi * std::min(fc, sr * .45) / sr); k = kk; a1 = 1 / (1 + g * (g + k)); a2 = g * a1; a3 = g * a2; } };
struct Env {   // ADSR: linear attack, exponential decay and release
    int stage = 0; float v = 0;   // 0 idle, 1 attack, 2 decay/sustain, 3 release
    void on() { stage = 1; }
    void off() { if (stage) stage = 3; }
    inline float next(float aInc, float dK, float s, float rK) {
        switch (stage) {
            case 1: v += aInc; if (v >= 1) { v = 1; stage = 2; } break;
            case 2: v = s + (v - s) * dK; break;
            case 3: v *= rK; if (v < 1e-5f) { v = 0; stage = 0; } break;
            default: break;
        }
        return v;
    }
};

/* ---------- modulation ---------- */
const std::vector<std::string>& modSources() {
    static const std::vector<std::string> s = { "lfo1", "lfo2", "lfo3", "lfo4", "env1", "env2", "macro1", "macro2", "macro3", "macro4", "vel", "key", "wheel", "at", "rand" };
    return s;
}
enum { SLfo = 0, SEnv = 4, SMacro = 6, SVel = 10, SKey, SWheel, SAt, SRand, kSources };
float curveShape(float x, float c) {
    x = clampf(x, 0, 1); if (std::fabs(c) < 1e-3f) return x;
    const float k = c * 6; return (1 - std::exp(-k * x)) / (1 - std::exp(-k));
}
struct ModEnv {   // a mod envelope: times in seconds, curved stages
    int stage = 0; double t = 0; float lvl = 0, from = 0;
    void on() { stage = 1; t = 0; from = lvl; }
    void off() { if (stage && stage != 3) { from = lvl; stage = 3; t = 0; } }
    float step(double dt, float a, float d, float s, float r, float ca, float cd, float cr) {
        if (stage == 1) { lvl = from + (1 - from) * curveShape((float) (t / std::max(1e-4f, a)), ca); t += dt; if (t >= a) { stage = 2; t = 0; } }
        else if (stage == 2) { lvl = 1 + (s - 1) * curveShape((float) (t / std::max(1e-4f, d)), cd); t += dt; }
        else if (stage == 3) { lvl = from * (1 - curveShape((float) (t / std::max(1e-4f, r)), cr)); t += dt; if (t >= r) { stage = 0; lvl = 0; } }
        return lvl;
    }
};
static constexpr int kLfoTab = 256;
static void drawnTable(const std::vector<float>& xyc, float* out) {   // drawn points -> kLfoTab + 1 samples, 0..1
    const size_t n = xyc.size() / 3;
    if (n < 2) { for (int i = 0; i <= kLfoTab; ++i) out[i] = n ? clampf(xyc[1], 0, 1) : .5f; return; }
    for (int i = 0; i <= kLfoTab; ++i) {
        const float x = (float) i / kLfoTab; size_t s = 0; while (s + 2 < n && xyc[(s + 1) * 3] <= x) ++s;
        const float x0 = xyc[s * 3], y0 = xyc[s * 3 + 1], x1 = xyc[(s + 1) * 3], y1 = xyc[(s + 1) * 3 + 1], c = xyc[s * 3 + 2];
        const float t = x1 > x0 ? (x - x0) / (x1 - x0) : 1; out[i] = clampf(y0 + (y1 - y0) * curveShape(t, c), 0, 1);
    }
}
static const double kSyncBeats[] = { 0, .125, 1.0 / 6, .25, 1.0 / 3, .5, 2.0 / 3, 1, 2, 4, 8, 16, 32 };

/* ---------- voices ---------- */
struct OscState { double ph[Synth::kMaxUnison] = {}, phm[Synth::kMaxUnison] = {}; bool fresh = true; float part[Synth::kMaxUnison][64] = {}; };   // part: Spectrum's partials
struct SampleData { std::string name; double rate = 48000; std::vector<float> L, R; };
static float sinTab[4097];
static inline float sinLook(float ph) { const float x = ph * 4096; const int i = (int) x; return sinTab[i] + (sinTab[i + 1] - sinTab[i]) * (x - (float) i); }
struct LayerVoice { OscState o[3]; double subPh = 0; Env aenv, fenv; Svf hp[2], lp1[2], lp2[2]; };
struct Voice {
    bool active = false, gate = false, held = false; int key = 60; float vel = 1; uint64_t age = 0;
    float fade = 1, fadeStep = 0;     // a voice taken for a new note fades out (fadeStep > 0) instead of stopping dead
    double pitch = 60, target = 60;   // glides from pitch to target
    LayerVoice L[2];
    double lfoPh[Synth::kLfos] = {}; float lfoRnd[Synth::kLfos][2] = {}; double since = 0; float rnd = 0;   // modulation
    ModEnv menv[2];
};

/* per-layer parameter indices, found once */
struct OscIdx { int on, mode, shape, pw, table, wtsrc, pos, ratio, fm, oct, semi, fine, level, pan, voices, detune, spread, blend, phase,
    warp, warpAmt, parts, tilt, odd, stretch, form, fAmt, sStart, sLoop, sLs, sLe, sRoot; };
struct LayerIdx { int level, pan, vel, sub, subOct, noise, hpCut, hpRes, lpType, lpCut, lpRes, lpDrive, lpEnv, lpKey, fa, fd, fs, fr, aa, ad, as, ar; OscIdx o[3]; };

struct Synth::Impl {
    double sr = 48000;
    std::vector<std::atomic<float>> vals;   // what the host and the panel set
    std::vector<float> p, sm;               // per block: the values in use (continuous ones glide)
    std::vector<char> isOpt;
    static constexpr int kGhosts = 8;   // voices taken for new notes finish fading out here
    Voice v[kMaxVoices + kGhosts];
    uint64_t clock = 0; float bend = 0, wheel = 0; bool sustain = false; double vibPh = 0, lastPitch = -1;
    std::vector<int> stack;                 // mono: the keys held, newest last
    LayerIdx li[2]; int iMaster, iPlay, iXfade, iVoices, iMode, iGlide, iBend, iVib, iVibRate;
    uint32_t rnd = 0x1234567u;
    /* imported wavetables: the audio thread reads the pointer; replaced ones are freed a few seconds later */
    std::atomic<const Wavetable*> custom[2][3] = {};
    std::unique_ptr<Wavetable> customOwn[2][3];
    std::atomic<const SampleData*> smp[2][3] = {};   // Sample mode's sounds, the same way
    std::shared_ptr<SampleData> smpOwn[2][3];
    std::vector<std::pair<std::shared_ptr<void>, std::chrono::steady_clock::time_point>> retired;
    void retire(std::shared_ptr<void> w) {
        const auto now = std::chrono::steady_clock::now();
        retired.erase(std::remove_if(retired.begin(), retired.end(), [&](auto& r) { return now - r.second > std::chrono::seconds(3); }), retired.end());
        if (w) retired.emplace_back(std::move(w), now);
    }
    inline float rand01() { rnd ^= rnd << 13; rnd ^= rnd >> 17; rnd ^= rnd << 5; return (float) (rnd & 0xffffff) / 16777216.f; }

    Impl() : vals(params().size()) {
        const auto& d = params(); p.resize(d.size()); sm.resize(d.size()); isOpt.resize(d.size());
        for (size_t i = 0; i < d.size(); ++i) { vals[i].store(d[i].def); p[i] = sm[i] = d[i].def; isOpt[i] = !d[i].opts.empty() || d[i].id.find("voices") != std::string::npos || d[i].id.find(".oct") != std::string::npos || d[i].id.find(".parts") != std::string::npos || d[i].id.find(".root") != std::string::npos; }
        auto I = [](const std::string& s) { const int i = paramIndex(s); if (i < 0) std::fprintf(stderr, "HyperSynth: no parameter %s\n", s.c_str()); return i; };
        iMaster = I("master"); iPlay = I("play"); iXfade = I("xfade"); iVoices = I("voices"); iMode = I("mode"); iGlide = I("glide"); iBend = I("bend"); iVib = I("vib"); iVibRate = I("vibRate");
        for (int L = 0; L < 2; ++L) {
            const std::string l = "l" + std::to_string(L + 1) + "."; LayerIdx& x = li[L];
            x.level = I(l + "level"); x.pan = I(l + "pan"); x.vel = I(l + "vel"); x.sub = I(l + "sub"); x.subOct = I(l + "subOct"); x.noise = I(l + "noise");
            x.hpCut = I(l + "hp.cut"); x.hpRes = I(l + "hp.res"); x.lpType = I(l + "lp.type"); x.lpCut = I(l + "lp.cut"); x.lpRes = I(l + "lp.res"); x.lpDrive = I(l + "lp.drive"); x.lpEnv = I(l + "lp.env"); x.lpKey = I(l + "lp.key");
            x.fa = I(l + "fenv.a"); x.fd = I(l + "fenv.d"); x.fs = I(l + "fenv.s"); x.fr = I(l + "fenv.r"); x.aa = I(l + "aenv.a"); x.ad = I(l + "aenv.d"); x.as = I(l + "aenv.s"); x.ar = I(l + "aenv.r");
            for (int k = 0; k < 3; ++k) { const std::string o = l + "o" + std::to_string(k + 1) + "."; OscIdx& q = x.o[k];
                q.on = I(o + "on"); q.mode = I(o + "mode"); q.shape = I(o + "shape"); q.pw = I(o + "pw"); q.table = I(o + "table"); q.wtsrc = I(o + "wtsrc"); q.pos = I(o + "pos"); q.ratio = I(o + "ratio"); q.fm = I(o + "fm");
                q.oct = I(o + "oct"); q.semi = I(o + "semi"); q.fine = I(o + "fine"); q.level = I(o + "level"); q.pan = I(o + "pan"); q.voices = I(o + "voices"); q.detune = I(o + "detune");
                q.spread = I(o + "spread"); q.blend = I(o + "blend"); q.phase = I(o + "phase");
                q.warp = I(o + "warp"); q.warpAmt = I(o + "warpAmt"); q.parts = I(o + "sp.parts"); q.tilt = I(o + "sp.tilt"); q.odd = I(o + "sp.odd"); q.stretch = I(o + "sp.stretch");
                q.form = I(o + "sp.form"); q.fAmt = I(o + "sp.fAmt"); q.sStart = I(o + "smp.start"); q.sLoop = I(o + "smp.loop"); q.sLs = I(o + "smp.ls"); q.sLe = I(o + "smp.le"); q.sRoot = I(o + "smp.root"); }
        }
        for (int m = 0; m < kMacros; ++m) { iMacro[m] = I("macro" + std::to_string(m + 1)); macroNames[m] = "Macro " + std::to_string(m + 1); }
        for (int l = 0; l < kLfos; ++l) { int k = 0; for (const char* s : { "rate", "sync", "mode", "shape", "phase", "fade" }) iLfo[l][k++] = I("lfo" + std::to_string(l + 1) + "." + s);
            lfoPts[l] = { 0, 0, 0, .5f, 1, 0, 1, 0, 0 }; drawnTable(lfoPts[l], lfoTab[l][0]); drawnTable(lfoPts[l], lfoTab[l][1]); lfoCur[l] = 0; }
        for (int e = 0; e < 2; ++e) { int k = 0; for (const char* s : { "a", "d", "s", "r", "ac", "dc", "rc" }) iEnv[e][k++] = I("env" + std::to_string(e + 1) + "." + s); }
        for (auto& s : shown) s = 0;
        cur = p.data(); scratchV.assign(d.size(), 0.f); scratch = scratchV.data();
        for (int i = 0; i <= 4096; ++i) sinTab[i] = (float) std::sin(2 * kPi * i / 4096.0);
        tables(); analogTables();   // build the wavetables now, not on the first note
    }
    /* one LFO's value 0..1 at phase x */
    float lfoShapeAt(int l, int shape, double x, const float* rnd2) const {
        x -= std::floor(x);
        switch (shape) {
            case 0: return .5f + .5f * (float) std::sin(2 * kPi * x);
            case 1: return (float) (x < .5 ? x * 2 : 2 - x * 2);
            case 2: return (float) x;
            case 3: return (float) (1 - x);
            case 4: return x < .5 ? 1.f : 0.f;
            case 5: return rnd2[0];
            case 6: return rnd2[0] + (rnd2[1] - rnd2[0]) * (float) (.5 - .5 * std::cos(kPi * x));
            default: { const float* t = lfoTab[l][lfoCur[l].load(std::memory_order_acquire)]; const double q = x * kLfoTab; const int i = std::min(kLfoTab - 1, (int) q); const float f = (float) (q - i); return t[i] + (t[i + 1] - t[i]) * f; }
        }
    }
    double lfoHz(int l) const {
        const int sy = (int) std::lround(P(iLfo[l][1]));
        return sy > 0 ? bpm / 60.0 / kSyncBeats[std::min(12, sy)] : (double) P(iLfo[l][0]);
    }
    /* this block's source values for one voice, and its phases moved on */
    void sources(Voice& vo, int n, float* sv) {
        const double dt = (double) n / sr;
        for (int l = 0; l < kLfos; ++l) {
            const int mode = (int) std::lround(P(iLfo[l][2])), shape = (int) std::lround(P(iLfo[l][3])); const double hz = lfoHz(l), ph0 = P(iLfo[l][4]);
            double x; const float* r2;
            if (mode == 0) { x = lfoFree[l] + ph0; r2 = lfoFreeRnd[l]; }
            else { x = mode == 2 ? std::min(vo.lfoPh[l], .99999) + ph0 : vo.lfoPh[l] + ph0; r2 = vo.lfoRnd[l];
                const double nx = vo.lfoPh[l] + hz * dt;
                if (mode == 1 && std::floor(nx) > std::floor(vo.lfoPh[l])) { vo.lfoRnd[l][0] = vo.lfoRnd[l][1]; vo.lfoRnd[l][1] = rand01(); }
                vo.lfoPh[l] = mode == 2 ? std::min(nx, 1.0) : nx - std::floor(nx); }
            const float fade = P(iLfo[l][5]); const float g = fade > 0 ? (float) std::min(1.0, vo.since * 1000 / fade) : 1.f;
            sv[SLfo + l] = (lfoShapeAt(l, shape, x, r2) * 2 - 1) * g;
        }
        for (int e = 0; e < 2; ++e) { const int* q = iEnv[e];
            sv[SEnv + e] = vo.menv[e].step(dt, P(q[0]) / 1000, P(q[1]) / 1000, P(q[2]), P(q[3]) / 1000, P(q[4]), P(q[5]), P(q[6])); }
        for (int m = 0; m < kMacros; ++m) sv[SMacro + m] = P(iMacro[m]);
        sv[SVel] = vo.vel; sv[SKey] = clampf((float) (vo.key - 60) / 48.f, -1, 1); sv[SWheel] = wheel; sv[SAt] = aftertouch; sv[SRand] = vo.rnd;
        vo.since += dt;
    }
    void freeLfos(int n) {   // the Free LFOs run on their own, shared by every note
        for (int l = 0; l < kLfos; ++l) { const double nx = lfoFree[l] + lfoHz(l) * n / sr;
            if (std::floor(nx) > std::floor(lfoFree[l])) { lfoFreeRnd[l][0] = lfoFreeRnd[l][1]; lfoFreeRnd[l][1] = rand01(); }
            lfoFree[l] = nx - std::floor(nx); }
    }
    void noteStartMod(Voice& vo, bool retrig) {
        if (!retrig) return;
        for (int l = 0; l < kLfos; ++l) { vo.lfoPh[l] = 0; vo.lfoRnd[l][0] = rand01(); vo.lfoRnd[l][1] = rand01(); }
        vo.since = 0; vo.rnd = rand01() * 2 - 1; for (auto& e : vo.menv) e.on();
    }
    /* modulation: routes double-buffered (the message thread writes the idle copy, then flips) */
    struct Route { int src, dst; float amt; };
    Route routes[2][kMaxRoutes]; int nRoutes[2] = { 0, 0 }; std::atomic<int> rCur { 0 };
    float lfoTab[kLfos][2][kLfoTab + 1]; std::atomic<int> lfoCur[kLfos];
    std::vector<ModRoute> modList; std::vector<float> lfoPts[kLfos]; std::string macroNames[kMacros];   // message thread
    mutable std::mutex msgLock;
    double bpm = 120, lfoFree[kLfos] = {}; float lfoFreeRnd[kLfos][2] = {}; float aftertouch = 0;
    std::atomic<float> shown[kSources];
    std::vector<float> scratchV; float* scratch = nullptr; const float* cur = nullptr;   // the values the voice being played uses (p, or p + its modulation)
    int iMacro[kMacros], iLfo[kLfos][6], iEnv[2][7];
    float P(int i) const { return cur[(size_t) i]; }
    float V(int i) const { return vals[(size_t) i].load(std::memory_order_relaxed); }   // the live setting (notes can arrive before the next block)

    void startLayer(Voice& vo, int L, bool retrig) {
        LayerVoice& lv = vo.L[L];
        if (retrig) for (int k = 0; k < 3; ++k) { const bool reset = V(li[L].o[k].phase) > .5f;
            for (int u = 0; u < kMaxUnison; ++u) { lv.o[k].ph[u] = reset ? 0 : rand01(); lv.o[k].phm[u] = 0; } lv.o[k].fresh = true; }
        if (retrig) { lv.aenv.on(); lv.fenv.on(); }
    }
    static float level(const Voice& vo) { return std::max(vo.L[0].aenv.v, vo.L[1].aenv.v); }
    // a free voice; when all are busy: the quietest fading tail, else the oldest held note. A taken voice fades out over
    // 5 ms in a spare slot (no click) while its slot plays the new note.
    Voice* freeVoice(int limit) {
        Voice* best = nullptr;
        for (int i = 0; i < limit; ++i) if (!v[i].active) return &v[i];
        for (int i = 0; i < limit; ++i) if (!v[i].gate && (!best || level(v[i]) < level(*best))) best = &v[i];
        if (!best) for (int i = 0; i < limit; ++i) if (!best || v[i].age < best->age) best = &v[i];
        Voice* ghost = &v[kMaxVoices];
        for (int i = kMaxVoices; i < kMaxVoices + kGhosts; ++i) { if (!v[i].active) { ghost = &v[i]; break; } if (v[i].fade < ghost->fade) ghost = &v[i]; }
        *ghost = *best; ghost->gate = false; ghost->held = false; ghost->fadeStep = 1.f / (float) (sr * .005); ghost->key = -1;
        best->active = false;
        return best;
    }
    void noteOn(int key, float vel) {
        const int mode = (int) std::lround(V(iMode)); const double glideFrom = lastPitch;
        if (mode == 0) {
            Voice* vo = nullptr;
            for (int i = 0; i < kMaxVoices; ++i) if (v[i].active && v[i].key == key && v[i].fadeStep == 0) vo = &v[i];   // the same key again: that voice
            if (!vo) vo = freeVoice(std::max(1, std::min(kMaxVoices, (int) std::lround(V(iVoices)))));
            const bool wasActive = vo->active;
            vo->active = true; vo->gate = true; vo->held = false; vo->key = key; vo->vel = vel; vo->age = ++clock; vo->fade = 1; vo->fadeStep = 0;
            vo->target = key; vo->pitch = (V(iGlide) > 0 && glideFrom >= 0) ? glideFrom : key;
            for (int L = 0; L < 2; ++L) { if (!wasActive) { for (int c = 0; c < 2; ++c) { vo->L[L].hp[c] = Svf(); vo->L[L].lp1[c] = Svf(); vo->L[L].lp2[c] = Svf(); } vo->L[L].aenv.v = 0; vo->L[L].fenv.v = 0; } startLayer(*vo, L, true); }
            if (!wasActive) for (auto& e : vo->menv) e.lvl = 0;
            noteStartMod(*vo, true);
        } else {
            stack.erase(std::remove(stack.begin(), stack.end(), key), stack.end()); stack.push_back(key);
            Voice& vo = v[0]; const bool legato = mode == 2 && vo.active && vo.gate;
            vo.key = key; vo.vel = legato ? vo.vel : vel; vo.target = key; vo.age = ++clock;
            if (!vo.active) vo.pitch = (V(iGlide) > 0 && glideFrom >= 0) ? glideFrom : key;
            vo.active = true; vo.gate = true; vo.held = false;
            for (int L = 0; L < 2; ++L) startLayer(vo, L, !legato);
            noteStartMod(vo, !legato);
        }
        lastPitch = key;
    }
    void release(Voice& vo) { vo.gate = false; for (auto& l : vo.L) { l.aenv.off(); l.fenv.off(); } for (auto& e : vo.menv) e.off(); }
    void noteOff(int key) {
        const int mode = (int) std::lround(V(iMode));
        if (mode == 0) { for (auto& vo : v) if (vo.active && vo.gate && vo.key == key) { if (sustain) vo.held = true; else release(vo); } return; }
        stack.erase(std::remove(stack.begin(), stack.end(), key), stack.end());
        Voice& vo = v[0]; if (!vo.active || vo.key != key) return;
        if (!stack.empty()) { vo.key = stack.back(); vo.target = vo.key; lastPitch = vo.key; if (mode == 1) { for (int L = 0; L < 2; ++L) startLayer(vo, L, true); noteStartMod(vo, true); } }
        else if (sustain) vo.held = true; else release(vo);
    }

    /* one block of up to 32 samples */
    void block(float* outL, float* outR, int n) {
        const auto& d = params();
        const float k = 1 - (float) std::exp(-(double) n / (sr * .01));   // knobs glide (about 10 ms)
        for (size_t i = 0; i < d.size(); ++i) { const float t = vals[i].load(std::memory_order_relaxed);
            if (isOpt[i]) p[i] = sm[i] = t; else { sm[i] += (t - sm[i]) * k; if (std::fabs(t - sm[i]) < 1e-6f) sm[i] = t; p[i] = sm[i]; } }
        std::fill(outL, outL + n, 0.f); std::fill(outR, outR + n, 0.f);
        const int play = (int) std::lround(P(iPlay)); const float xf = P(iXfade);
        float lg[2] = { play == 1 ? 0.f : 1.f, play == 0 ? 0.f : 1.f };
        if (play == 2) { lg[0] = (float) std::cos(xf * kPi / 2) * 1.41421356f; lg[1] = (float) std::sin(xf * kPi / 2) * 1.41421356f; lg[0] = std::min(lg[0], 1.f); lg[1] = std::min(lg[1], 1.f); }
        const float master = std::pow(10.f, P(iMaster) / 20) * .3f;
        const double vibSt = wheel * P(iVib) * std::sin(2 * kPi * vibPh); vibPh += P(iVibRate) * n / sr; vibPh -= std::floor(vibPh);
        const double glideMs = P(iGlide), gk = glideMs > 0 ? 1 - std::exp(-(double) n / (sr * glideMs / 1000 / 3)) : 1;
        const double bendSt = bend * P(iBend);
        const int rc = rCur.load(std::memory_order_acquire); Route rt[kMaxRoutes]; const int nr = nRoutes[rc]; std::copy(routes[rc], routes[rc] + nr, rt);
        freeLfos(n);
        const Voice* newest = nullptr; float sv[kSources], showV[kSources] = {};
        for (auto& vo : v) {
            if (!vo.active) continue;
            sources(vo, n, sv);
            if (vo.fadeStep == 0 && (!newest || vo.age > newest->age)) { newest = &vo; std::copy(sv, sv + kSources, showV); }
            if (nr) {   // this voice's own values: the knobs plus what modulates them
                std::copy(p.begin(), p.end(), scratch);
                for (int r = 0; r < nr; ++r) {
                    const ParamDef& pd = d[(size_t) rt[r].dst]; float& x = scratch[rt[r].dst]; const float a = rt[r].amt * sv[rt[r].src];
                    if (pd.log && pd.min > 0) x = pd.min * std::pow(pd.max / pd.min, clampf(std::log(x / pd.min) / std::log(pd.max / pd.min) + a, 0, 1));
                    else x = clampf(x + a * (pd.max - pd.min), pd.min, pd.max);
                }
                cur = scratch;
            }
            vo.pitch += (vo.target - vo.pitch) * gk;
            const float f0 = vo.fade, f1 = std::max(0.f, vo.fade - vo.fadeStep * (float) n);
            bool alive = false;
            for (int L = 0; L < 2; ++L) {
                if (lg[L] <= 0) { if (vo.L[L].aenv.stage) { vo.L[L].aenv.stage = 0; vo.L[L].aenv.v = 0; } continue; }
                alive |= layer(vo, L, lg[L] * master, vo.pitch + bendSt + vibSt, outL, outR, n, f0, f1);
            }
            cur = p.data();
            vo.fade = f1;
            if (!alive || (vo.fadeStep > 0 && f1 <= 0)) { vo.active = false; vo.fadeStep = 0; vo.fade = 1; }
        }
        if (newest) for (int s = 0; s < kSources; ++s) shown[s].store(showV[s], std::memory_order_relaxed);
    }
    // one layer of one voice; false when it has gone quiet
    bool layer(Voice& vo, int L, float gain, double pitch, float* outL, float* outR, int n, float f0 = 1, float f1 = 1) {
        const LayerIdx& x = li[L]; LayerVoice& lv = vo.L[L];
        if (!lv.aenv.stage) return false;
        float bufL[32], bufR[32], o1[32]; std::fill(bufL, bufL + n, 0.f); std::fill(bufR, bufR + n, 0.f); std::fill(o1, o1 + n, 0.f);
        const auto& tabs = tables();
        for (int k = 0; k < 3; ++k) {
            const OscIdx& q = x.o[k]; if (P(q.on) < .5f) continue;
            const int mode = (int) std::lround(P(q.mode)); const float lvl = P(q.level); if (lvl <= 0) continue;
            const double st = pitch + std::lround(P(q.oct)) * 12 + P(q.semi) + P(q.fine) / 100;
            const int U = mode == MNoise ? 1 : std::max(1, std::min(kMaxUnison, (int) std::lround(P(q.voices))));
            const float det = P(q.detune), spr = P(q.spread), bl = P(q.blend), opan = P(q.pan);
            float wsum = 0, w[kMaxUnison], gl[kMaxUnison], gr[kMaxUnison]; double dt[kMaxUnison];
            for (int u = 0; u < U; ++u) {
                const float pos = U == 1 ? 0.f : -1 + 2.f * u / (float) (U - 1);
                w[u] = U == 1 ? 1.f : (1 - bl) + (2 * bl - 1) * std::fabs(pos); w[u] = std::max(w[u], .05f); wsum += w[u] * w[u];
                const float pn = clampf(opan + pos * spr, -1, 1); const float a = (float) ((pn + 1) * kPi / 4);
                gl[u] = std::cos(a) * 1.41421356f; gr[u] = std::sin(a) * 1.41421356f;
                dt[u] = 440.0 * std::pow(2.0, (st + pos * det / 100.0 - 69) / 12.0) / sr;
            }
            const float norm = lvl / std::sqrt(wsum); for (int u = 0; u < U; ++u) { gl[u] *= w[u] * norm; gr[u] *= w[u] * norm; }
            OscState& os = lv.o[k];
            const int warp = (int) std::lround(P(q.warp)); const float wa = P(q.warpAmt);
            float tL[32], tR[32]; std::fill(tL, tL + n, 0.f); std::fill(tR, tR + n, 0.f);   // this oscillator alone
            if (mode == MNoise) { for (int i = 0; i < n; ++i) { const float s = rand01() * 2 - 1; tL[i] = s * gl[0]; tR[i] = s * gr[0]; } }
            else if (mode == MAnalog && (warp == WOff || warp == WRm)) {
                const int sh = (int) std::lround(P(q.shape)); const double pw = P(q.pw);
                for (int u = 0; u < U; ++u) { double ph = os.ph[u]; const double d = dt[u]; const float a = gl[u], b = gr[u];
                    for (int i = 0; i < n; ++i) {
                        double s;
                        if (sh == 0) s = 2 * ph - 1 - blep(ph, d);
                        else if (sh == 1) { double t2 = ph + (1 - pw); t2 -= std::floor(t2); s = (ph < pw ? 1 : -1) + blep(ph, d) - blep(t2, d); }
                        else if (sh == 2) s = 1 - 4 * std::fabs(ph - .5);
                        else s = std::sin(2 * kPi * ph);
                        ph += d; if (ph >= 1) ph -= 1;
                        tL[i] += (float) s * a; tR[i] += (float) s * b;
                    }
                    os.ph[u] = ph; }
            } else if (mode == MWave || mode == MAnalog) {   // a table, read straight or warped (a warped Analog reads its shape as a table)
                const Wavetable* tbp;
                if (mode == MAnalog) tbp = &analogTables()[(size_t) std::min(3, std::max(0, (int) std::lround(P(q.shape))))];
                else { const Wavetable* own = P(q.wtsrc) > .5f ? custom[L][k].load(std::memory_order_acquire) : nullptr;
                       tbp = own ? own : &tabs[(size_t) std::min((int) tabs.size() - 1, std::max(0, (int) std::lround(P(q.table))))]; }
                const Wavetable& tb = *tbp;
                const double fp = mode == MAnalog ? 0 : P(q.pos) * (tb.frames - 1); const int f0 = std::min(tb.frames - 2, (int) fp); const float ff = (float) (fp - f0);
                double maxDt = 0; for (int u = 0; u < U; ++u) maxDt = std::max(maxDt, dt[u]);
                const int m = mipFor(maxDt * 1.06 * warpHeadroom(warp, wa));   // a little headroom for vibrato and bends (more for warps, which add harmonics)
                const float* A = tb.data.data() + (size_t) f0 * kFrame + mipOff(m); const float* B = A + kFrame; const int len = mipLen(m);
                const bool warped = warp != WOff && warp != WRm;
                for (int u = 0; u < U; ++u) { double ph = os.ph[u]; const double d = dt[u]; const float a = gl[u], b = gr[u];
                    for (int i = 0; i < n; ++i) { const double rp = warped ? warpPhase(warp, ph, wa, o1[i]) : ph;
                        const float s = tabRead(A, rp, len) * (1 - ff) + tabRead(B, rp, len) * ff; ph += d; if (ph >= 1) ph -= 1; tL[i] += s * a; tR[i] += s * b; }
                    os.ph[u] = ph; }
            } else if (mode == MFm) {
                const double ratio = P(q.ratio), idx = P(q.fm) * 8, xfm = warp == WFm ? wa * 1.5 * 2 * kPi : 0;
                for (int u = 0; u < U; ++u) { double ph = os.ph[u], pm = os.phm[u]; const double d = dt[u], dm = dt[u] * ratio; const float a = gl[u], b = gr[u];
                    for (int i = 0; i < n; ++i) { const float s = (float) std::sin(2 * kPi * ph + idx * std::sin(2 * kPi * pm) + xfm * o1[i]); ph += d; if (ph >= 1) ph -= 1; pm += dm; pm -= std::floor(pm); tL[i] += s * a; tR[i] += s * b; }
                    os.ph[u] = ph; os.phm[u] = pm; }
            } else if (mode == MSpectrum) {   // additive: partials shaped by tilt, odd / even, stretch (inharmonic) and a formant
                const int parts = std::max(1, std::min(64, (int) std::lround(P(q.parts)))), Pm = std::max(1, std::min(parts, 512 / U));
                const float tilt = P(q.tilt), odd = P(q.odd), str = P(q.stretch), fAmt = P(q.fAmt); const double fc = P(q.form);
                const float ex = tilt >= 0 ? 1 - tilt : 1 - 2 * tilt; const double f0n = 440.0 * std::pow(2.0, (st - 69) / 12.0) / sr;
                float amp[64], mul[64]; double e2 = 0;
                for (int h = 1; h <= Pm; ++h) {
                    const float mu = std::pow((float) h, 1 + .15f * str); float a = std::pow((float) h, -ex);
                    if (h % 2 == 0) a *= odd < 0 ? 1 + odd : 1; else if (h > 1) a *= odd > 0 ? 1 - odd : 1;
                    if (fAmt > 0) { const double oc = std::log2(f0n * mu * sr / fc); a *= 1 + fAmt * 6 * (float) std::exp(-oc * oc / (2 * .09)); }
                    if (f0n * mu * 1.06 >= .45) a = 0;   // above half the sample rate: left out (no aliasing)
                    amp[h - 1] = a; mul[h - 1] = mu; e2 += (double) a * a;
                }
                const float g = e2 > 0 ? (float) (.5 / std::sqrt(e2 / 2)) : 0;
                if (os.fresh) for (int u = 0; u < U; ++u) for (int h = 0; h < 64; ++h) { const double x = os.ph[u] * (h + 1); os.part[u][h] = (float) (x - std::floor(x)); }
                for (int u = 0; u < U; ++u) { float* pp = os.part[u]; const float d = (float) dt[u], a = gl[u] * g, b = gr[u] * g;
                    for (int i = 0; i < n; ++i) { float sum = 0;
                        for (int h = 0; h < Pm; ++h) { if (amp[h] == 0) continue; float x = pp[h] + d * mul[h]; if (x >= 1) x -= 1; pp[h] = x; sum += amp[h] * sinLook(x); }
                        tL[i] += sum * a; tR[i] += sum * b; } }
            } else if (mode == MSample) {   // one sound, played at the note's pitch
                const SampleData* sd = smp[L][k].load(std::memory_order_acquire);
                if (sd && sd->L.size() > 4) {
                    const size_t N = sd->L.size(); const bool st2 = !sd->R.empty();
                    const double base = sd->rate / (440.0 * std::pow(2.0, (P(q.sRoot) - 69) / 12.0)); const int loop = (int) std::lround(P(q.sLoop));
                    double ls = P(q.sLs) * (double) (N - 2), le = P(q.sLe) * (double) (N - 2); if (le < ls + 16) le = std::min((double) N - 2, ls + 16);
                    if (os.fresh) for (int u = 0; u < U; ++u) { os.ph[u] = P(q.sStart) * (double) (N - 2); os.phm[u] = 1; }
                    auto rd = [&](const std::vector<float>& v, double pos) {   // cubic (Hermite) between samples
                        const size_t i = (size_t) pos; const float f = (float) (pos - (double) i);
                        const float y0 = v[i > 0 ? i - 1 : 0], y1 = v[i], y2 = v[std::min(N - 1, i + 1)], y3 = v[std::min(N - 1, i + 2)];
                        const float c1 = .5f * (y2 - y0), c2 = y0 - 2.5f * y1 + 2 * y2 - .5f * y3, c3 = .5f * (y3 - y0) + 1.5f * (y1 - y2);
                        return ((c3 * f + c2) * f + c1) * f + y1; };
                    for (int u = 0; u < U; ++u) { double pos = os.ph[u], dir = os.phm[u] == 0 ? 1 : os.phm[u]; const double inc = dt[u] * base; const float a = gl[u], b = gr[u];
                        for (int i = 0; i < n; ++i) {
                            if (pos < 0 || pos >= (double) N - 1) break;   // played to the end (no loop)
                            const float sl = rd(sd->L, pos), sr2 = st2 ? rd(sd->R, pos) : sl; tL[i] += sl * a; tR[i] += sr2 * b;
                            pos += inc * dir;
                            if (loop == 1 && pos >= le) pos = ls + std::fmod(pos - ls, le - ls);
                            else if (loop == 2) { if (pos >= le) { pos = le - (pos - le); dir = -1; } else if (dir < 0 && pos <= ls) { pos = ls + (ls - pos); dir = 1; } }
                        }
                        os.ph[u] = pos; os.phm[u] = dir; }
                }
            }
            os.fresh = false;
            if (k == 0) { const float inv = lvl > 1e-4f ? .5f / lvl : 0; for (int i = 0; i < n; ++i) o1[i] = (tL[i] + tR[i]) * inv; }   // OSC 1, for the others' FM / RM
            if (warp == WRm && k > 0) for (int i = 0; i < n; ++i) { const float g = 1 - wa + wa * o1[i]; tL[i] *= g; tR[i] *= g; }
            for (int i = 0; i < n; ++i) { bufL[i] += tL[i]; bufR[i] += tR[i]; }
        }
        /* sub and noise */
        const float sub = P(x.sub), nz = P(x.noise);
        if (sub > 0) { const double d = 440.0 * std::pow(2.0, (pitch - 12 * (1 + std::lround(P(x.subOct))) - 69) / 12.0) / sr;
            for (int i = 0; i < n; ++i) { const float s = (float) std::sin(2 * kPi * lv.subPh) * sub * .7f; lv.subPh += d; if (lv.subPh >= 1) lv.subPh -= 1; bufL[i] += s; bufR[i] += s; } }
        if (nz > 0) for (int i = 0; i < n; ++i) { bufL[i] += (rand01() * 2 - 1) * nz * .5f; bufR[i] += (rand01() * 2 - 1) * nz * .5f; }
        /* envelopes, filters, amp */
        auto ms = [&](int i) { return std::max(.5f, P(i)) / 1000.f * (float) sr; };
        const float faInc = 1 / ms(x.fa), fdK = std::exp(-4.6f / ms(x.fd)), frK = std::exp(-4.6f / ms(x.fr)), fs = P(x.fs);
        const float aaInc = 1 / ms(x.aa), adK = std::exp(-4.6f / ms(x.ad)), arK = std::exp(-4.6f / ms(x.ar)), as = P(x.as);
        const float fenv = lv.fenv.v;
        for (int i = 0; i < n; ++i) lv.fenv.next(faInc, fdK, fs, frK);
        const double cutHz = P(x.lpCut) * std::pow(2.0, P(x.lpEnv) * 7 * fenv + P(x.lpKey) * (pitch - 60) / 12);
        SvfCoef hc, lc, lc2; hc.set(clampf(P(x.hpCut), 10, 20000), sr, P(x.hpRes) * .9); lc.set(clampf((float) cutHz, 10, 20000), sr, P(x.lpRes) * .98);
        const bool steep = P(x.lpType) > .5f; if (steep) lc2.setK(clampf((float) cutHz, 10, 20000), sr, 1.414);   // 24 dB: a second, unresonant stage
        const float drive = P(x.lpDrive), dg = 1 + drive * 9, dn = drive > 0 ? 1 / std::tanh(dg) : 1;
        const float velG = 1 - P(x.vel) * (1 - vo.vel);
        const float lvl = std::pow(10.f, P(x.level) / 20) * gain * velG; const float pa = (float) ((P(x.pan) + 1) * kPi / 4), pl = std::cos(pa) * 1.41421356f, pr = std::sin(pa) * 1.41421356f;
        bool loud = false;
        for (int i = 0; i < n; ++i) {
            double s[2] = { bufL[i], bufR[i] };
            for (int c = 0; c < 2; ++c) {
                double lp, hp; double y = s[c];
                if (drive > 0) y = std::tanh(y * dg) * dn;
                lv.hp[c].tick(y, hc.a1, hc.a2, hc.a3, hc.k, lp, hp); y = hp;
                lv.lp1[c].tick(y, lc.a1, lc.a2, lc.a3, lc.k, lp, hp); y = lp;
                if (steep) { lv.lp2[c].tick(y, lc2.a1, lc2.a2, lc2.a3, lc2.k, lp, hp); y = lp; }
                s[c] = y;
            }
            const float e = lv.aenv.next(aaInc, adK, as, arK) * lvl * (f0 + (f1 - f0) * (float) i / (float) n);
            outL[i] += (float) s[0] * e * pl; outR[i] += (float) s[1] * e * pr;
            loud |= lv.aenv.stage != 0;
        }
        return loud;
    }
};

Synth::Synth() : d_(new Impl) {}
Synth::~Synth() = default;
void Synth::prepare(double sampleRate) { d_->sr = sampleRate > 0 ? sampleRate : 48000; allNotesOff(true); }
void Synth::noteOn(int key, float velocity) { d_->noteOn(key, clampf(velocity, 0, 1)); }
void Synth::noteOff(int key) { d_->noteOff(key); }
void Synth::allNotesOff(bool hard) {
    for (auto& vo : d_->v) { if (hard) { vo.active = false; vo.fade = 1; vo.fadeStep = 0; for (auto& l : vo.L) { l.aenv = Env(); l.fenv = Env(); } for (auto& e : vo.menv) e = ModEnv(); } else d_->release(vo); vo.held = false; }
    d_->stack.clear();
}
void Synth::setBend(float v) { d_->bend = clampf(v, -1, 1); }
void Synth::setModWheel(float v) { d_->wheel = clampf(v, 0, 1); }
void Synth::setSustain(bool down) {
    d_->sustain = down;
    if (!down) for (auto& vo : d_->v) if (vo.held) { vo.held = false; d_->release(vo); }
}
void Synth::setParam(int i, float value) {
    const auto& d = params(); if (i < 0 || i >= (int) d.size()) return;
    float v = clampf(value, d[(size_t) i].min, d[(size_t) i].max); if (!d[(size_t) i].opts.empty()) v = std::round(v);
    d_->vals[(size_t) i].store(v);
}
float Synth::param(int i) const { return i >= 0 && i < (int) d_->vals.size() ? d_->vals[(size_t) i].load() : 0.f; }
void Synth::resetParams() { const auto& d = params(); for (size_t i = 0; i < d.size(); ++i) d_->vals[i].store(d[i].def); }
void Synth::process(float* left, float* right, int n) {
    for (int at = 0; at < n; at += 32) d_->block(left + at, right + at, std::min(32, n - at));
}
int Synth::activeVoices() const { int c = 0; for (int i = 0; i < kMaxVoices; ++i) c += d_->v[i].active; return c; }

bool Synth::setCustomTable(int layer, int osc, const std::vector<float>& frames, const std::string& name) {
    if (layer < 0 || layer > 1 || osc < 0 || osc > 2) return false;
    auto w = makeCustom(frames, name); if (!w) return false;
    d_->custom[layer][osc].store(w.get(), std::memory_order_release);
    d_->retire(std::shared_ptr<Wavetable>(std::move(d_->customOwn[layer][osc]))); d_->customOwn[layer][osc] = std::move(w);
    return true;
}
void Synth::clearCustomTable(int layer, int osc) {
    if (layer < 0 || layer > 1 || osc < 0 || osc > 2 || !d_->customOwn[layer][osc]) return;
    d_->custom[layer][osc].store(nullptr, std::memory_order_release); d_->retire(std::shared_ptr<Wavetable>(std::move(d_->customOwn[layer][osc])));
}
bool Synth::customTable(int layer, int osc, std::vector<float>* frames, std::string* name) const {
    if (layer < 0 || layer > 1 || osc < 0 || osc > 2 || !d_->customOwn[layer][osc]) return false;
    if (frames) *frames = d_->customOwn[layer][osc]->src;
    if (name) *name = d_->customOwn[layer][osc]->name;
    return true;
}

/* ---------- Sample mode's sounds ---------- */
bool Synth::setSample(int layer, int osc, const std::vector<float>& left, const std::vector<float>& right, double rate, const std::string& name) {
    if (layer < 0 || layer > 1 || osc < 0 || osc > 2 || left.size() < 16 || rate < 1000) return false;
    const size_t n = std::min(left.size(), (size_t) (rate * 30));   // up to 30 s
    auto sd = std::make_shared<SampleData>(); sd->name = name; sd->rate = rate; sd->L.assign(left.begin(), left.begin() + (ptrdiff_t) n);
    if (right.size() >= n) sd->R.assign(right.begin(), right.begin() + (ptrdiff_t) n);
    d_->smp[layer][osc].store(sd.get(), std::memory_order_release);
    d_->retire(d_->smpOwn[layer][osc]); d_->smpOwn[layer][osc] = sd;
    return true;
}
void Synth::clearSample(int layer, int osc) {
    if (layer < 0 || layer > 1 || osc < 0 || osc > 2 || !d_->smpOwn[layer][osc]) return;
    d_->smp[layer][osc].store(nullptr, std::memory_order_release); d_->retire(d_->smpOwn[layer][osc]); d_->smpOwn[layer][osc].reset();
}
bool Synth::sample(int layer, int osc, std::vector<float>* l, std::vector<float>* r, double* rate, std::string* name) const {
    if (layer < 0 || layer > 1 || osc < 0 || osc > 2 || !d_->smpOwn[layer][osc]) return false;
    const auto& sd = *d_->smpOwn[layer][osc];
    if (l) *l = sd.L; if (r) *r = sd.R; if (rate) *rate = sd.rate; if (name) *name = sd.name;
    return true;
}

/* ---------- modulation ---------- */
static int sourceIndex(const std::string& s) { const auto& v = modSources(); for (size_t i = 0; i < v.size(); ++i) if (v[i] == s) return (int) i; return -1; }
void Synth::setMods(const std::vector<ModRoute>& in) {
    std::lock_guard<std::mutex> g(d_->msgLock);
    d_->modList.clear(); const int w = 1 - d_->rCur.load(); int n = 0; const auto& d = params();
    for (const auto& r : in) {
        const int s = sourceIndex(r.src), t = paramIndex(r.dst);
        if (s < 0 || t < 0 || !d[(size_t) t].opts.empty() || d_->isOpt[(size_t) t] || (r.dst.rfind("l1.", 0) != 0 && r.dst.rfind("l2.", 0) != 0) || n >= kMaxRoutes) continue;   // what a voice plays
        const float a = clampf(r.amt, -1, 1); d_->modList.push_back({ r.src, r.dst, a }); d_->routes[w][n++] = { s, t, a };
    }
    d_->nRoutes[w] = n; d_->rCur.store(w, std::memory_order_release);
}
std::vector<ModRoute> Synth::mods() const { std::lock_guard<std::mutex> g(d_->msgLock); return d_->modList; }
void Synth::setLfoShape(int l, const std::vector<float>& xyc) {
    if (l < 0 || l >= kLfos) return;
    std::vector<float> p; float lastX = 0;   // x rising from 0 to 1, y 0..1, curve -1..1
    for (size_t i = 0; i + 2 < xyc.size() && p.size() < 3 * 64; i += 3) { const float x = clampf(std::max(lastX, xyc[i]), 0, 1); p.insert(p.end(), { x, clampf(xyc[i + 1], 0, 1), clampf(xyc[i + 2], -1, 1) }); lastX = x; }
    if (p.size() < 6) return;
    p[0] = 0; p[p.size() - 3] = 1;
    std::lock_guard<std::mutex> g(d_->msgLock);
    d_->lfoPts[l] = p; const int w = 1 - d_->lfoCur[l].load(); drawnTable(p, d_->lfoTab[l][w]); d_->lfoCur[l].store(w, std::memory_order_release);
}
std::vector<float> Synth::lfoShape(int l) const { if (l < 0 || l >= kLfos) return {}; std::lock_guard<std::mutex> g(d_->msgLock); return d_->lfoPts[l]; }
void Synth::setMacroName(int i, const std::string& n) { if (i < 0 || i >= kMacros) return; std::lock_guard<std::mutex> g(d_->msgLock); d_->macroNames[i] = n.empty() ? "Macro " + std::to_string(i + 1) : n.substr(0, 40); }
std::string Synth::macroName(int i) const { if (i < 0 || i >= kMacros) return {}; std::lock_guard<std::mutex> g(d_->msgLock); return d_->macroNames[i]; }
void Synth::setTempo(double bpm) { d_->bpm = bpm > 0 ? bpm : 120; }
void Synth::setAftertouch(float v) { d_->aftertouch = clampf(v, 0, 1); }
float Synth::sourceValue(const std::string& s) const { const int i = sourceIndex(s); return i < 0 ? 0.f : d_->shown[i].load(std::memory_order_relaxed); }

/* imported tables go into the .hsyn as 16-bit samples, base64 */
static const char* kB64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
static std::string b64(const std::vector<uint8_t>& in) {
    std::string o; o.reserve((in.size() + 2) / 3 * 4);
    for (size_t i = 0; i < in.size(); i += 3) { const uint32_t v = (uint32_t) in[i] << 16 | (i + 1 < in.size() ? (uint32_t) in[i + 1] << 8 : 0) | (i + 2 < in.size() ? in[i + 2] : 0);
        o += kB64[v >> 18 & 63]; o += kB64[v >> 12 & 63]; o += i + 1 < in.size() ? kB64[v >> 6 & 63] : '='; o += i + 2 < in.size() ? kB64[v & 63] : '='; }
    return o;
}
static std::vector<uint8_t> unb64(const std::string& s) {
    int rev[256]; for (int& r : rev) r = -1; for (int i = 0; i < 64; ++i) rev[(unsigned char) kB64[i]] = i;
    std::vector<uint8_t> o; uint32_t acc = 0; int bits = 0;
    for (char c : s) { const int v = rev[(unsigned char) c]; if (v < 0) continue; acc = acc << 6 | (uint32_t) v; bits += 6; if (bits >= 8) { bits -= 8; o.push_back((uint8_t) (acc >> bits & 255)); } }
    return o;
}

static std::string jsonStr(const std::string& s) {
    std::string o = "\""; for (char c : s) { if (c == '"' || c == '\\') { o += '\\'; o += c; } else if ((unsigned char) c < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); o += b; } else o += c; } return o + "\"";
}
std::string Synth::presetJson(const std::string& name, const std::string& category) const {
    std::string s = "{\"format\":\"hsyn\",\"v\":1,\"name\":" + jsonStr(name) + ",\"category\":" + jsonStr(category) + ",\"params\":{";
    const auto& d = params();
    for (size_t i = 0; i < d.size(); ++i) { char b[64]; std::snprintf(b, sizeof b, "%.7g", (double) d_->vals[i].load()); s += (i ? "," : "") + jsonStr(d[i].id) + ":" + b; }
    s += "}";
    std::string tabs;
    for (int L = 0; L < 2; ++L) for (int k = 0; k < 3; ++k) {
        std::vector<float> fr; std::string nm; if (!customTable(L, k, &fr, &nm)) continue;
        float pk = 0; for (float v : fr) pk = std::max(pk, std::fabs(v)); const float g = pk > 1e-9f ? 32767.f / pk : 1;
        std::vector<uint8_t> raw(fr.size() * 2); for (size_t i = 0; i < fr.size(); ++i) { const int16_t q = (int16_t) std::lround(clampf(fr[i] * g, -32767, 32767)); raw[i * 2] = (uint8_t) (q & 255); raw[i * 2 + 1] = (uint8_t) ((uint16_t) q >> 8); }
        char key[16]; std::snprintf(key, sizeof key, "l%d.o%d", L + 1, k + 1);
        char sc[32]; std::snprintf(sc, sizeof sc, "%.9g", (double) (pk > 1e-9f ? pk : 1.f));
        tabs += (tabs.empty() ? "" : ",") + jsonStr(key) + ":{\"name\":" + jsonStr(nm) + ",\"frames\":" + std::to_string(fr.size() / kTab) + ",\"scale\":" + sc + ",\"pcm16\":\"" + b64(raw) + "\"}";
    }
    if (!tabs.empty()) s += ",\"tables\":{" + tabs + "}";
    /* Sample mode's sounds: 16-bit, base64, the channels one after the other */
    std::string sms;
    for (int L = 0; L < 2; ++L) for (int k = 0; k < 3; ++k) {
        std::vector<float> l, r; double rate = 0; std::string nm; if (!sample(L, k, &l, &r, &rate, &nm)) continue;
        float pk = 0; for (float v : l) pk = std::max(pk, std::fabs(v)); for (float v : r) pk = std::max(pk, std::fabs(v)); const float g = pk > 1e-9f ? 32767.f / pk : 1;
        std::vector<uint8_t> raw((l.size() + r.size()) * 2); size_t o = 0;
        for (const auto* ch : { &l, &r }) for (float v : *ch) { const int16_t q = (int16_t) std::lround(clampf(v * g, -32767, 32767)); raw[o++] = (uint8_t) (q & 255); raw[o++] = (uint8_t) ((uint16_t) q >> 8); }
        char key[16]; std::snprintf(key, sizeof key, "l%d.o%d", L + 1, k + 1); char nb[96];
        std::snprintf(nb, sizeof nb, ",\"rate\":%.10g,\"frames\":%zu,\"ch\":%d,\"scale\":%.9g", rate, l.size(), r.empty() ? 1 : 2, (double) (pk > 1e-9f ? pk : 1.f));
        sms += (sms.empty() ? "" : ",") + jsonStr(key) + ":{\"name\":" + jsonStr(nm) + nb + ",\"pcm16\":\"" + b64(raw) + "\"}";
    }
    if (!sms.empty()) s += ",\"samples\":{" + sms + "}";
    /* modulation: routes, drawn LFO shapes, macro names */
    char b[48]; std::string m;
    for (const auto& r : mods()) { std::snprintf(b, sizeof b, "%.5g", (double) r.amt); m += (m.empty() ? "" : ",") + std::string("{\"src\":") + jsonStr(r.src) + ",\"dst\":" + jsonStr(r.dst) + ",\"amt\":" + b + "}"; }
    s += ",\"mods\":[" + m + "],\"lfoShapes\":{";
    for (int l = 0; l < kLfos; ++l) { s += (l ? "," : "") + std::string("\"lfo") + std::to_string(l + 1) + "\":[";
        const auto pts = lfoShape(l); for (size_t i = 0; i < pts.size(); ++i) { std::snprintf(b, sizeof b, "%s%.4g", i ? "," : "", (double) pts[i]); s += b; } s += "]"; }
    s += "},\"macroNames\":[";
    for (int i = 0; i < kMacros; ++i) s += (i ? "," : "") + jsonStr(macroName(i));
    return s + "]}";
}
bool Synth::loadPreset(const std::string& json, std::string* error, std::string* name, std::string* category) {
    const Json j = Json::parse(json.data(), json.size());
    if (j["format"].str() != "hsyn") { if (error) *error = "not a HyperSynth preset (.hsyn)"; return false; }
    const Json& ps = j["params"]; const auto& d = params();
    for (size_t i = 0; i < d.size(); ++i) {
        const Json& v = ps[d[i].id.c_str()];
        setParam((int) i, v.type == Json::Num ? (float) v.n : d[i].old);   // missing: the value it had before this parameter existed
    }
    const Json& tj = j["tables"];   // imported wavetables (a preset without them has none)
    for (int L = 0; L < 2; ++L) for (int k = 0; k < 3; ++k) {
        char key[16]; std::snprintf(key, sizeof key, "l%d.o%d", L + 1, k + 1); const Json& t = tj[key];
        if (t.type != Json::Obj) { clearCustomTable(L, k); continue; }
        const auto raw = unb64(t["pcm16"].str()); std::vector<float> fr(raw.size() / 2);
        const float scale = t["scale"].type == Json::Num ? (float) t["scale"].n : 1.f;
        for (size_t i = 0; i < fr.size(); ++i) fr[i] = (float) (int16_t) ((uint16_t) raw[i * 2] | (uint16_t) raw[i * 2 + 1] << 8) / 32767.f * scale;
        fr.resize(fr.size() / kTab * kTab);
        if (fr.empty() || !setCustomTable(L, k, fr, t["name"].str())) clearCustomTable(L, k);
    }
    const Json& sj = j["samples"];   // Sample mode's sounds (a preset without them has none)
    for (int L = 0; L < 2; ++L) for (int k = 0; k < 3; ++k) {
        char key[16]; std::snprintf(key, sizeof key, "l%d.o%d", L + 1, k + 1); const Json& t = sj[key];
        if (t.type != Json::Obj) { clearSample(L, k); continue; }
        const auto raw = unb64(t["pcm16"].str()); const size_t fr = (size_t) t["frames"].num(0); const int ch = t["ch"].num(1) > 1.5 ? 2 : 1;
        const float scale = (float) t["scale"].num(1);
        if (fr == 0 || raw.size() < fr * (size_t) ch * 2) { clearSample(L, k); continue; }
        std::vector<float> l(fr), r(ch == 2 ? fr : 0);
        auto at = [&](size_t i) { return (float) (int16_t) ((uint16_t) raw[i * 2] | (uint16_t) raw[i * 2 + 1] << 8) / 32767.f * scale; };
        for (size_t i = 0; i < fr; ++i) l[i] = at(i); for (size_t i = 0; i < r.size(); ++i) r[i] = at(fr + i);
        if (!setSample(L, k, l, r, t["rate"].num(48000), t["name"].str())) clearSample(L, k);
    }
    /* modulation (a preset from before it has none: nothing moves, as it was) */
    std::vector<ModRoute> routes;
    if (j["mods"].type == Json::Arr) for (const auto& r : j["mods"].a) routes.push_back({ r["src"].str(), r["dst"].str(), (float) r["amt"].num(0) });
    setMods(routes);
    for (int l = 0; l < kLfos; ++l) { char key[8]; std::snprintf(key, sizeof key, "lfo%d", l + 1); const Json& sj = j["lfoShapes"][key];
        std::vector<float> pts; if (sj.type == Json::Arr) for (const auto& x : sj.a) pts.push_back((float) x.num(0));
        setLfoShape(l, pts.size() >= 6 ? pts : std::vector<float> { 0, 0, 0, .5f, 1, 0, 1, 0, 0 }); }
    for (int i = 0; i < kMacros; ++i) setMacroName(i, j["macroNames"].type == Json::Arr && (size_t) i < j["macroNames"].a.size() ? j["macroNames"].a[(size_t) i].str() : std::string());
    if (name) *name = j["name"].str();
    if (category) *category = j["category"].str();
    return true;
}

} // namespace hs
} // namespace visu
