#include "Fx.h"
#include "Library.h"
#include <algorithm>
#include <cmath>
#include <complex>
#include <cstring>
#include <functional>
#include <map>

namespace visu {
namespace fx {

static const double kPi = 3.14159265358979323846;
static inline float clampf(float v, float a, float b) { return v < a ? a : v > b ? b : v; }
static inline float dbg(float db) { return std::pow(10.f, db / 20.f); }
static inline float logF(float pct, float lo, float hi) { return lo * std::pow(hi / lo, clampf(pct / 100.f, 0, 1)); }
static double hash01(double n) { double x = std::sin(n * 127.1 + 311.7) * 43758.5453; return x - std::floor(x); }

void Stereo::clear(int n) { std::memset(l, 0, sizeof(float) * (size_t) n); std::memset(r, 0, sizeof(float) * (size_t) n); }
void Stereo::add(const Stereo& o, int n, float g) { for (int i = 0; i < n; ++i) { l[i] += o.l[i] * g; r[i] += o.r[i] * g; } }

/* ================= small DSP parts ================= */
struct Noise { uint32_t s = 22222; float next() { s ^= s << 13; s ^= s >> 17; s ^= s << 5; return (float) ((double) s / 2147483648.0 - 1.0); } };

// Biquad with Web Audio semantics (low/high-pass Q in dB, others linear, shelves fixed slope)
struct Biquad {
    enum T { LP, HP, BP, Notch, Peak, LowShelf, HighShelf, AllPass } type = LP;
    double b0 = 1, b1 = 0, b2 = 0, a1 = 0, a2 = 0, x1[2] = {}, x2[2] = {}, y1[2] = {}, y2[2] = {};
    float f = -1, q = -1, g = -99; T lastT = LP;
    void set(T t, float freq, float Q, float gainDb, double sr) {
        if (t == lastT && freq == f && Q == q && gainDb == g) return;
        type = lastT = t; f = freq; q = Q; g = gainDb;
        const double nyq = sr / 2, fr = std::min<double>(std::max<double>(freq, 1.0), nyq * .999), w0 = 2 * kPi * fr / sr, cw = std::cos(w0), sw = std::sin(w0);
        const double A = std::pow(10.0, gainDb / 40.0);
        double B0, B1, B2, A0, A1, A2;
        if (t == LP || t == HP) {
            const double Qd = std::pow(10.0, Q / 20.0), alpha = sw / (2 * Qd);
            if (t == LP) { B0 = (1 - cw) / 2; B1 = 1 - cw; B2 = (1 - cw) / 2; } else { B0 = (1 + cw) / 2; B1 = -(1 + cw); B2 = (1 + cw) / 2; }
            A0 = 1 + alpha; A1 = -2 * cw; A2 = 1 - alpha;
        } else if (t == BP || t == Notch || t == AllPass || t == Peak) {
            const double alpha = sw / (2 * std::max(1e-4, (double) Q));
            if (t == BP) { B0 = alpha; B1 = 0; B2 = -alpha; A0 = 1 + alpha; A1 = -2 * cw; A2 = 1 - alpha; }
            else if (t == Notch) { B0 = 1; B1 = -2 * cw; B2 = 1; A0 = 1 + alpha; A1 = -2 * cw; A2 = 1 - alpha; }
            else if (t == AllPass) { B0 = 1 - alpha; B1 = -2 * cw; B2 = 1 + alpha; A0 = 1 + alpha; A1 = -2 * cw; A2 = 1 - alpha; }
            else { B0 = 1 + alpha * A; B1 = -2 * cw; B2 = 1 - alpha * A; A0 = 1 + alpha / A; A1 = -2 * cw; A2 = 1 - alpha / A; }
        } else {
            const double alpha = sw / 2 * std::sqrt(2.0), sa = 2 * std::sqrt(A) * alpha;
            if (t == LowShelf) { B0 = A * ((A + 1) - (A - 1) * cw + sa); B1 = 2 * A * ((A - 1) - (A + 1) * cw); B2 = A * ((A + 1) - (A - 1) * cw - sa);
                                 A0 = (A + 1) + (A - 1) * cw + sa; A1 = -2 * ((A - 1) + (A + 1) * cw); A2 = (A + 1) + (A - 1) * cw - sa; }
            else { B0 = A * ((A + 1) + (A - 1) * cw + sa); B1 = -2 * A * ((A - 1) + (A + 1) * cw); B2 = A * ((A + 1) + (A - 1) * cw - sa);
                   A0 = (A + 1) - (A - 1) * cw + sa; A1 = 2 * ((A - 1) - (A + 1) * cw); A2 = (A + 1) - (A - 1) * cw - sa; }
        }
        b0 = B0 / A0; b1 = B1 / A0; b2 = B2 / A0; a1 = A1 / A0; a2 = A2 / A0;
    }
    inline float run(int c, float x) {
        const double y = b0 * x + b1 * x1[c] + b2 * x2[c] - a1 * y1[c] - a2 * y2[c];
        x2[c] = x1[c]; x1[c] = x; y2[c] = y1[c]; y1[c] = y; return (float) y;
    }
};

struct DelayLine {
    std::vector<float> b; int mask = 0, w = 0;
    void init(int maxFrames) { int n = 1; while (n < maxFrames + 4) n <<= 1; b.assign((size_t) n, 0.f); mask = n - 1; w = 0; }
    inline void push(float x) { b[(size_t) w] = x; w = (w + 1) & mask; }
    inline float read(float d) const {   // d frames back (>= 1)
        const float p = (float) w - 1 - d; const int i = (int) std::floor(p); const float f = p - (float) i;
        return b[(size_t) (i & mask)] * (1 - f) + b[(size_t) ((i + 1) & mask)] * f;
    }
};

// Same curves as the Maker (shaperCurve), including the level compensation.
struct Shaper {
    float t[2048]; int type = -1; float drive = -1;
    void set(int ty, float d) {
        if (ty == type && std::fabs(d - drive) < .01f) return; type = ty; drive = d;
        const int n = 2048; const float k = 1 + d * 30;
        for (int i = 0; i < n; ++i) {
            const float x = (float) i / (n - 1) * 2 - 1; float y;
            if (ty == 0) y = std::tanh(k * x + .2f * k * x * x) / std::tanh(k);
            else if (ty == 1) y = std::atan(k * x) / std::atan(k);
            else if (ty == 2) y = clampf(x * k, -1, 1);
            else if (ty == 3) { float z = x * (1 + d * 6); while (std::fabs(z) > 1) z = z > 0 ? 2 - z : -2 - z; y = z; }
            else if (ty == 4) y = (x < 0 ? -1.f : 1.f) * (1 - std::exp(-std::fabs(x) * k * 2)) * (x < 0 ? .85f : 1.f);
            // the rest come from EmulonX's distortion types
            else if (ty == 5) { const float z = clampf(x * k * .5f, -1.5f, 1.5f); y = z - z * z * z / 6.75f; }            // soft clip (cubic)
            else if (ty == 6) { const float q = std::max(2.f, 32 - d * 30); y = std::round(x * k * .3f * q) / q; y = clampf(y, -1, 1); }   // bitcrush
            else if (ty == 7) { const float z = std::tanh(x * k * .5f); y = .75f * std::fabs(z) + .25f * z; }     // rectify (keeps a little of the original; silent stays silent)
            else if (ty == 8) y = std::sin(x * (1 + d * 8) * (float) kPi / 2);                                     // sine shaper
            else y = x >= 0 ? std::tanh(x * k) : std::tanh(x * k * .25f) * .6f;                                 // diode: one side clips hard
            t[i] = y;
        }
        const int m = n >> 1; const float slope = std::fabs((t[m + 1] - t[m - 1]) / (4.f / (n - 1))), comp = 1 / std::sqrt(std::max(1.f, slope));
        for (float& v : t) v *= comp;
    }
    inline float run(float x) const { const float p = (clampf(x, -1, 1) + 1) * .5f * 2047; const int i = std::min(2046, (int) p); const float f = p - (float) i; return t[i] * (1 - f) + t[i + 1] * f; }
};

struct Lfo { double ph = 0; inline float sine(double hz, double sr) { ph += hz / sr; ph -= std::floor(ph); return (float) std::sin(2 * kPi * ph); }
    inline float tri(double hz, double sr) { ph += hz / sr; ph -= std::floor(ph); return (float) (1 - std::fabs(ph * 4 - 2)); }
    inline float sq(double hz, double sr) { ph += hz / sr; ph -= std::floor(ph); return ph < .5 ? 1.f : -1.f; } };

struct Follower { float v = 0; inline float run(float x, float a, float r) { const float ax = std::fabs(x); v += (ax > v ? a : r) * (ax - v); return v; } };

static inline void panStereo(float pan, float& l, float& r) {   // Web Audio StereoPanner on a stereo signal
    const float x = pan <= 0 ? pan + 1 : pan, gl = std::cos(x * (float) kPi / 2), gr = std::sin(x * (float) kPi / 2);
    if (pan <= 0) { const float L = l + r * gl, R = r * gr; l = L; r = R; } else { const float L = l * gl, R = r + l * gr; l = L; r = R; }
}

/* ================= nodes ================= */
struct ParamInfo { std::string key; float min = 0, max = 1, raw = 0, real = 0; bool opt = false, sync = false, known = false, log = false; int tag = -1; };
struct ModLink { int param; int src; float amt; };
struct Cable { int src; std::string srcPort; std::string dstPort; };

class Module {
public:
    virtual ~Module() {}
    virtual void prepare(double sr) { sr_ = sr; }
    virtual void run(Node& nd, int n, Control& c) = 0;
protected:
    double sr_ = 44100;
};

struct Node {
    std::string id, type; bool bypass = false, raw = false, isMod = false, io = false, supported = true;
    std::vector<ParamInfo> params;
    std::vector<std::string> inNames, outNames;
    std::vector<Stereo> ins, outs;          // outs[0..] in outNames order
    Stereo wet;                            // effect output before the dry/wet stage
    std::vector<Cable> incoming;            // audio
    std::vector<ModLink> mods;              // control
    std::unique_ptr<Module> mod;
    float modValue = .5f, mixPrev = -1, wetPrev = -1; double randCur = .5, randStep = -1;
    int byTag = -1; bool byInv = false, byTails = false; Stereo hold;   // bypass follows a tag (a button on the interface)
    std::string sampleRef, tagRef;          // convolution impulse, macro tag
    int idx(const char* k) const { for (size_t i = 0; i < params.size(); ++i) if (params[i].key == k) return (int) i; return -1; }
    float P(int i, float def = 0) const { return i < 0 ? def : params[(size_t) i].real; }
    Stereo& in(const char* name) { for (size_t i = 0; i < inNames.size(); ++i) if (inNames[i] == name) return ins[i]; return ins[0]; }
    Stereo* outPort(const std::string& name) { for (size_t i = 0; i < outNames.size(); ++i) if (outNames[i] == name) return &outs[i]; return nullptr; }
};

#define PI_(k) int k##_ = -1
#define BIND(nd, k) k##_ = nd.idx(#k)

/* ---------- time ---------- */
struct DelayM : Module {   // modes: stereo, ping-pong, tape (wobble + saturation), diffuse (smeared repeats) - from EmulonX
    DelayLine dl, dr; Biquad lp; int time_, fb_, tone_, pp_; float t = -1;
    Lfo w1, w2; Shaper sat; DelayLine ap[2][4]; static constexpr int AP[4] = { 142, 107, 379, 277 };
    explicit DelayM(Node& nd) { time_ = nd.idx("time"); fb_ = nd.idx("fb"); tone_ = nd.idx("tone"); pp_ = nd.idx("pp"); }
    void prepare(double sr) override { Module::prepare(sr); dl.init((int) (sr * 5.1)); dr.init((int) (sr * 5.1)); for (auto& c : ap) for (int k = 0; k < 4; ++k) c[k].init((int) (AP[k] * sr / 44100) + 8); sat.set(1, .25f); }
    inline float diffuse(int c, float x) { for (int k = 0; k < 4; ++k) { const float d = (float) (AP[k] * sr_ / 44100) * (c ? 1.07f : 1.f); const float b = ap[c][k].read(d); const float w = x + b * .6f; ap[c][k].push(w); x = b - w * .6f; } return x; }
    void run(Node& nd, int n, Control&) override {
        const float target = clampf(nd.P(time_, 350) / 1000.f * (float) sr_, 1, (float) sr_ * 5);
        if (t < 0) t = target;
        const int mode = (int) std::lround(nd.P(pp_, 0));
        const float fb = std::min(.95f, nd.P(fb_, 35) / 100.f); lp.set(Biquad::LP, logF(nd.P(tone_, 60), 600, 18000) * (mode == 2 ? .55f : 1.f), .5f, 0, sr_);
        const bool pp = mode == 1; Stereo& x = nd.ins[0];
        if (mode >= 2) {
            for (int i = 0; i < n; ++i) {
                t += (target - t) * .0015f;
                float tt = t;
                if (mode == 2) tt = std::max(1.f, t + (float) ((.0025 * w1.sine(.6, sr_) + .0003 * w2.sine(6.1, sr_)) * sr_));
                float yl = lp.run(0, dl.read(tt)), yr = lp.run(1, dr.read(tt * (mode == 3 ? 1.013f : 1.f)));
                if (mode == 2) { yl = sat.run(yl); yr = sat.run(yr); } else { yl = diffuse(0, yl); yr = diffuse(1, yr); }
                dl.push(x.l[i] + yl * fb); dr.push(x.r[i] + yr * fb); nd.wet.l[i] = yl; nd.wet.r[i] = yr;
            }
            return;
        }
        for (int i = 0; i < n; ++i) {
            t += (target - t) * .0015f;
            if (!pp) {
                const float yl = lp.run(0, dl.read(t)), yr = lp.run(1, dr.read(t));
                dl.push(x.l[i] + yl * fb); dr.push(x.r[i] + yr * fb); nd.wet.l[i] = yl; nd.wet.r[i] = yr;
            } else {
                const float yl = lp.run(0, dl.read(t)), yr = lp.run(1, dr.read(t));
                dl.push((x.l[i] + x.r[i]) * .5f + yr * fb); dr.push(yl * fb); nd.wet.l[i] = yl; nd.wet.r[i] = yr;
            }
        }
    }
};

// Freeverb-style reverb with variations (hall, room, plate, 80s digital, gated, shimmer)
struct Verb {
    static constexpr int NC = 8, NA = 4;
    DelayLine comb[2][NC], ap[2][NA]; float combFilt[2][NC] = {}; int cl[NC], al[NA]; double sr = 44100;
    float scale = 1, damp = .4f, decay = 2;
    void prepare(double s) {
        sr = s; const int C[NC] = { 1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617 }, A[NA] = { 556, 441, 341, 225 };
        for (int c = 0; c < 2; ++c) { for (int i = 0; i < NC; ++i) comb[c][i].init((int) ((C[i] + 23) * s / 44100 * 2.6)); for (int i = 0; i < NA; ++i) ap[c][i].init((int) ((A[i] + 23) * s / 44100) + 4); }
        for (int i = 0; i < NC; ++i) cl[i] = C[i]; for (int i = 0; i < NA; ++i) al[i] = A[i];
    }
    inline void run(float inL, float inR, float& outL, float& outR) {
        const float in = (inL + inR) * .015f; float o[2] = { 0, 0 };
        for (int c = 0; c < 2; ++c) {
            float s = 0;
            for (int i = 0; i < NC; ++i) {
                const float len = (float) ((cl[i] + c * 23) * sr / 44100 * scale), g = (float) std::pow(10.0, -3.0 * len / (decay * sr));
                const float y = comb[c][i].read(len); combFilt[c][i] = y * (1 - damp) + combFilt[c][i] * damp;
                comb[c][i].push(in + combFilt[c][i] * std::min(g, .985f)); s += y;
            }
            for (int i = 0; i < NA; ++i) { const float len = (float) ((al[i] + c * 23) * sr / 44100); const float bo = ap[c][i].read(len); ap[c][i].push(s + bo * .5f); s = bo - s; }
            o[c] = s;
        }
        outL = o[0] * 2.2f; outR = o[1] * 2.2f;
    }
};

struct ReverbM : Module {
    Verb v; DelayLine pre[2]; std::string flav; int type_, size_, decay_, damp_, pre_, grit_, gate_, drip_, shine_;
    Follower gateF; float gateEnv = 0; double gateLeft = 0; int hold = 0; float held[2] = {};
    DelayLine shift[2]; double shPh = 0; Biquad shHp; float shFb[2] = {};
    std::vector<DelayLine> spring[2]; Biquad springLp;
    ReverbM(Node& nd, std::string f) : flav(std::move(f)) {
        type_ = nd.idx("type"); size_ = nd.idx("size"); decay_ = nd.idx("decay"); damp_ = nd.idx("damp"); pre_ = nd.idx("pre"); grit_ = nd.idx("grit"); gate_ = nd.idx("gate"); drip_ = nd.idx("drip"); shine_ = nd.idx("shine");
    }
    void prepare(double sr) override {
        Module::prepare(sr); v.prepare(sr); for (auto& p : pre) p.init((int) (sr * .25)); for (auto& s : shift) s.init((int) (sr * .2));
        for (int c = 0; c < 2; ++c) { spring[c].assign(10, DelayLine()); for (auto& d : spring[c]) d.init(64); }
    }
    void run(Node& nd, int n, Control&) override {
        std::string f = flav;
        if (f == "hall") {   // Room, Hall, Plate, Ambience, Cathedral, Spring, Shimmer (the EmulonX set)
            static const char* T[7] = { "room", "hall", "plate", "ambience", "cathedral", "spring", "shimmer" };
            f = T[std::min(6, std::max(0, (int) std::lround(nd.P(type_, 1))))];
        }
        const float size = nd.P(size_, 60) / 100.f;
        v.scale = (f == "room" ? .55f : f == "plate" ? .8f : f == "ambience" ? .35f : f == "cathedral" ? 1.5f : 1.f) * (.6f + size * .8f);
        v.decay = std::max(.1f, f == "gated" ? 2.5f : f == "ambience" ? std::min(1.2f, nd.P(decay_, 2.4f) * .4f) : f == "cathedral" ? nd.P(decay_, 2.4f) * 1.8f : nd.P(decay_, f == "spring" ? 2.2f : 2.4f));
        v.damp = f == "plate" || f == "digital" ? .1f + nd.P(damp_, 30) / 400.f : f == "cathedral" ? .03f + nd.P(damp_, 40) / 100.f * .5f : .05f + nd.P(damp_, 40) / 100.f * .8f;
        const float preD = std::max(1.f, (nd.P(pre_, 0) + (f == "cathedral" ? 25.f : 0.f)) / 1000.f * (float) sr_);
        Stereo& x = nd.ins[0];
        if (f == "spring") {
            const float drip = nd.P(drip_, 50) / 100.f, g = .55f + drip * .35f; springLp.set(Biquad::LP, 4500, 0, 0, sr_);
            for (int i = 0; i < n; ++i) {
                float o[2];
                for (int c = 0; c < 2; ++c) {
                    float s = c ? x.r[i] : x.l[i];
                    for (size_t k = 0; k < spring[c].size(); ++k) { const float d = spring[c][k].read((float) (3 + k)); const float w = s + d * g; spring[c][k].push(w); s = d - w * g; }
                    o[c] = s;
                }
                float l, r; v.run(o[0], o[1], l, r); nd.wet.l[i] = springLp.run(0, l + o[0] * .3f); nd.wet.r[i] = springLp.run(1, r + o[1] * .3f);
            }
            return;
        }
        const float shine = nd.P(shine_, 50) / 100.f; shHp.set(Biquad::HP, 900, 0, 0, sr_);
        const float gateMs = nd.P(gate_, 300); const float grit = nd.P(grit_, 50); const int holdN = 1 + (int) (grit / 25); const float q = 8 + (100 - grit) * 3.f;
        for (int i = 0; i < n; ++i) {
            float il = pre[0].read(preD), ir = pre[1].read(preD); pre[0].push(x.l[i]); pre[1].push(x.r[i]);
            if (f == "shimmer") { il += shFb[0]; ir += shFb[1]; }
            float l, r; v.run(il, ir, l, r);
            if (f == "digital") { if (++hold >= holdN) { hold = 0; held[0] = std::round(l * q) / q; held[1] = std::round(r * q) / q; } l = held[0] * .6f + l * .4f; r = held[1] * .6f + r * .4f; }
            if (f == "gated") {
                const float lv = gateF.run((x.l[i] + x.r[i]) * .5f, .02f, .0005f);
                if (lv > .01f) gateLeft = gateMs / 1000.0 * sr_;
                if (gateLeft > 0) { gateLeft -= 1; gateEnv = std::min(1.f, gateEnv + .02f); } else gateEnv = std::max(0.f, gateEnv - (float) (40.0 / sr_));
                l *= gateEnv * 1.4f; r *= gateEnv * 1.4f;
            }
            if (f == "shimmer") {   // octave up: two read heads moving at double speed, crossfaded
                const float W = (float) (sr_ * .05); shPh += 1.0 / W; shPh -= std::floor(shPh);
                for (int c = 0; c < 2; ++c) {
                    shift[c].push(c ? r : l);
                    const float d1 = (float) (1 + (1 - shPh) * W), d2 = (float) (1 + (1 - std::fmod(shPh + .5, 1.0)) * W);
                    const float g1 = (float) std::sin(kPi * shPh), g2 = (float) std::sin(kPi * std::fmod(shPh + .5, 1.0));
                    const float up = shift[c].read(d1) * g1 + shift[c].read(d2) * g2;
                    shFb[c] = shHp.run(c, up) * shine * .35f;
                }
            }
            if (f == "ambience") { l = l * .7f + il * .25f; r = r * .7f + ir * .25f; }   // mostly early energy, little tail
            nd.wet.l[i] = l; nd.wet.r[i] = r;
        }
    }
};

// Convolution with an impulse from the library (uniformly partitioned, block = partition = kBlock, no added latency)
struct ConvM : Module {
    static constexpr int N = 2 * kBlock;
    using C = std::complex<float>;
    std::vector<std::vector<C>> H[2];       // per channel, per partition: N bins
    std::vector<std::vector<C>> fdl[2];     // frequency delay line
    int pos = 0; float prevIn[2][kBlock] = {}; DelayLine pre[2]; int pre_, len_; const Library& lib; std::string ref; float lenPct = -1;
    std::vector<C> tw, acc; std::vector<int> rev;
    ConvM(Node& nd, const Library& L) : lib(L), ref(nd.sampleRef) { pre_ = nd.idx("pre"); len_ = nd.idx("len"); initFft(); acc.resize(N); }
    void initFft() { tw.resize(N / 2); for (int k = 0; k < N / 2; ++k) tw[(size_t) k] = std::polar(1.f, (float) (-2 * kPi * k / N));
        rev.resize(N); int bits = 0; while ((1 << bits) < N) ++bits; for (int i = 0; i < N; ++i) { int r = 0; for (int b = 0; b < bits; ++b) if (i & (1 << b)) r |= 1 << (bits - 1 - b); rev[(size_t) i] = r; } }
    void fft(std::vector<C>& a, bool inv) const {
        for (int i = 0; i < N; ++i) if (i < rev[(size_t) i]) std::swap(a[(size_t) i], a[(size_t) rev[(size_t) i]]);
        for (int len = 2; len <= N; len <<= 1) for (int i = 0; i < N; i += len) for (int k = 0; k < len / 2; ++k) {
            C w = tw[(size_t) (k * (N / len))]; if (inv) w = std::conj(w);
            const C u = a[(size_t) (i + k)], v = a[(size_t) (i + k + len / 2)] * w; a[(size_t) (i + k)] = u + v; a[(size_t) (i + k + len / 2)] = u - v;
        }
        if (inv) for (auto& x : a) x /= (float) N;
    }
    void load(float pct) {
        lenPct = pct; for (auto& h : H) h.clear(); for (auto& f : fdl) f.clear(); pos = 0;
        const Sample* s = nullptr; for (auto& smp : lib.samples) if (smp.id == ref) s = &smp;
        if (!s || s->frames == 0) return;
        size_t len = std::min<size_t>((size_t) (sr_ * 6), std::max<size_t>(64, (size_t) (s->frames * clampf(pct, 5, 100) / 100)));
        double pw = 0; for (int c = 0; c < s->chn; ++c) for (size_t i = 0; i < len; ++i) pw += (double) s->ch[c][i] * s->ch[c][i];
        double power = std::sqrt(pw / (s->chn * (double) len)); if (power < .000125) power = .000125;
        const float scale = (float) (.00125 / power * (sr_ / 44100.0 > 0 ? 1 : 1)) * 18.f;
        const int parts = (int) ((len + kBlock - 1) / kBlock);
        for (int c = 0; c < 2; ++c) {
            const auto& src = s->ch[std::min(c, s->chn - 1)];
            H[c].assign((size_t) parts, std::vector<C>(N));
            for (int p = 0; p < parts; ++p) { auto& h = H[c][(size_t) p]; for (int i = 0; i < kBlock; ++i) { size_t j = (size_t) p * kBlock + (size_t) i; h[(size_t) i] = j < len ? src[j] * scale : 0.f; } fft(h, false); }
            fdl[c].assign((size_t) parts, std::vector<C>(N));
        }
    }
    void prepare(double sr) override { Module::prepare(sr); for (auto& p : pre) p.init((int) (sr * .25)); lenPct = -1; load(lenFromFile); }
    float lenFromFile = 100;
    void run(Node& nd, int n, Control&) override {
        if (lenPct < 0) load(nd.P(len_, 100));   // the length is fixed when the library loads (changing it means re-reading the impulse)
        const float preD = std::max(1.f, nd.P(pre_, 0) / 1000.f * (float) sr_);
        Stereo& x = nd.ins[0];
        if (H[0].empty() || n != kBlock) { for (int i = 0; i < n; ++i) { nd.wet.l[i] = 0; nd.wet.r[i] = 0; } return; }
        const int parts = (int) H[0].size();
        for (int c = 0; c < 2; ++c) {
            float cur[kBlock]; for (int i = 0; i < kBlock; ++i) { cur[i] = pre[c].read(preD); pre[c].push(c ? x.r[i] : x.l[i]); }
            auto& slot = fdl[c][(size_t) pos];
            for (int i = 0; i < kBlock; ++i) { slot[(size_t) i] = prevIn[c][i]; slot[(size_t) (i + kBlock)] = cur[i]; prevIn[c][i] = cur[i]; }
            fft(slot, false);
            std::fill(acc.begin(), acc.end(), C(0, 0));
            for (int p = 0; p < parts; ++p) { const auto& X = fdl[c][(size_t) ((pos - p + parts) % parts)]; const auto& h = H[c][(size_t) p]; for (int k = 0; k < N; ++k) acc[(size_t) k] += X[(size_t) k] * h[(size_t) k]; }
            fft(acc, true);
            float* out = c ? nd.wet.r : nd.wet.l; for (int i = 0; i < kBlock; ++i) out[i] = acc[(size_t) (i + kBlock)].real();
        }
        pos = (pos + 1) % parts;
    }
};

/* ---------- modulation ---------- */
struct ModDelayM : Module {   // chorus, flanger, vibrato, BBD
    DelayLine d[2]; Lfo lfo; float base, range, fixedFb; bool stereo, tri; int rate_, depth_, fb_, mode_, noise_; Biquad lp, hp; Noise nz; bool bbd;
    ModDelayM(Node& nd, float b, float r, float fb, bool st, bool tr, bool isBbd) : base(b), range(r), fixedFb(fb), stereo(st), tri(tr), bbd(isBbd) {
        rate_ = nd.idx("rate"); depth_ = nd.idx("depth"); fb_ = nd.idx("fb"); mode_ = nd.idx("mode"); noise_ = nd.idx("noise"); }
    void prepare(double sr) override { Module::prepare(sr); for (auto& x : d) x.init((int) (sr * .1)); }
    void run(Node& nd, int n, Control&) override {
        float rate = nd.P(rate_, .8f), depth = nd.P(depth_, 40), fb = fb_ >= 0 ? clampf(nd.P(fb_, 0) / 100.f, -.95f, .95f) : fixedFb;
        if (bbd) { const int m = (int) std::lround(nd.P(mode_, 0)); rate = m == 0 ? .5f : m == 1 ? .83f : 8.f; depth = m == 2 ? 10.f : m == 1 ? 70.f : 50.f; lp.set(Biquad::LP, 7000, 0, 0, sr_); hp.set(Biquad::HP, 4000, 0, 0, sr_); }
        const float hiss = bbd ? nd.P(noise_, 20) / 100.f * .006f : 0;
        Stereo& x = nd.ins[0];
        for (int i = 0; i < n; ++i) {
            const float w = tri ? lfo.tri(rate, sr_) : lfo.sine(rate, sr_), amp = range * depth / 100.f;
            const float tl = (float) ((base + amp * w) * sr_), tr = (float) ((base - amp * w) * sr_);
            const float yl = d[0].read(std::max(1.f, tl)), yr = stereo ? d[1].read(std::max(1.f, tr)) : yl;
            d[0].push(x.l[i] + (stereo ? 0 : x.r[i]) * 0 + yl * fb); if (stereo) d[1].push(x.r[i] + yr * fb);
            float ol = yl, orr = yr;
            if (bbd) { const float h = hp.run(0, nz.next()) * hiss; ol = lp.run(0, ol + h); orr = lp.run(1, orr + h); }
            nd.wet.l[i] = ol; nd.wet.r[i] = orr;
        }
    }
};

struct ChorusM : Module {   // chorus with modes: chorus, flanger, ensemble (from EmulonX)
    ModDelayM ch, fl; std::unique_ptr<Module> ens; int mode_;
    ChorusM(Node& nd, std::unique_ptr<Module> e) : ch(nd, .014f, .007f, 0.f, true, false, false), fl(nd, .0035f, .003f, .5f, true, false, false), ens(std::move(e)) { mode_ = nd.idx("mode"); }
    void prepare(double sr) override { Module::prepare(sr); ch.prepare(sr); fl.prepare(sr); ens->prepare(sr); }
    void run(Node& nd, int n, Control& c) override { const int m = (int) std::lround(nd.P(mode_, 0)); if (m == 1) fl.run(nd, n, c); else if (m == 2) ens->run(nd, n, c); else ch.run(nd, n, c); }
};

struct PhaserM : Module {
    Biquad ap[6]; Lfo lfo; float fbS[2] = {}; int rate_, depth_, fb_;
    explicit PhaserM(Node& nd) { rate_ = nd.idx("rate"); depth_ = nd.idx("depth"); fb_ = nd.idx("fb"); }
    void run(Node& nd, int n, Control&) override {
        const float fb = std::min(.9f, nd.P(fb_, 30) / 100.f), dep = nd.P(depth_, 60) * 6; Stereo& x = nd.ins[0];
        for (int i0 = 0; i0 < n; i0 += 16) {
            const float w = lfo.sine(nd.P(rate_, .4f), sr_ / 16);
            for (int k = 0; k < 6; ++k) ap[k].set(Biquad::AllPass, std::max(30.f, 600 + k * 250 + dep * w), .6f, 0, sr_);
            for (int i = i0; i < std::min(n, i0 + 16); ++i) for (int c = 0; c < 2; ++c) {
                float s = (c ? x.r[i] : x.l[i]) + fbS[c] * fb; for (auto& a : ap) s = a.run(c, s); fbS[c] = s; (c ? nd.wet.r : nd.wet.l)[i] = s; }
        }
    }
};

struct TremM : Module {
    Lfo lfo; int rate_, depth_, shape_, mode_;
    explicit TremM(Node& nd) { rate_ = nd.idx("rate"); depth_ = nd.idx("depth"); shape_ = nd.idx("shape"); mode_ = nd.idx("mode"); }
    void run(Node& nd, int n, Control&) override {
        float rate = nd.P(rate_, 5); if (rate > 50) rate = 1000.f / rate;
        const float d = nd.P(depth_, 60) / 100.f; const int sh = (int) std::lround(nd.P(shape_, 0)); const bool pan = nd.P(mode_, 0) > .5f; Stereo& x = nd.ins[0];
        for (int i = 0; i < n; ++i) {
            const float w = sh == 1 ? lfo.tri(rate, sr_) : sh == 2 ? lfo.sq(rate, sr_) : lfo.sine(rate, sr_);
            float l = x.l[i], r = x.r[i];
            if (pan) panStereo(clampf(w * d, -1, 1), l, r); else { const float g = 1 - d / 2 + w * d / 2; l *= g; r *= g; }
            nd.wet.l[i] = l; nd.wet.r[i] = r;
        }
    }
};

struct RotaryM : Module {
    Shaper sat; Biquad lo, hi; DelayLine dh[2], dl[2]; Lfo oh, ol; double fh = .8, fl = .7; int speed_, drive_;
    explicit RotaryM(Node& nd) { speed_ = nd.idx("speed"); drive_ = nd.idx("drive"); }
    void prepare(double sr) override { Module::prepare(sr); for (int c = 0; c < 2; ++c) { dh[c].init((int) (sr * .02)); dl[c].init((int) (sr * .02)); } }
    void run(Node& nd, int n, Control&) override {
        sat.set(0, nd.P(drive_, 20) / 100.f); lo.set(Biquad::LP, 800, 0, 0, sr_); hi.set(Biquad::HP, 800, 0, 0, sr_);
        const bool fast = nd.P(speed_, 0) > .5f; const double th = fast ? 6.7 : .8, tl = fast ? 5.9 : .7, ah = 1 / ((fast ? .6 : 1.4) * sr_), al = 1 / ((fast ? 1.6 : 2.6) * sr_);
        Stereo& x = nd.ins[0];
        for (int i = 0; i < n; ++i) {
            fh += (th - fh) * ah; fl += (tl - fl) * al;
            const float wh = oh.sine(fh, sr_), wl = ol.sine(fl, sr_); float L = 0, R = 0;
            for (int c = 0; c < 2; ++c) {
                const float s = sat.run(c ? x.r[i] : x.l[i]), h = hi.run(c, s), lw = lo.run(c, s);
                dh[c].push(h); dl[c].push(lw);
                float hv = dh[c].read((float) ((.004 + .0008 * wh) * sr_)) * (.8f + .2f * wh), lv = dl[c].read((float) ((.004 + .0006 * wl) * sr_)) * (.9f + .1f * wl);
                float hl = c ? 0 : hv, hr = c ? hv : 0, ll = c ? 0 : lv, lr = c ? lv : 0; panStereo(wh, hl, hr); panStereo(wl, ll, lr);
                L += hl + ll; R += hr + lr;
            }
            nd.wet.l[i] = L * .6f; nd.wet.r[i] = R * .6f;
        }
    }
};

/* ---------- tone ---------- */
struct FilterM : Module {
    Biquad a, b; int type_, cutoff_, res_, slope_, gain_;
    explicit FilterM(Node& nd) { type_ = nd.idx("type"); cutoff_ = nd.idx("cutoff"); res_ = nd.idx("res"); slope_ = nd.idx("slope"); gain_ = nd.idx("gain"); }
    void run(Node& nd, int n, Control&) override {
        const Biquad::T T[5] = { Biquad::LP, Biquad::HP, Biquad::BP, Biquad::Notch, Biquad::Peak };
        const auto t = T[std::min(4, std::max(0, (int) std::lround(nd.P(type_, 0))))]; const float f = nd.P(cutoff_, 8000), g = nd.P(gain_, 6);
        a.set(t, f, .5f + nd.P(res_, 20) / 100.f * 18, g, sr_); const bool two = nd.P(slope_, 0) > .5f; if (two) b.set(t, f, .7f, g, sr_);
        Stereo& x = nd.ins[0];
        for (int i = 0; i < n; ++i) { float l = a.run(0, x.l[i]), r = a.run(1, x.r[i]); if (two) { l = b.run(0, l); r = b.run(1, r); } nd.wet.l[i] = l; nd.wet.r[i] = r; }
    }
};

struct EqM : Module {
    Biquad b[4]; int lo_, mid_, hi_, lf_, lg_, m1f_, m1g_, m1q_, m2f_, m2g_, m2q_, hf_, hg_; bool para;
    EqM(Node& nd, bool p) : para(p) { lo_ = nd.idx("low"); mid_ = nd.idx("mid"); hi_ = nd.idx("high"); lf_ = nd.idx("lf"); lg_ = nd.idx("lg"); m1f_ = nd.idx("m1f"); m1g_ = nd.idx("m1g"); m1q_ = nd.idx("m1q");
        m2f_ = nd.idx("m2f"); m2g_ = nd.idx("m2g"); m2q_ = nd.idx("m2q"); hf_ = nd.idx("hf"); hg_ = nd.idx("hg"); }
    void run(Node& nd, int n, Control&) override {
        int nb;
        if (!para) { b[0].set(Biquad::LowShelf, 250, 0, nd.P(lo_), sr_); b[1].set(Biquad::Peak, 1000, .8f, nd.P(mid_), sr_); b[2].set(Biquad::HighShelf, 4000, 0, nd.P(hi_), sr_); nb = 3; }
        else { b[0].set(Biquad::LowShelf, nd.P(lf_, 100), 0, nd.P(lg_), sr_); b[1].set(Biquad::Peak, nd.P(m1f_, 500), nd.P(m1q_, 1), nd.P(m1g_), sr_);
               b[2].set(Biquad::Peak, nd.P(m2f_, 2500), nd.P(m2q_, 1), nd.P(m2g_), sr_); b[3].set(Biquad::HighShelf, nd.P(hf_, 8000), 0, nd.P(hg_), sr_); nb = 4; }
        Stereo& x = nd.ins[0];
        for (int i = 0; i < n; ++i) { float l = x.l[i], r = x.r[i]; for (int k = 0; k < nb; ++k) { l = b[k].run(0, l); r = b[k].run(1, r); } nd.wet.l[i] = l; nd.wet.r[i] = r; }
    }
};

struct DistM : Module {   // distortion, overdrive pedal, fuzz pedal
    Shaper sh; Biquad tone, hump; int type_, drive_, tone_, level_; int fixedType; bool odHump; float dcx[2] = {}, dcy[2] = {};
    DistM(Node& nd, int ft, const char* driveKey, bool hump_) : fixedType(ft), odHump(hump_) { type_ = nd.idx("type"); drive_ = nd.idx(driveKey); tone_ = nd.idx("tone"); level_ = nd.idx("level"); }
    void run(Node& nd, int n, Control&) override {
        const int t = fixedType >= 0 ? fixedType : (int) std::lround(nd.P(type_, 0)); sh.set(t, nd.P(drive_, 30) / 100.f);
        tone.set(Biquad::LP, logF(nd.P(tone_, 50), 800, 16000), .6f, 0, sr_); if (odHump) hump.set(Biquad::Peak, 720, 1.2f, 7, sr_);
        const float lv = dbg(nd.P(level_, 0)); Stereo& x = nd.ins[0];
        for (int i = 0; i < n; ++i) { float l = x.l[i], r = x.r[i]; if (odHump) { l = hump.run(0, l); r = hump.run(1, r); }
            l = tone.run(0, sh.run(l)); r = tone.run(1, sh.run(r));
            // DC blocker: rectify and diode shift the signal off centre
            const float yl = l - dcx[0] + .9995f * dcy[0], yr = r - dcx[1] + .9995f * dcy[1]; dcx[0] = l; dcx[1] = r; dcy[0] = yl; dcy[1] = yr;
            nd.wet.l[i] = yl * lv; nd.wet.r[i] = yr * lv; }
    }
};

struct Crusher {   // sample-and-hold, bit reduction and optional mu-law, like the Maker's worklet
    double ph[2] = {}; float h[2] = {}; Noise nz;
    inline float run(int c, float x, float bits, float rate, bool comp, double sr, float noise) {
        ph[c] += rate / sr;
        if (ph[c] >= 1) {
            ph[c] -= 1; const float q = std::pow(2.f, std::max(1.f, bits) - 1); float v = x;
            if (comp) { const float s = v < 0 ? -1.f : 1.f, mu = 255; v = s * std::log(1 + mu * std::min(1.f, std::fabs(v))) / std::log(1 + mu); v = std::round(v * q) / q; v = s * (std::pow(1 + mu, std::fabs(v)) - 1) / mu; }
            else v = std::round(v * q) / q;
            h[c] = v + nz.next() * noise;
        }
        return h[c];
    }
};
struct CrushM : Module {
    Crusher cr; int bits_, rate_, comp_;
    explicit CrushM(Node& nd) { bits_ = nd.idx("bits"); rate_ = nd.idx("rate"); comp_ = nd.idx("comp"); }
    void run(Node& nd, int n, Control&) override {
        const float b = nd.P(bits_, 8), r = nd.P(rate_, 11025); const bool cp = nd.P(comp_, 0) > .5f; Stereo& x = nd.ins[0];
        for (int i = 0; i < n; ++i) { nd.wet.l[i] = cr.run(0, x.l[i], b, r, cp, sr_, 0); nd.wet.r[i] = cr.run(1, x.r[i], b, r, cp, sr_, 0); }
    }
};
struct VintageM : Module {
    Crusher cr; Shaper pre; Biquad lp, hp; Noise nz; int model_, bits_, rate_, drive_, age_;
    explicit VintageM(Node& nd) { model_ = nd.idx("model"); bits_ = nd.idx("bits"); rate_ = nd.idx("rate"); drive_ = nd.idx("drive"); age_ = nd.idx("age"); }
    void run(Node& nd, int n, Control&) override {
        static const float M[3][4] = { { 8, 27778, 1, 7000 }, { 12, 26040, 0, 11000 }, { 12, 39062, 0, 15000 } };
        const int m = (int) std::lround(nd.P(model_, 1)); float bits, rate, comp, cut;
        if (m >= 0 && m < 3) { bits = M[m][0]; rate = M[m][1]; comp = M[m][2]; cut = M[m][3]; } else { bits = nd.P(bits_, 12); rate = nd.P(rate_, 26040); comp = 0; cut = std::min(18000.f, rate * .45f); }
        const float age = nd.P(age_, 30); pre.set(1, .05f + nd.P(drive_, 20) / 100.f * .6f);
        lp.set(Biquad::LP, cut * (1 - age / 250), .6f, 0, sr_); hp.set(Biquad::HP, 3000, 0, 0, sr_);
        const float hiss = (m == 0 ? .004f : .0015f) * (.3f + age / 100); Stereo& x = nd.ins[0];
        for (int i = 0; i < n; ++i) { const float h = hp.run(0, nz.next()) * hiss;
            nd.wet.l[i] = lp.run(0, cr.run(0, pre.run(x.l[i]), bits, rate, comp > .5f, sr_, 0) + h); nd.wet.r[i] = lp.run(1, cr.run(1, pre.run(x.r[i]), bits, rate, comp > .5f, sr_, 0) + h); }
    }
};

struct MorphM : Module {
    Biquad bp[3]; int morph_, shift_, res_;
    explicit MorphM(Node& nd) { morph_ = nd.idx("morph"); shift_ = nd.idx("shift"); res_ = nd.idx("res"); }
    void run(Node& nd, int n, Control&) override {
        static const float VW[5][3] = { { 730, 1090, 2440 }, { 530, 1840, 2480 }, { 270, 2290, 3010 }, { 570, 840, 2410 }, { 300, 870, 2240 } };
        const float m = clampf(nd.P(morph_, 30) / 100.f, 0, 1) * 4; const int i0 = std::min(3, (int) m); const float f = m - (float) i0, sh = std::pow(2.f, nd.P(shift_, 0) / 12.f), q = 2 + nd.P(res_, 60) / 100.f * 16;
        for (int k = 0; k < 3; ++k) bp[k].set(Biquad::BP, (VW[i0][k] * (1 - f) + VW[i0 + 1][k] * f) * sh, q, 0, sr_);
        const float g[3] = { 1, .7f, .4f }; Stereo& x = nd.ins[0];
        for (int i = 0; i < n; ++i) { float l = 0, r = 0; for (int k = 0; k < 3; ++k) { l += bp[k].run(0, x.l[i]) * g[k]; r += bp[k].run(1, x.r[i]) * g[k]; } nd.wet.l[i] = l * 1.4f; nd.wet.r[i] = r * 1.4f; }
    }
};

struct WahM : Module {
    Biquad bp; Follower env; int pos_, mode_, q_;
    explicit WahM(Node& nd) { pos_ = nd.idx("pos"); mode_ = nd.idx("mode"); q_ = nd.idx("q"); }
    void run(Node& nd, int n, Control&) override {
        Stereo& x = nd.ins[0]; float p = nd.P(pos_, 50) / 100.f;
        if (nd.P(mode_, 0) > .5f) { float s = 0; for (int i = 0; i < n; ++i) s = env.run((x.l[i] + x.r[i]) * .5f * 6, .05f, .002f); p = std::min(1.f, s); }
        bp.set(Biquad::BP, logF(p * 100, 350, 2400), nd.P(q_, 7), 0, sr_);
        for (int i = 0; i < n; ++i) { nd.wet.l[i] = bp.run(0, x.l[i]) * 2; nd.wet.r[i] = bp.run(1, x.r[i]) * 2; }
    }
};

struct VibeM : Module {
    Biquad ap[4]; Lfo lfo; int speed_, int_;
    explicit VibeM(Node& nd) { speed_ = nd.idx("speed"); int_ = nd.idx("intensity"); }
    void run(Node& nd, int n, Control&) override {
        static const float F[4] = { 180, 520, 1100, 2600 }; const float in = nd.P(int_, 70) / 100.f; Stereo& x = nd.ins[0];
        for (int i0 = 0; i0 < n; i0 += 16) {
            const float w = lfo.sine(nd.P(speed_, 2), sr_ / 16);
            for (int k = 0; k < 4; ++k) ap[k].set(Biquad::AllPass, std::max(20.f, F[k] + F[k] * .8f * in * w), .5f, 0, sr_);
            for (int i = i0; i < std::min(n, i0 + 16); ++i) { float l = x.l[i], r = x.r[i]; for (auto& a : ap) { l = a.run(0, l); r = a.run(1, r); } const float g = 1 + .15f * w; nd.wet.l[i] = l * g; nd.wet.r[i] = r * g; }
        }
    }
};

/* ---------- dynamics ---------- */
struct CompM : Module {   // feed-forward compressor; limiter and comp pedal are presets of it. Mode: compressor, limiter, OTT (from EmulonX)
    float env = 0; int kind; int thresh_, ratio_, attack_, release_, makeup_, ceiling_, sustain_, level_, mode_;
    double be[3] = {}, sv[2][4][2] = {};
    struct Svf { double a1 = 0, a2 = 0, a3 = 0; };
    static Svf svc(double f, double k, double sr) { const double g = std::tan(kPi * std::min(f, sr * .45) / sr), a1 = 1 / (1 + g * (g + k)); return { a1, g * a1, g * g * a1 }; }
    void ott(Node& nd, int n) {
        // three bands, each pushed down above and pulled up below its target. Threshold moves the targets, ratio is the depth.
        const double t = clampf(nd.P(attack_, 10) / 100.f, 0, 1), amt = clampf((nd.P(ratio_, 3) - 1) / 19.f * 1.5f, 0, 1), off = nd.P(thresh_, -18) + 18, K = std::sqrt(2.0), og = dbg(nd.P(makeup_, 0));
        const Svf c1 = svc(88.3, K, sr_), c2 = svc(2500.0, K, sr_);
        const double ac = std::exp(-1.0 / ((1 + 20 * t) * .001 * sr_)), rc = std::exp(-1.0 / ((20 + 400 * t) * .001 * sr_));
        static const double TD[3] = { -17, -16, -18 }, TU[3] = { -33, -34, -33 };
        auto lp = [](double* S, double x, const Svf& c) { const double v3 = x - S[1], v1 = c.a1 * S[0] + c.a2 * v3, v2 = S[1] + c.a2 * S[0] + c.a3 * v3; S[0] = 2 * v1 - S[0]; S[1] = 2 * v2 - S[1]; return v2; };
        auto hp = [K](double* S, double x, const Svf& c) { const double v3 = x - S[1], v1 = c.a1 * S[0] + c.a2 * v3, v2 = S[1] + c.a2 * S[0] + c.a3 * v3; S[0] = 2 * v1 - S[0]; S[1] = 2 * v2 - S[1]; return x - K * v1 - v2; };
        Stereo& x = nd.ins[0];
        for (int i = 0; i < n; ++i) {
            double B[2][3];
            for (int ch = 0; ch < 2; ++ch) { auto& S = sv[ch]; const double xi = (ch ? x.r : x.l)[i];
                const double lo = lp(S[1], lp(S[0], xi, c1), c1), rest = xi - lo, hi = hp(S[3], hp(S[2], rest, c2), c2); B[ch][0] = lo; B[ch][1] = rest - hi; B[ch][2] = hi; }
            double wl = 0, wr = 0;
            for (int k = 0; k < 3; ++k) {
                const double lv = std::max(std::fabs(B[0][k]), std::fabs(B[1][k]));
                be[k] = lv > be[k] ? ac * be[k] + (1 - ac) * lv : rc * be[k] + (1 - rc) * lv;
                const double db = 20 * std::log10(be[k] + 1e-9); double r = 0;
                if (db > TD[k] + off) r -= (db - TD[k] - off) * (1 - 1 / 66.0) * amt;
                if (db < TU[k] + off) r += std::min(18.0, (TU[k] + off - db) * .76) * amt * clampf((float) ((db + 75) / 15), 0, 1);
                const double g = std::pow(10.0, r / 20); wl += B[0][k] * g; wr += B[1][k] * g;
            }
            const double sl = wl * og * 2, sr2 = wr * og * 2;
            nd.wet.l[i] = std::isfinite(sl) ? (float) sl : 0.f; nd.wet.r[i] = std::isfinite(sr2) ? (float) sr2 : 0.f;
        }
    }
    CompM(Node& nd, int k) : kind(k) { mode_ = nd.idx("mode"); thresh_ = nd.idx("thresh"); ratio_ = nd.idx("ratio"); attack_ = nd.idx("attack"); release_ = nd.idx("release"); makeup_ = nd.idx("makeup");
        ceiling_ = nd.idx("ceiling"); sustain_ = nd.idx("sustain"); level_ = nd.idx("level"); }
    void run(Node& nd, int n, Control&) override {
        float th, ratio, att, rel, knee, mk;
        const int mode = kind == 0 ? (int) std::lround(nd.P(mode_, 0)) : 0;
        if (mode == 2) { ott(nd, n); return; }
        if (mode == 1) { th = nd.P(thresh_, -18) - 1; ratio = 20; att = .001f; rel = nd.P(release_, 60) / 1000; knee = 0; mk = dbg(nd.P(makeup_, 0)); }
        else if (kind == 0) { th = nd.P(thresh_, -18); ratio = nd.P(ratio_, 3); att = nd.P(attack_, 10) / 1000; rel = nd.P(release_, 150) / 1000; knee = 30; mk = dbg(nd.P(makeup_, 0)); }
        else if (kind == 1) { th = nd.P(ceiling_, -.3f) - 1; ratio = 20; att = .001f; rel = nd.P(release_, 60) / 1000; knee = 0; mk = 1; }
        else { const float s = nd.P(sustain_, 60); th = -10 - s * .4f; ratio = 2 + s / 10; att = .003f; rel = .25f; knee = 6; mk = dbg(nd.P(level_, 0)) * (1 + s / 120); }
        auto curve = [&](float db) { if (db < th - knee / 2) return db; if (knee > 0 && db < th + knee / 2) { const float x = db - th + knee / 2; return db + (1 / ratio - 1) * x * x / (2 * knee); } return th + (db - th) / ratio; };
        const float auto_ = kind == 0 && mode == 0 ? std::pow(1 / dbg(curve(0)), .6f) : 1;
        const float ka = 1 - std::exp(-1 / (std::max(1e-4f, att) * (float) sr_)), kr = 1 - std::exp(-1 / (std::max(1e-3f, rel) * (float) sr_));
        Stereo& x = nd.ins[0];
        for (int i = 0; i < n; ++i) {
            const float lv = std::max(std::fabs(x.l[i]), std::fabs(x.r[i])); env += (lv > env ? ka : kr) * (lv - env);
            const float db = 20 * std::log10(std::max(1e-6f, env)), g = dbg(curve(db) - db) * auto_ * mk;
            nd.wet.l[i] = x.l[i] * g; nd.wet.r[i] = x.r[i] * g;
        }
    }
};

struct TransientM : Module {
    Biquad fast, slow; int attack_, sustain_;
    explicit TransientM(Node& nd) { attack_ = nd.idx("attack"); sustain_ = nd.idx("sustain"); }
    void run(Node& nd, int n, Control&) override {
        fast.set(Biquad::LP, 60, .5f, 0, sr_); slow.set(Biquad::LP, 6, .5f, 0, sr_);
        const float ga = nd.P(attack_, 30) / 100 * 6, gs = nd.P(sustain_, 0) / 100 * 2; Stereo& x = nd.ins[0];
        for (int i = 0; i < n; ++i) { const float a = std::fabs((x.l[i] + x.r[i]) * .5f), f = fast.run(0, a), s = slow.run(0, a), g = 1 + ga * (f - s) + gs * s;
            nd.wet.l[i] = x.l[i] * g; nd.wet.r[i] = x.r[i] * g; }
    }
};

/* ---------- retro colour ---------- */
struct TapeEchoM : Module {
    DelayLine d[2]; Shaper sat; Biquad lp, hp; Lfo w1, w2; float t = -1; int time_, fb_, wobble_, sat_, tone_;
    explicit TapeEchoM(Node& nd) { time_ = nd.idx("time"); fb_ = nd.idx("fb"); wobble_ = nd.idx("wobble"); sat_ = nd.idx("sat"); tone_ = nd.idx("tone"); }
    void prepare(double sr) override { Module::prepare(sr); for (auto& x : d) x.init((int) (sr * 5.1)); }
    void run(Node& nd, int n, Control&) override {
        const float target = clampf(nd.P(time_, 330) / 1000.f * (float) sr_, 1, (float) sr_ * 5); if (t < 0) t = target;
        const float fb = std::min(1.08f, nd.P(fb_, 45) / 100.f), wob = nd.P(wobble_, 35) / 100.f; sat.set(1, .05f + nd.P(sat_, 40) / 100.f * .7f);
        lp.set(Biquad::LP, logF(nd.P(tone_, 45), 900, 9000), .6f, 0, sr_); hp.set(Biquad::HP, 120, .6f, 0, sr_); Stereo& x = nd.ins[0];
        for (int i = 0; i < n; ++i) {
            t += (target - t) * (float) (1 / (.12 * sr_));
            const float mod = (float) ((wob * .0035 * w1.sine(.55, sr_) + wob * .0004 * w2.sine(6.3, sr_)) * sr_);
            for (int c = 0; c < 2; ++c) { const float y = hp.run(c, lp.run(c, sat.run(d[c].read(std::max(1.f, t + mod))))); d[c].push((c ? x.r[i] : x.l[i]) + y * fb); (c ? nd.wet.r : nd.wet.l)[i] = y; }
        }
    }
};

struct EnsembleM : Module {
    DelayLine d[3]; Lfo slow[3], fast[3]; int depth_;
    explicit EnsembleM(Node& nd) { depth_ = nd.idx("depth"); }
    void prepare(double sr) override { Module::prepare(sr); for (auto& x : d) x.init((int) (sr * .05)); }
    void run(Node& nd, int n, Control&) override {
        const float g = .0005f + nd.P(depth_, 60) / 100.f * .005f; Stereo& x = nd.ins[0];
        for (int i = 0; i < n; ++i) {
            const float in = (x.l[i] + x.r[i]) * .5f; float o[3];
            for (int k = 0; k < 3; ++k) { d[k].push(in); o[k] = d[k].read((float) ((.01 + g * slow[k].sine(.6 + k * .07, sr_) + .0004 * fast[k].sine(6 + k * .4, sr_)) * sr_)); }
            nd.wet.l[i] = o[0] + o[2]; nd.wet.r[i] = o[1] + o[2];
        }
    }
};

struct WornM : Module {   // tape machine, lo-fi, vinyl and radio share this
    enum K { Tape, Lofi, Vinyl, Radio } k; DelayLine d[2]; Shaper sat; Biquad lp, hp, bump, nf, rum; Lfo w1, w2; Noise nz; Noise cr;
    int sat_, bump_, hiss_, wow_, age_, crackle_, noise_, tone_, rumble_, wear_, band_, crunch_;
    WornM(Node& nd, K kind) : k(kind) { sat_ = nd.idx("sat"); bump_ = nd.idx("bump"); hiss_ = nd.idx("hiss"); wow_ = nd.idx("wow"); age_ = nd.idx("age"); crackle_ = nd.idx("crackle");
        noise_ = nd.idx("noise"); tone_ = nd.idx("tone"); rumble_ = nd.idx("rumble"); wear_ = nd.idx("wear"); band_ = nd.idx("band"); crunch_ = nd.idx("crunch"); cr.s = 777; }
    void prepare(double sr) override { Module::prepare(sr); for (auto& x : d) x.init((int) (sr * .05)); }
    void run(Node& nd, int n, Control&) override {
        float wowA = 0, flutA = 0, wowF = .5f, noiseG = 0, crackG = 0, rumbleG = 0;
        if (k == Tape) { sat.set(1, .02f + nd.P(sat_, 35) / 100 * .6f); bump.set(Biquad::LowShelf, 90, 0, nd.P(bump_, 3), sr_); lp.set(Biquad::LP, logF(100 - nd.P(age_, 25), 3500, 18000), .6f, 0, sr_);
                         nf.set(Biquad::HP, 2500, 0, 0, sr_); wowA = nd.P(wow_, 15) / 100 * .0025f; noiseG = nd.P(hiss_, 10) / 100 * .008f; }
        else if (k == Lofi) { lp.set(Biquad::LP, logF(nd.P(tone_, 60), 1200, 16000), .6f, 0, sr_); nf.set(Biquad::BP, 3000, .5f, 0, sr_);
                              wowA = nd.P(wow_, 30) / 100 * .003f; flutA = nd.P(wow_, 30) / 100 * .0003f; wowF = .7f; crackG = nd.P(crackle_, 30) / 100 * .6f; noiseG = nd.P(noise_, 15) / 100 * .02f; }
        else if (k == Vinyl) { lp.set(Biquad::LP, logF(100 - nd.P(wear_, 30), 2500, 18000), .6f, 0, sr_); rum.set(Biquad::LP, 60, .7f, 0, sr_);
                               wowA = nd.P(wow_, 20) / 100 * .002f; wowF = .55f; crackG = nd.P(crackle_, 40) / 100 * .7f; rumbleG = nd.P(rumble_, 20) / 100 * .3f; }
        else { static const float B[3][2] = { { 200, 4500 }, { 300, 3400 }, { 500, 2600 } }; const int b = std::min(2, std::max(0, (int) std::lround(nd.P(band_, 0))));
               hp.set(Biquad::HP, B[b][0], .7f, 0, sr_); lp.set(Biquad::LP, B[b][1], .7f, 0, sr_); sat.set(2, .02f + nd.P(crunch_, 30) / 100 * .5f); noiseG = nd.P(noise_, 15) / 100 * .03f; }
        Stereo& x = nd.ins[0];
        for (int i = 0; i < n; ++i) {
            const float m = (float) ((.01 + wowA * w1.sine(wowF, sr_) + flutA * w2.sine(7, sr_)) * sr_);
            float crack = 0; if (crackG > 0) { const float r = cr.next(); if (std::fabs(r) > .9993f) crack = r * crackG * 3; }
            const float nzv = nz.next(); float extra = crack;
            if (k == Tape) extra += nf.run(0, nzv) * noiseG; else if (k == Lofi) extra += nf.run(0, nzv) * noiseG; else if (k == Vinyl) extra += rum.run(0, nzv) * rumbleG; else extra += nzv * noiseG;
            for (int c = 0; c < 2; ++c) {
                float s = c ? x.r[i] : x.l[i];
                if (k == Radio) { s = lp.run(c, sat.run(hp.run(c, s)) + extra); (c ? nd.wet.r : nd.wet.l)[i] = s; continue; }
                if (k == Tape) s = bump.run(c, sat.run(s));
                d[c].push(s); s = lp.run(c, d[c].read(m) + extra); (c ? nd.wet.r : nd.wet.l)[i] = s;
            }
        }
    }
};

/* ---------- routing (raw: own outputs) ---------- */
struct MixerM : Module { int l_[4]; explicit MixerM(Node& nd) { const char* k[4] = { "l1", "l2", "l3", "l4" }; for (int i = 0; i < 4; ++i) l_[i] = nd.idx(k[i]); }
    void run(Node& nd, int n, Control&) override { Stereo& o = nd.outs[0]; o.clear(n); for (int k = 0; k < 4; ++k) { const float v = nd.P(l_[k], 0); o.add(nd.ins[(size_t) k], n, v <= -59 ? 0 : dbg(v)); } } };
struct UtilM : Module { int gain_, pan_, width_; explicit UtilM(Node& nd) { gain_ = nd.idx("gain"); pan_ = nd.idx("pan"); width_ = nd.idx("width"); }
    void run(Node& nd, int n, Control&) override {
        const float gv = nd.P(gain_, 0), g = gv <= -59 ? 0 : dbg(gv), w = nd.P(width_, 100) / 100, pan = nd.P(pan_, 0) / 100; Stereo& x = nd.ins[0]; Stereo& o = nd.outs[0];
        for (int i = 0; i < n; ++i) { const float m = (x.l[i] + x.r[i]) * .5f, s = (x.l[i] - x.r[i]) * .5f * w; float l = m + s, r = m - s; panStereo(pan, l, r); o.l[i] = l * g; o.r[i] = r * g; } } };
struct XoverM : Module { Biquad l1, l2, h1, h2, m1, m2, hh1, hh2; int f1_, f2_; explicit XoverM(Node& nd) { f1_ = nd.idx("f1"); f2_ = nd.idx("f2"); }
    void run(Node& nd, int n, Control&) override {
        const float f1 = nd.P(f1_, 250), f2 = nd.P(f2_, 3000);
        for (Biquad* b : { &l1, &l2 }) b->set(Biquad::LP, f1, -3.01f, 0, sr_); for (Biquad* b : { &h1, &h2 }) b->set(Biquad::HP, f1, -3.01f, 0, sr_);
        for (Biquad* b : { &m1, &m2 }) b->set(Biquad::LP, f2, -3.01f, 0, sr_); for (Biquad* b : { &hh1, &hh2 }) b->set(Biquad::HP, f2, -3.01f, 0, sr_);
        Stereo& x = nd.ins[0];
        for (int i = 0; i < n; ++i) for (int c = 0; c < 2; ++c) {
            const float s = c ? x.r[i] : x.l[i], lo = l2.run(c, l1.run(c, s)), hp = h2.run(c, h1.run(c, s)), mid = m2.run(c, m1.run(c, hp)), hi = hh2.run(c, hh1.run(c, hp));
            (c ? nd.outs[0].r : nd.outs[0].l)[i] = lo; (c ? nd.outs[1].r : nd.outs[1].l)[i] = mid; (c ? nd.outs[2].r : nd.outs[2].l)[i] = hi; } } };
struct MsSplitM : Module { void run(Node& nd, int n, Control&) override { Stereo& x = nd.ins[0];
    for (int i = 0; i < n; ++i) { const float m = (x.l[i] + x.r[i]) * .5f, s = (x.l[i] - x.r[i]) * .5f; nd.outs[0].l[i] = nd.outs[0].r[i] = m; nd.outs[1].l[i] = nd.outs[1].r[i] = s; } } };
struct MsJoinM : Module { void run(Node& nd, int n, Control&) override { Stereo& m = nd.ins[0]; Stereo& s = nd.ins[1];
    for (int i = 0; i < n; ++i) { const float mv = (m.l[i] + m.r[i]) * .5f, sv = (s.l[i] + s.r[i]) * .5f; nd.outs[0].l[i] = mv + sv; nd.outs[0].r[i] = mv - sv; } } };
struct SendM : Module { int bus_, level_; Stereo* buses = nullptr; explicit SendM(Node& nd) { bus_ = nd.idx("bus"); level_ = nd.idx("level"); }
    void run(Node& nd, int n, Control&) override { Stereo& x = nd.ins[0]; std::memcpy(&nd.outs[0], &x, sizeof(Stereo));
        if (!buses) return; const int b = std::min(kBuses - 1, std::max(0, (int) std::lround(nd.P(bus_, 0)))); const float v = nd.P(level_, -6); buses[b].add(x, n, v <= -59 ? 0 : dbg(v)); } };
struct ReturnM : Module { int bus_, level_; Stereo* buses = nullptr; explicit ReturnM(Node& nd) { bus_ = nd.idx("bus"); level_ = nd.idx("level"); }
    void run(Node& nd, int n, Control&) override { Stereo& o = nd.outs[0]; o.clear(n); if (!buses) return;
        const int b = std::min(kBuses - 1, std::max(0, (int) std::lround(nd.P(bus_, 0)))); const float v = nd.P(level_, 0); o.add(buses[b], n, v <= -59 ? 0 : dbg(v)); } };
struct VolPedalM : Module { int pos_; float g = -1; explicit VolPedalM(Node& nd) { pos_ = nd.idx("pos"); }
    void run(Node& nd, int n, Control&) override { const float t = std::pow(nd.P(pos_, 100) / 100, 2.f); if (g < 0) g = t; Stereo& x = nd.ins[0];
        for (int i = 0; i < n; ++i) { g += (t - g) * .005f; nd.outs[0].l[i] = x.l[i] * g; nd.outs[0].r[i] = x.r[i] * g; } } };
struct FollowM : Module { float v = 0; int attack_, release_; explicit FollowM(Node& nd) { attack_ = nd.idx("attack"); release_ = nd.idx("release"); }
    void run(Node& nd, int n, Control&) override { Stereo& x = nd.ins[0]; double s = 0; for (int i = 0; i < n; ++i) s += (double) x.l[i] * x.l[i] + (double) x.r[i] * x.r[i];
        const float lv = (float) std::sqrt(s / (2.0 * std::max(1, n))), ms = (float) (n / sr_ * 1000), k = std::min(1.f, ms / std::max(1.f, lv > v ? nd.P(attack_, 10) : nd.P(release_, 200)));
        v += (lv - v) * k; } };

/* ---------- module table ---------- */
struct TypeInfo { const char* type; std::vector<std::string> ins, outs; bool raw, mod; };
static const std::vector<TypeInfo>& types() {
    static const std::vector<TypeInfo> t = {
        { "input", {}, { "out" }, true, false }, { "output", { "in" }, {}, true, false },
        { "mixer", { "in1", "in2", "in3", "in4" }, { "out" }, true, false }, { "util", { "in" }, { "out" }, true, false },
        { "xover", { "in" }, { "low", "mid", "high" }, true, false }, { "mssplit", { "in" }, { "mid", "side" }, true, false },
        { "msjoin", { "mid", "side" }, { "out" }, true, false }, { "send", { "in" }, { "out" }, true, false }, { "ret", {}, { "out" }, true, false },
        { "pvol", { "in" }, { "out" }, true, false },
        { "lfo", {}, { "out" }, false, true }, { "env", { "in" }, { "out" }, false, true }, { "macro", {}, { "out" }, false, true },
        { "adsr", {}, { "out" }, false, true }, { "midisrc", {}, { "out" }, false, true }, { "rand", {}, { "out" }, false, true },
    };
    return t;
}
static const std::vector<std::string> kFx = { "delay", "reverb", "chorus", "phaser", "dist", "filter", "eq", "comp", "limiter", "conv", "shimmer", "flanger", "trem", "rotary",
    "vibrato", "peq", "crush", "lofi", "transient", "morph", "vintage", "tapeecho", "bbd", "ensemble", "tapemach", "digiverb", "gatedverb", "spring", "vinyl", "radio",
    "pod", "pfuzz", "pwah", "pcomp", "pvibe" };

const std::vector<std::string>& supportedModules() {
    static std::vector<std::string> s;
    if (s.empty()) { for (auto& t : types()) if (std::string(t.type) != "input" && std::string(t.type) != "output") s.push_back(t.type); for (auto& f : kFx) s.push_back(f); }
    return s;
}

static std::unique_ptr<Module> makeModule(Node& nd, const Library& lib) {
    const std::string& t = nd.type;
    if (t == "delay") return std::make_unique<DelayM>(nd);
    if (t == "reverb") return std::make_unique<ReverbM>(nd, "hall");
    if (t == "digiverb") return std::make_unique<ReverbM>(nd, "digital");
    if (t == "gatedverb") return std::make_unique<ReverbM>(nd, "gated");
    if (t == "spring") return std::make_unique<ReverbM>(nd, "spring");
    if (t == "shimmer") return std::make_unique<ReverbM>(nd, "shimmer");
    if (t == "conv") { auto m = std::make_unique<ConvM>(nd, lib); const int li = nd.idx("len"); if (li >= 0) m->lenFromFile = nd.params[(size_t) li].raw; return m; }
    if (t == "chorus") return std::make_unique<ChorusM>(nd, std::make_unique<EnsembleM>(nd));
    if (t == "flanger") return std::make_unique<ModDelayM>(nd, .0035f, .003f, .5f, true, false, false);
    if (t == "vibrato") return std::make_unique<ModDelayM>(nd, .006f, .005f, 0.f, false, false, false);
    if (t == "bbd") return std::make_unique<ModDelayM>(nd, .009f, .004f, 0.f, true, true, true);
    if (t == "phaser") return std::make_unique<PhaserM>(nd);
    if (t == "trem") return std::make_unique<TremM>(nd);
    if (t == "rotary") return std::make_unique<RotaryM>(nd);
    if (t == "filter") return std::make_unique<FilterM>(nd);
    if (t == "eq") return std::make_unique<EqM>(nd, false);
    if (t == "peq") return std::make_unique<EqM>(nd, true);
    if (t == "dist") return std::make_unique<DistM>(nd, -1, "drive", false);
    if (t == "pod") return std::make_unique<DistM>(nd, 0, "drive", true);
    if (t == "pfuzz") return std::make_unique<DistM>(nd, 4, "fuzz", false);
    if (t == "crush") return std::make_unique<CrushM>(nd);
    if (t == "vintage") return std::make_unique<VintageM>(nd);
    if (t == "morph") return std::make_unique<MorphM>(nd);
    if (t == "pwah") return std::make_unique<WahM>(nd);
    if (t == "pvibe") return std::make_unique<VibeM>(nd);
    if (t == "comp") return std::make_unique<CompM>(nd, 0);
    if (t == "limiter") return std::make_unique<CompM>(nd, 1);
    if (t == "pcomp") return std::make_unique<CompM>(nd, 2);
    if (t == "transient") return std::make_unique<TransientM>(nd);
    if (t == "tapeecho") return std::make_unique<TapeEchoM>(nd);
    if (t == "ensemble") return std::make_unique<EnsembleM>(nd);
    if (t == "tapemach") return std::make_unique<WornM>(nd, WornM::Tape);
    if (t == "lofi") return std::make_unique<WornM>(nd, WornM::Lofi);
    if (t == "vinyl") return std::make_unique<WornM>(nd, WornM::Vinyl);
    if (t == "radio") return std::make_unique<WornM>(nd, WornM::Radio);
    if (t == "mixer") return std::make_unique<MixerM>(nd);
    if (t == "util") return std::make_unique<UtilM>(nd);
    if (t == "xover") return std::make_unique<XoverM>(nd);
    if (t == "mssplit") return std::make_unique<MsSplitM>();
    if (t == "msjoin") return std::make_unique<MsJoinM>();
    if (t == "send") return std::make_unique<SendM>(nd);
    if (t == "ret") return std::make_unique<ReturnM>(nd);
    if (t == "pvol") return std::make_unique<VolPedalM>(nd);
    if (t == "env") return std::make_unique<FollowM>(nd);
    return nullptr;
}

/* ================= parameter evaluation (same rules as the Maker's paramReal) ================= */
static const float kSync[] = { .125f, 1.f / 6, .25f, 1.f / 3, .5f, .75f, 2.f / 3, 1.f, 1.5f, 2.f, 4.f };
static const float kSyncBar[] = { .125f, .25f, .5f, 1.f, 2.f, 4.f };

static float modOut(Node& m, Control& c, double blockSec, const std::vector<TagDef>& tags);

Graph::~Graph() {}
bool Graph::empty() const { return nodes.empty(); }

static void evalParams(Node& nd, Control& c, const std::vector<TagDef>& tags, const std::vector<std::unique_ptr<Node>>& all) {
    for (size_t pi = 0; pi < nd.params.size(); ++pi) {
        ParamInfo& p = nd.params[pi];
        if (!p.known) { p.real = p.raw; continue; }
        float norm;
        if (p.tag >= 0 && p.tag < c.numTags) {
            const float tv = c.tags[p.tag].load(std::memory_order_relaxed);
            const TagDef& td = tags[(size_t) p.tag];
            if (p.sync && td.kind == "sync") {
                const bool bar = td.basis == "bar"; const int cnt = bar ? 6 : 11, i = std::min(cnt - 1, std::max(0, (int) std::lround(tv * (cnt - 1))));
                const double beats = bar ? kSyncBar[i] * (c.sigN * 4.0 / c.sigD) : kSync[i]; p.real = (float) (beats * 60000.0 / c.bpm); continue;
            }
            norm = tv;
        } else if (p.log) norm = std::log(std::max(p.min, p.raw) / p.min) / std::log(p.max / p.min);
        else norm = p.max > p.min ? (p.raw - p.min) / (p.max - p.min) : 0;
        // a macro adds its knob on top (0 = the parameter as set); other modulators swing both ways
        for (auto& m : nd.mods) if (m.param == (int) pi) { const Node& src = *all[(size_t) m.src];
            norm += src.type == "macro" ? src.modValue * (m.amt / 100.f) : (src.modValue - .5f) * 2 * (m.amt / 100.f); }
        norm = clampf(norm, 0, 1);
        p.real = p.log ? p.min * std::pow(p.max / p.min, norm) : p.min + norm * (p.max - p.min);
        if (p.opt) p.real = std::round(p.real);
    }
}

static float lfoValue(Node& m, Control& c) {
    const int ri = m.idx("rate"), si = m.idx("shape"), di = m.idx("depth"), ti = m.idx("retrig");
    float hz = m.P(ri, 1); const ParamInfo* rp = ri >= 0 ? &m.params[(size_t) ri] : nullptr;
    if (rp && rp->sync && rp->tag >= 0) hz = 1000.f / std::max(1.f, hz);
    const double tt = (m.P(ti, 0) > .5f && c.tOn >= 0) ? c.time - c.tOn : c.time, ph = std::fmod(tt * hz, 1.0);
    const int sh = (int) std::lround(m.P(si, 0)); float w;
    if (sh == 1) w = (float) (1 - std::fabs(ph * 4 - 2)); else if (sh == 2) w = (float) (ph * 2 - 1); else if (sh == 3) w = ph < .5 ? 1.f : -1.f;
    else if (sh == 4) w = (float) (hash01(std::floor(tt * hz) + (double) m.id.size()) * 2 - 1); else w = (float) std::sin(2 * kPi * ph);
    return .5f + .5f * w * (m.P(di, 100) / 100);
}
static float adsrValue(Node& m, Control& c) {
    if (c.tOn < 0) return .5f;
    const float a = m.P(m.idx("a"), 10) / 1000, d = m.P(m.idx("d"), 300) / 1000, s = m.P(m.idx("s"), 60) / 100, r = m.P(m.idx("r"), 400) / 1000;
    auto level = [&](double x) -> float { return x < a ? (a > 0 ? (float) (x / a) : 1.f) : x < a + d ? (float) (1 - (1 - s) * ((x - a) / std::max(1e-4f, d))) : s; };
    float e;
    if (c.gate) e = level(c.time - c.tOn);
    else { const double rel = c.time - c.tOff; const float at = level(c.tOff - c.tOn); e = rel >= r ? 0 : at * (float) (1 - rel / std::max(1e-4f, r)); }
    return .5f + .5f * e * (m.P(m.idx("depth"), 100) / 100);
}
static float modOut(Node& m, Control& c, double blockSec, const std::vector<TagDef>& tags) {
    const std::string& t = m.type;
    if (t == "lfo") return lfoValue(m, c);
    if (t == "adsr") return adsrValue(m, c);
    if (t == "midisrc") { const int s = (int) std::lround(m.P(m.idx("src"), 0)); if (s == 5) return c.bend;
        const float v = s == 0 ? c.vel / 127 : s == 1 ? c.key / 127 : s == 2 ? c.mod : s == 3 ? c.expr : c.at; return .5f + .5f * v; }
    if (t == "rand") {
        const float rate = std::max(.01f, m.P(m.idx("rate"), 4)), sm = m.P(m.idx("smooth"), 20), dep = m.P(m.idx("depth"), 100);
        const double step = std::floor(c.time * rate); m.randStep = step;
        const double target = hash01(step * 7.31 + (double) m.id.size() * 13);
        const double k = sm > 0 ? std::min(1.0, blockSec / (sm / 100.0 / rate + 1e-3)) : 1.0; m.randCur += (target - m.randCur) * k;
        return .5f + (float) (m.randCur - .5) * (dep / 100);
    }
    if (t == "macro") {
        if (!m.tagRef.empty()) for (size_t i = 0; i < tags.size(); ++i) if (tags[i].id == m.tagRef && (int) i < c.numTags) return c.tags[i].load();
        return m.P(m.idx("value"), 50) / 100;
    }
    if (t == "env") { auto* f = static_cast<FollowM*>(m.mod.get()); return f ? clampf(f->v * (m.P(m.idx("gain"), 70) / 100) * 3, 0, 1) : 0; }
    return .5f;
}

/* ================= building ================= */
static std::unique_ptr<Graph> buildGraph(const Json& g, const Json& ranges, const Library& lib, const std::vector<TagDef>& tags, Stereo* buses, std::vector<std::string>& unsupported) {
    auto G = std::make_unique<Graph>();
    std::map<std::string, int> byId;
    const Json& nodes = g["nodes"];
    for (size_t i = 0; i < nodes.size(); ++i) {
        const Json& nj = nodes[i]; auto nd = std::make_unique<Node>();
        nd->id = nj["id"].str(); nd->type = nj["type"].str(); nd->bypass = nj["bypass"].boolean();
        nd->sampleRef = nj["s"]["ir"].str(); nd->tagRef = nj["tag"]["value"].str();
        { const Json& bj = nj["byTag"]; const std::string tid = bj["tag"].str(); nd->byInv = bj["inv"].boolean(); nd->byTails = bj["tails"].boolean();
          if (!tid.empty()) for (size_t k = 0; k < tags.size(); ++k) if (tags[k].id == tid) nd->byTag = (int) k; }
        const TypeInfo* ti = nullptr; for (auto& t : types()) if (nd->type == t.type) ti = &t;
        const bool isFx = std::find(kFx.begin(), kFx.end(), nd->type) != kFx.end();
        if (ti) { nd->inNames = ti->ins; nd->outNames = ti->outs; nd->raw = ti->raw; nd->isMod = ti->mod; nd->io = nd->type == "input" || nd->type == "output"; }
        else { nd->inNames = { "in" }; nd->outNames = { "dry", "wet", "mix" }; nd->supported = isFx; if (!isFx) unsupported.push_back("fx:" + nd->type); }
        if (nd->inNames.empty()) nd->inNames = { "in" };   // modules without inputs still get one silent buffer
        nd->ins.resize(nd->inNames.size()); nd->outs.resize(std::max<size_t>(1, nd->outNames.size()));
        for (auto& s : nd->ins) s.clear(kBlock); for (auto& s : nd->outs) s.clear(kBlock); nd->wet.clear(kBlock);
        /* parameters: values from the file, ranges from the Maker's catalog */
        const Json& rr = ranges[nd->type.c_str()];
        for (auto& kv : nj["p"].o) {
            ParamInfo p; p.key = kv.first; p.raw = (float) kv.second.num(); p.real = p.raw;
            const Json& r = rr[kv.first.c_str()];
            if (r.size() >= 2) { p.known = true; p.min = (float) r[(size_t) 0].num(); p.max = (float) r[(size_t) 1].num(); p.opt = r[(size_t) 2].num() > .5; p.sync = r[(size_t) 3].num() > .5; p.log = r.size() > 4 && r[(size_t) 4].num() > .5 && p.min > 0; }
            const std::string tid = nj["tag"][kv.first.c_str()].str();
            if (!tid.empty()) for (size_t k = 0; k < tags.size(); ++k) if (tags[k].id == tid) p.tag = (int) k;
            nd->params.push_back(p);
        }
        if (!nd->io && (nd->supported || ti)) nd->mod = makeModule(*nd, lib);
        if (auto* s = dynamic_cast<SendM*>(nd->mod.get())) s->buses = buses;
        if (auto* r = dynamic_cast<ReturnM*>(nd->mod.get())) r->buses = buses;
        byId[nd->id] = (int) G->nodes.size(); G->nodes.push_back(std::move(nd));
    }
    const Json& cables = g["cables"];
    for (size_t i = 0; i < cables.size(); ++i) {
        const Json& c = cables[i]; auto a = byId.find(c["from"]["n"].str()), b = byId.find(c["to"]["n"].str());
        if (a == byId.end() || b == byId.end()) continue;
        Node& src = *G->nodes[(size_t) a->second]; Node& dst = *G->nodes[(size_t) b->second]; const std::string tp = c["to"]["p"].str();
        if (src.isMod) { if (tp.rfind("p:", 0) == 0) { const int pi = dst.idx(tp.substr(2).c_str()); if (pi >= 0) dst.mods.push_back({ pi, a->second, (float) c["amt"].num(50) }); } continue; }
        dst.incoming.push_back({ a->second, c["from"]["p"].str(), tp });
    }
    /* order: depth-first post-order, reversed; edges that go backwards read the previous block (feedback) */
    std::vector<int> state(G->nodes.size(), 0), post;
    std::function<void(int)> dfs = [&](int u) { state[(size_t) u] = 1;
        for (size_t v = 0; v < G->nodes.size(); ++v) for (auto& e : G->nodes[v]->incoming) if (e.src == u && state[v] == 0) dfs((int) v);
        state[(size_t) u] = 2; post.push_back(u); };
    for (size_t i = 0; i < G->nodes.size(); ++i) if (G->nodes[i]->type == "input") dfs((int) i);
    for (size_t i = 0; i < G->nodes.size(); ++i) if (!state[i]) dfs((int) i);
    G->order.assign(post.rbegin(), post.rend());
    return G;
}

static void runGraph(Graph& G, int n, Control& c, const std::vector<TagDef>& tags) {
    const double blockSec = n / c.sampleRate;
    for (auto& nd : G.nodes) if (nd->isMod) { evalParams(*nd, c, tags, G.nodes); if (nd->type != "env") nd->modValue = modOut(*nd, c, blockSec, tags); }
    for (int u : G.order) {
        Node& nd = *G.nodes[(size_t) u];
        for (auto& s : nd.ins) s.clear(n);
        for (auto& e : nd.incoming) {
            Node& src = *G.nodes[(size_t) e.src]; const Stereo* from = nullptr;
            if (src.type == "input") from = &G.input; else from = src.outPort(e.srcPort);
            if (!from) continue;
            for (size_t k = 0; k < nd.inNames.size(); ++k) if (nd.inNames[k] == e.dstPort) nd.ins[k].add(*from, n);
        }
        if (nd.type == "output") { std::memcpy(&G.output, &nd.ins[0], sizeof(Stereo)); continue; }
        if (nd.type == "input") continue;
        evalParams(nd, c, tags, G.nodes);
        if (nd.isMod) { if (nd.mod) { nd.mod->run(nd, n, c); nd.modValue = modOut(nd, c, blockSec, tags); } continue; }
        /* bypass: the switch in the editor, or a tag (on while the tag is on, unless reversed) */
        bool off = nd.bypass || !nd.mod, tails = false;
        if (!off && nd.byTag >= 0 && nd.byTag < c.numTags && c.tags) {
            const bool on = (c.tags[nd.byTag].load() >= .5f) != nd.byInv;
            if (!on) { if (nd.byTails && !nd.raw) tails = true; else off = true; }
        }
        if (nd.raw) {
            if (off) { for (auto& o : nd.outs) std::memcpy(&o, &nd.ins[0], sizeof(Stereo)); }
            else nd.mod->run(nd, n, c);
            continue;
        }
        /* effect: dry, wet and mix outputs */
        Stereo& x = nd.ins[0];
        if (off) nd.wet.clear(n);
        else if (tails) {   // input closed, the module keeps running so reverb and delay tails ring out
            std::memcpy(&nd.hold, &x, sizeof(Stereo)); x.clear(n); nd.mod->run(nd, n, c); std::memcpy(&x, &nd.hold, sizeof(Stereo));
        } else nd.mod->run(nd, n, c);
        const int mi = nd.idx("mix"); const float m0 = clampf(nd.P(mi, 100) / 100.f, 0, 1);
        const float dryT = off || tails ? 1.f : 1 - m0, wetT = off ? 0.f : m0;   // smoothed, so switching never clicks
        if (nd.mixPrev < 0) { nd.mixPrev = dryT; nd.wetPrev = wetT; }
        std::memcpy(&nd.outs[0], &x, sizeof(Stereo)); std::memcpy(&nd.outs[1], &nd.wet, sizeof(Stereo));
        for (int i = 0; i < n; ++i) { const float t = (float) (i + 1) / (float) n, dg = nd.mixPrev + (dryT - nd.mixPrev) * t, wg = nd.wetPrev + (wetT - nd.wetPrev) * t;
            nd.outs[2].l[i] = x.l[i] * dg + nd.wet.l[i] * wg; nd.outs[2].r[i] = x.r[i] * dg + nd.wet.r[i] * wg; }
        nd.mixPrev = dryT; nd.wetPrev = wetT;
        for (int i = 0; i < n; ++i) { if (!std::isfinite(nd.outs[2].l[i]) || !std::isfinite(nd.outs[2].r[i])) { nd.outs[2].clear(n); nd.outs[1].clear(n); break; } }
    }
}

std::unique_ptr<System> System::build(const Json& manifest, const Library& lib, const std::vector<TagDef>& tags,
                                      const std::vector<std::string>& groupNames, std::vector<std::string>& unsupported) {
    auto s = std::unique_ptr<System>(new System());
    s->tags_ = tags;
    const Json& graphs = manifest["project"]["fx"]; const Json& ranges = manifest["fxRanges"];
    auto realGraph = [](const Json& g) { for (size_t i = 0; i < g["nodes"].size(); ++i) { const std::string t = g["nodes"][i]["type"].str(); if (t != "input" && t != "output") return true; } return false; };
    if (realGraph(graphs["master"])) { s->master_ = buildGraph(graphs["master"], ranges, lib, tags, s->buses_, unsupported); s->any_ = true; }
    else { s->master_ = std::make_unique<Graph>(); }
    s->groups_.resize(groupNames.size());
    for (size_t g = 0; g < groupNames.size(); ++g) {
        const Json& gj = graphs[groupNames[g].c_str()];
        if (!gj.isNull() && realGraph(gj)) { s->groups_[g] = buildGraph(gj, ranges, lib, tags, s->buses_, unsupported); s->any_ = true; }
    }
    std::sort(unsupported.begin(), unsupported.end()); unsupported.erase(std::unique(unsupported.begin(), unsupported.end()), unsupported.end());
    return s;
}

System::~System() {}

void System::prepare(double sr) {
    auto prep = [&](Graph* g) { if (!g) return; for (auto& nd : g->nodes) if (nd->mod) nd->mod->prepare(sr); };
    prep(master_.get()); for (auto& g : groups_) prep(g.get());
}

Stereo& System::groupIn(int g) {
    if (g >= 0 && g < (int) groups_.size() && groups_[(size_t) g]) return groups_[(size_t) g]->input;
    return master_->input;
}

void System::process(int n, Control& c) {
    for (auto& b : buses_) b.clear(n);
    for (auto& g : groups_) if (g) { runGraph(*g, n, c, tags_); master_->input.add(g->output, n); }
    if (!master_->nodes.empty()) runGraph(*master_, n, c, tags_);
    else std::memcpy(&master_->output, &master_->input, sizeof(Stereo));
    master_->input.clear(n);
    for (auto& g : groups_) if (g) g->input.clear(n);
}

} // namespace fx
} // namespace visu
