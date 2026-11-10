// HyperSynth's sound engine (see Synth.h).
#include "Synth.h"
#include "Json.h"
#include <algorithm>
#include <cmath>
#include <chrono>
#include <complex>
#include <cstdio>
#include <cstring>

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
    const size_t W = std::min<size_t>(n / 2, 8192), mid = n / 2 - W / 2; const int minP = std::max(2, (int) (sr / 2000)), maxP = std::min((int) W - 1, (int) (sr / 25));
    std::vector<double> d((size_t) maxP + 2, 0.0); double run = 0; double period = 0;
    for (int tau = 1; tau <= maxP; ++tau) { double s2 = 0; for (size_t i = 0; i + (size_t) tau < W; ++i) { const double e = x[mid + i] - x[mid + i + (size_t) tau]; s2 += e * e; } run += s2; d[(size_t) tau] = run > 0 ? s2 * tau / run : 1; }
    for (int tau = minP; tau < maxP; ++tau) if (d[(size_t) tau] < .15 && d[(size_t) tau] <= d[(size_t) tau + 1]) {
        const double a = d[(size_t) tau - 1], b = d[(size_t) tau], c = d[(size_t) tau + 1], den = a - 2 * b + c; period = tau + (std::fabs(den) > 1e-12 ? .5 * (a - c) / den : 0); break; }
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

/* ---------- voices ---------- */
struct OscState { double ph[Synth::kMaxUnison] = {}, phm[Synth::kMaxUnison] = {}; };
struct LayerVoice { OscState o[3]; double subPh = 0; Env aenv, fenv; Svf hp[2], lp1[2], lp2[2]; };
struct Voice {
    bool active = false, gate = false, held = false; int key = 60; float vel = 1; uint64_t age = 0;
    float fade = 1, fadeStep = 0;     // a voice taken for a new note fades out (fadeStep > 0) instead of stopping dead
    double pitch = 60, target = 60;   // glides from pitch to target
    LayerVoice L[2];
};

/* per-layer parameter indices, found once */
struct OscIdx { int on, mode, shape, pw, table, wtsrc, pos, ratio, fm, oct, semi, fine, level, pan, voices, detune, spread, blend, phase; };
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
    std::vector<std::pair<std::unique_ptr<Wavetable>, std::chrono::steady_clock::time_point>> retired;
    void retire(std::unique_ptr<Wavetable> w) {
        const auto now = std::chrono::steady_clock::now();
        retired.erase(std::remove_if(retired.begin(), retired.end(), [&](auto& r) { return now - r.second > std::chrono::seconds(3); }), retired.end());
        if (w) retired.emplace_back(std::move(w), now);
    }
    inline float rand01() { rnd ^= rnd << 13; rnd ^= rnd >> 17; rnd ^= rnd << 5; return (float) (rnd & 0xffffff) / 16777216.f; }

    Impl() : vals(params().size()) {
        const auto& d = params(); p.resize(d.size()); sm.resize(d.size()); isOpt.resize(d.size());
        for (size_t i = 0; i < d.size(); ++i) { vals[i].store(d[i].def); p[i] = sm[i] = d[i].def; isOpt[i] = !d[i].opts.empty() || d[i].id.find("voices") != std::string::npos || d[i].id.find(".oct") != std::string::npos; }
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
                q.spread = I(o + "spread"); q.blend = I(o + "blend"); q.phase = I(o + "phase"); }
        }
        tables();   // build the wavetables now, not on the first note
    }
    float P(int i) const { return p[(size_t) i]; }
    float V(int i) const { return vals[(size_t) i].load(std::memory_order_relaxed); }   // the live setting (notes can arrive before the next block)

    void startLayer(Voice& vo, int L, bool retrig) {
        LayerVoice& lv = vo.L[L];
        if (retrig) for (int k = 0; k < 3; ++k) { const bool reset = V(li[L].o[k].phase) > .5f;
            for (int u = 0; u < kMaxUnison; ++u) { lv.o[k].ph[u] = reset ? 0 : rand01(); lv.o[k].phm[u] = 0; } }
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
        } else {
            stack.erase(std::remove(stack.begin(), stack.end(), key), stack.end()); stack.push_back(key);
            Voice& vo = v[0]; const bool legato = mode == 2 && vo.active && vo.gate;
            vo.key = key; vo.vel = legato ? vo.vel : vel; vo.target = key; vo.age = ++clock;
            if (!vo.active) vo.pitch = (V(iGlide) > 0 && glideFrom >= 0) ? glideFrom : key;
            vo.active = true; vo.gate = true; vo.held = false;
            for (int L = 0; L < 2; ++L) startLayer(vo, L, !legato);
        }
        lastPitch = key;
    }
    void release(Voice& vo) { vo.gate = false; for (auto& l : vo.L) { l.aenv.off(); l.fenv.off(); } }
    void noteOff(int key) {
        const int mode = (int) std::lround(V(iMode));
        if (mode == 0) { for (auto& vo : v) if (vo.active && vo.gate && vo.key == key) { if (sustain) vo.held = true; else release(vo); } return; }
        stack.erase(std::remove(stack.begin(), stack.end(), key), stack.end());
        Voice& vo = v[0]; if (!vo.active || vo.key != key) return;
        if (!stack.empty()) { vo.key = stack.back(); vo.target = vo.key; lastPitch = vo.key; if (mode == 1) for (int L = 0; L < 2; ++L) startLayer(vo, L, true); }
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
        for (auto& vo : v) {
            if (!vo.active) continue;
            vo.pitch += (vo.target - vo.pitch) * gk;
            const float f0 = vo.fade, f1 = std::max(0.f, vo.fade - vo.fadeStep * (float) n);
            bool alive = false;
            for (int L = 0; L < 2; ++L) {
                if (lg[L] <= 0) { if (vo.L[L].aenv.stage) { vo.L[L].aenv.stage = 0; vo.L[L].aenv.v = 0; } continue; }
                alive |= layer(vo, L, lg[L] * master, vo.pitch + bendSt + vibSt, outL, outR, n, f0, f1);
            }
            vo.fade = f1;
            if (!alive || (vo.fadeStep > 0 && f1 <= 0)) { vo.active = false; vo.fadeStep = 0; vo.fade = 1; }
        }
    }
    // one layer of one voice; false when it has gone quiet
    bool layer(Voice& vo, int L, float gain, double pitch, float* outL, float* outR, int n, float f0 = 1, float f1 = 1) {
        const LayerIdx& x = li[L]; LayerVoice& lv = vo.L[L];
        if (!lv.aenv.stage) return false;
        float bufL[32], bufR[32]; std::fill(bufL, bufL + n, 0.f); std::fill(bufR, bufR + n, 0.f);
        const auto& tabs = tables();
        for (int k = 0; k < 3; ++k) {
            const OscIdx& q = x.o[k]; if (P(q.on) < .5f) continue;
            const int mode = (int) std::lround(P(q.mode)); const float lvl = P(q.level); if (lvl <= 0) continue;
            if (mode == MSpectrum || mode == MSample) continue;   // coming with step 3 of the roadmap
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
            if (mode == MNoise) { for (int i = 0; i < n; ++i) { const float s = rand01() * 2 - 1; bufL[i] += s * gl[0]; bufR[i] += s * gr[0]; } continue; }
            if (mode == MAnalog) {
                const int sh = (int) std::lround(P(q.shape)); const double pw = P(q.pw);
                for (int u = 0; u < U; ++u) { double ph = os.ph[u]; const double d = dt[u]; const float a = gl[u], b = gr[u];
                    for (int i = 0; i < n; ++i) {
                        double s;
                        if (sh == 0) s = 2 * ph - 1 - blep(ph, d);
                        else if (sh == 1) { double t2 = ph + (1 - pw); t2 -= std::floor(t2); s = (ph < pw ? 1 : -1) + blep(ph, d) - blep(t2, d); }
                        else if (sh == 2) s = 1 - 4 * std::fabs(ph - .5);
                        else s = std::sin(2 * kPi * ph);
                        ph += d; if (ph >= 1) ph -= 1;
                        bufL[i] += (float) s * a; bufR[i] += (float) s * b;
                    }
                    os.ph[u] = ph; }
            } else if (mode == MWave) {
                const Wavetable* own = P(q.wtsrc) > .5f ? custom[L][k].load(std::memory_order_acquire) : nullptr;
                const Wavetable& tb = own ? *own : tabs[(size_t) std::min((int) tabs.size() - 1, std::max(0, (int) std::lround(P(q.table))))];
                const double fp = P(q.pos) * (tb.frames - 1); const int f0 = std::min(tb.frames - 2, (int) fp); const float ff = (float) (fp - f0);
                double maxDt = 0; for (int u = 0; u < U; ++u) maxDt = std::max(maxDt, dt[u]);
                const int m = mipFor(maxDt * 1.06);   // a little headroom for vibrato and bends
                const float* A = tb.data.data() + (size_t) f0 * kFrame + mipOff(m); const float* B = A + kFrame; const int len = mipLen(m);
                for (int u = 0; u < U; ++u) { double ph = os.ph[u]; const double d = dt[u]; const float a = gl[u], b = gr[u];
                    for (int i = 0; i < n; ++i) { const float s = tabRead(A, ph, len) * (1 - ff) + tabRead(B, ph, len) * ff; ph += d; if (ph >= 1) ph -= 1; bufL[i] += s * a; bufR[i] += s * b; }
                    os.ph[u] = ph; }
            } else if (mode == MFm) {
                const double ratio = P(q.ratio), idx = P(q.fm) * 8;
                for (int u = 0; u < U; ++u) { double ph = os.ph[u], pm = os.phm[u]; const double d = dt[u], dm = dt[u] * ratio; const float a = gl[u], b = gr[u];
                    for (int i = 0; i < n; ++i) { const float s = (float) std::sin(2 * kPi * ph + idx * std::sin(2 * kPi * pm)); ph += d; if (ph >= 1) ph -= 1; pm += dm; pm -= std::floor(pm); bufL[i] += s * a; bufR[i] += s * b; }
                    os.ph[u] = ph; os.phm[u] = pm; }
            }
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
    for (auto& vo : d_->v) { if (hard) { vo.active = false; vo.fade = 1; vo.fadeStep = 0; for (auto& l : vo.L) { l.aenv = Env(); l.fenv = Env(); } } else d_->release(vo); vo.held = false; }
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
    d_->retire(std::move(d_->customOwn[layer][osc])); d_->customOwn[layer][osc] = std::move(w);
    return true;
}
void Synth::clearCustomTable(int layer, int osc) {
    if (layer < 0 || layer > 1 || osc < 0 || osc > 2 || !d_->customOwn[layer][osc]) return;
    d_->custom[layer][osc].store(nullptr, std::memory_order_release); d_->retire(std::move(d_->customOwn[layer][osc]));
}
bool Synth::customTable(int layer, int osc, std::vector<float>* frames, std::string* name) const {
    if (layer < 0 || layer > 1 || osc < 0 || osc > 2 || !d_->customOwn[layer][osc]) return false;
    if (frames) *frames = d_->customOwn[layer][osc]->src;
    if (name) *name = d_->customOwn[layer][osc]->name;
    return true;
}

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
    return s + "}";
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
    if (name) *name = j["name"].str();
    if (category) *category = j["category"].str();
    return true;
}

} // namespace hs
} // namespace visu
