// Checks the C++ engine against the JS core (golden vectors) and against the example library.
#include <memory>
#include "Engine.h"
#include <cmath>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>
#include <tuple>
#include <algorithm>

using namespace visu;
static int failures = 0, checks = 0;
#define CHECK(c, ...) do { ++checks; if (!(c)) { ++failures; std::printf("FAIL  "); std::printf(__VA_ARGS__); std::printf("\n"); } else { std::printf("ok    "); std::printf(__VA_ARGS__); std::printf("\n"); } } while (0)

static std::string readText(const std::string& p) { std::ifstream f(p, std::ios::binary); std::stringstream s; s << f.rdbuf(); return s.str(); }

static void renderNote(const std::shared_ptr<Library>& lib, int note, int vel, int frames, std::vector<float>& L, std::vector<float>& R) {
    auto ePtr = std::make_unique<Engine>(); Engine& e = *ePtr; e.prepare(44100); e.setMasterGain(1.f); e.setLibrary(lib);
    e.noteOn(note, vel); L.assign((size_t) frames, 0.f); R.assign((size_t) frames, 0.f);
    e.render(L.data(), R.data(), frames);
}

static void testJson() {
    const char* t = "{\"a\":[1,2.5,-3e2],\"s\":\"x\\u00e9\\u4e2d\\n\",\"b\":true,\"n\":null,\"o\":{\"k\":\"v\"}}";
    Json j = Json::parse(t, strlen(t));
    CHECK(j["a"].size() == 3 && j["a"][2].num() == -300, "json numbers");
    CHECK(j["s"].str() == "x\xC3\xA9\xE4\xB8\xAD\n", "json unicode escapes");
    CHECK(j["b"].boolean() && j["n"].isNull() && j["o"]["k"].str() == "v" && j["missing"].isNull(), "json values and missing keys");
    bool threw = false; try { Json::parse("{\"a\":", 5); } catch (...) { threw = true; } CHECK(threw, "json rejects broken input");
}

static void testGolden() {
    std::string err; auto lib = Library::load(std::string(TEST_DATA_DIR) + "/golden.vsamp", err);
    CHECK(lib != nullptr, "golden library loads %s", err.c_str());
    if (!lib) return;
    CHECK(lib->info.name == "Golden \xC3\xA9\xE4\xB8\xAD", "library name with unicode");
    std::string txt = readText(std::string(TEST_DATA_DIR) + "/golden.json");
    Json g = Json::parse(txt.data(), txt.size());
    const Json& cases = g["cases"];
    for (size_t c = 0; c < cases.size(); ++c) {
        const Json& cs = cases[c]; int note = cs["note"].integer(), frames = cs["frames"].integer();
        std::vector<float> L, R; renderNote(lib, note, cs["vel"].integer(), frames, L, R);
        double maxErr = 0, peak = 0;
        for (int i = 0; i < frames; ++i) {
            maxErr = std::max(maxErr, (double) std::fabs(L[(size_t) i] - cs["L"][(size_t) i].num()));
            maxErr = std::max(maxErr, (double) std::fabs(R[(size_t) i] - cs["R"][(size_t) i].num()));
            peak = std::max(peak, (double) std::fabs(cs["L"][(size_t) i].num()));
        }
        CHECK(peak > .05 && maxErr < 3e-4, "%s note %d matches the JS core (max error %.2e, peak %.2f)", cs["zone"].str().c_str(), note, maxErr, peak);
    }
}

static void testKeepSpeed() {
    std::string err; auto lib = Library::load(std::string(TEST_DATA_DIR) + "/golden.vsamp", err, 44100);
    if (!lib) { CHECK(false, "golden loads"); return; }
    auto run = [&](int note, double& seconds, int& crossings) {
        auto ePtr = std::make_unique<Engine>(); Engine& e = *ePtr; e.prepare(44100); e.setMasterGain(1); e.setLibrary(lib); e.noteOn(note, 127);
        std::vector<float> L(441), R(441); int last = 0, cross = 0; double prev = 0; long frames = 0;
        for (int b = 0; b < 400; ++b) { std::fill(L.begin(), L.end(), 0.f); std::fill(R.begin(), R.end(), 0.f); e.render(L.data(), R.data(), 441);
            for (int i = 0; i < 441; ++i, ++frames) { if (std::fabs(L[i]) > 1e-3) last = (int) frames; if (frames < 44100 * .4 && prev < 0 && L[i] >= 0) ++cross; prev = L[i]; } }
        seconds = last / 44100.0; crossings = cross;
    };
    double s1, s2; int c1, c2; run(103, s1, c1); run(110, s2, c2);
    CHECK(s1 > .9 && s1 < 1.1, "keep-speed at 50%% plays twice as long (%.2f s for a 0.5 s sample)", s1);
    CHECK(std::fabs(s2 - s1) < .1, "a higher note keeps the length (%.2f s vs %.2f s)", s2, s1);
    const double ratio = (double) c2 / std::max(1, c1);
    CHECK(ratio > 1.4 && ratio < 1.6, "a fifth up raises the pitch by about 1.5x (%.2f)", ratio);
}

// mono / legato / glide, pitch-bend range, voice limit and stealing (ported from EmulonX)
static void testPlay() {
    std::string err; auto lib = Library::load(std::string(TEST_DATA_DIR) + "/golden.vsamp", err, 44100);
    if (!lib) { CHECK(false, "golden loads"); return; }
    // the looped zone (keys 70-79, a 220 Hz sine at root 57) gives a steady tone
    auto hz = [](Engine& e, double secs) {
        const int n = (int) (secs * 44100); std::vector<float> L((size_t) n, 0.f), R((size_t) n, 0.f); e.render(L.data(), R.data(), n);
        int c = 0; for (int i = 1; i < n; ++i) if (L[(size_t) i - 1] < 0 && L[(size_t) i] >= 0) ++c; return c / secs;
    };
    const double base = 220 * std::pow(2.0, 15 / 12.0);   // note 72
    {   lib->play = {}; lib->play.bend = 12; auto ePtr = std::make_unique<Engine>(); Engine& e = *ePtr; e.prepare(44100); e.setLibrary(lib); e.noteOn(72, 110); hz(e, .05);
        const double f0 = hz(e, .2); e.pitchBend(1.f); hz(e, .02); const double f1 = hz(e, .2); e.pitchBend(0.f); hz(e, .02); const double f2 = hz(e, .2);
        CHECK(std::fabs(f0 / base - 1) < .03 && std::fabs(f1 / f0 - 2) < .06 && std::fabs(f2 / f0 - .5) < .03, "pitch bend with a 12-semitone range: up an octave and down an octave (%.0f, %.0f, %.0f Hz)", f0, f1, f2); }
    {   lib->play = {}; lib->play.mono = true; auto ePtr = std::make_unique<Engine>(); Engine& e = *ePtr; e.prepare(44100); e.setLibrary(lib);
        e.noteOn(72, 110); hz(e, .05); e.noteOn(76, 110); hz(e, .1); const int v = e.activeVoices(); const double f = hz(e, .2);
        CHECK(v == 1 && std::fabs(f / (base * std::pow(2.0, 4 / 12.0)) - 1) < .03, "mono: a new key replaces the old one (%d voice, %.0f Hz)", v, f);
        e.noteOff(76); hz(e, .02); const double back = hz(e, .2);
        CHECK(std::fabs(back / base - 1) < .03, "mono: letting go returns to the key still held (%.0f Hz)", back); }
    {   lib->play = {}; lib->play.mono = true; lib->play.legato = true; auto ePtr = std::make_unique<Engine>(); Engine& e = *ePtr; e.prepare(44100); e.setLibrary(lib);
        e.noteOn(72, 110); hz(e, .05); e.noteOn(76, 110); std::vector<float> L(64), R(64); e.render(L.data(), R.data(), 64);
        CHECK(e.activeVoices() == 1, "legato: the voice changes pitch without restarting (%d voice right after)", e.activeVoices()); }
    {   lib->play = {}; lib->play.mono = true; lib->play.glideMs = 300; auto ePtr = std::make_unique<Engine>(); Engine& e = *ePtr; e.prepare(44100); e.setLibrary(lib);
        e.noteOn(72, 110); hz(e, .05); e.noteOn(79, 110); const double early = hz(e, .04); hz(e, .3); const double late = hz(e, .1);
        CHECK(early < late * .85 && std::fabs(late / (base * std::pow(2.0, 7 / 12.0)) - 1) < .04, "glide slides up to the new note (%.0f Hz at first, %.0f Hz after)", early, late); }
    {   lib->play = {}; lib->play.maxVoices = 4; auto ePtr = std::make_unique<Engine>(); Engine& e = *ePtr; e.prepare(44100); e.setLibrary(lib);
        for (int k = 70; k < 78; ++k) e.noteOn(k, 100); hz(e, .1);
        CHECK(e.activeVoices() == 4, "a voice limit of 4 keeps 4 voices (%d)", e.activeVoices()); }
    {   lib->play = {}; auto ePtr = std::make_unique<Engine>(); Engine& e = *ePtr; e.prepare(44100); e.setLibrary(lib);
        for (int k = 70; k < 80; ++k) e.noteOn(k, 100); for (int k = 40; k < 50; ++k) e.noteOn(k, 100); hz(e, .02);
        const int before = e.activeVoices(); e.reportLoad(.97f); hz(e, .1);
        CHECK(before == 20 && e.activeVoices() <= 16 && e.voiceLimit() <= 16, "CPU guard: under load the voice limit drops (%d -> %d voices)", before, e.activeVoices());
        for (int i = 0; i < 400; ++i) e.reportLoad(.2f);
        CHECK(e.voiceLimit() == Engine::kMaxVoices, "CPU guard recovers when the load drops (%d)", e.voiceLimit()); }
    lib->play = {};
}

// granular and wavetable, played live by the engine
static void testLiveModes() {
    std::string err; auto lib = Library::load(std::string(TEST_DATA_DIR) + "/golden.vsamp", err, 44100);
    if (!lib) { CHECK(false, "golden loads"); return; }
    CHECK(lib->unsupportedZones == 0, "granular and wavetable zones are supported (%d unsupported)", lib->unsupportedZones);
    auto run = [&](int note, double secs, double& hz, double& rms, bool& fin) {
        auto ePtr = std::make_unique<Engine>(); Engine& e = *ePtr; e.prepare(44100); e.setMasterGain(1); e.setLibrary(lib); e.noteOn(note, 127);
        const int n = (int) (secs * 44100); std::vector<float> L((size_t) n, 0.f), R((size_t) n, 0.f);
        for (int o = 0; o < n; o += 441) e.render(L.data() + o, R.data() + o, std::min(441, n - o));
        int c = 0; double sq = 0; fin = true; const int from = n / 2;
        for (int i = from; i < n; ++i) { if (!std::isfinite(L[(size_t) i])) fin = false; if (L[(size_t) i - 1] < 0 && L[(size_t) i] >= 0) ++c; sq += (double) L[(size_t) i] * L[(size_t) i]; }
        hz = c / (secs - from / 44100.0); rms = std::sqrt(sq / (n - from));
    };
    double hz, rms, hz2, rms2; bool fin, fin2;
    run(117, 3, hz, rms, fin);
    CHECK(fin && rms > .05, "granular keeps sounding while held, no loop end (rms %.3f after 1.5 s)", rms);
    run(120, 3, hz2, rms2, fin2);
    CHECK(hz2 / hz > 1.1 && hz2 / hz < 1.3, "granular follows the keyboard (x%.2f for 3 semitones)", hz2 / hz);
    run(9, 1, hz, rms, fin);
    CHECK(fin && std::fabs(hz / 440 - 1) < .01, "wavetable plays the exact pitch (%.1f Hz for A 440)", hz);
    run(16, 1, hz2, rms, fin);
    CHECK(std::fabs(hz2 / hz - std::pow(2.0, 7 / 12.0)) < .01, "wavetable follows the keyboard (x%.3f for a fifth)", hz2 / hz);
    lib->setTag("wtpos", 1.f); run(9, 1, hz2, rms, fin); lib->setTag("wtpos", 0.f);
    CHECK(std::fabs(hz2 / hz - 3) < .05, "a knob moves the wavetable position live (frame 2 is the third harmonic: x%.2f)", hz2 / hz);
}

// per-note ADSR on a group
static void testGroupEnv() {
    std::string err; auto lib = Library::load(std::string(TEST_DATA_DIR) + "/golden.vsamp", err, 44100);
    if (!lib) { CHECK(false, "golden loads"); return; }
    // the looped zone (keys 70-79) holds a tone; compare its level every 10 ms with the same note played without the envelope
    auto levels = [&](Engine& e, int blocks, std::vector<double>& out) {
        std::vector<float> L(441), R(441);
        for (int b = 0; b < blocks; ++b) { std::fill(L.begin(), L.end(), 0.f); std::fill(R.begin(), R.end(), 0.f); e.render(L.data(), R.data(), 441);
            double sq = 0; for (float x : L) sq += (double) x * x; out.push_back(std::sqrt(sq / 441)); }
    };
    std::vector<double> ref; { auto e0Ptr = std::make_unique<Engine>(); Engine& e0 = *e0Ptr; e0.prepare(44100); e0.setMasterGain(1); e0.setLibrary(lib); e0.noteOn(72, 127); levels(e0, 200, ref); }
    for (auto& g : lib->groups) { g.envOn = true; g.envA = 100; g.envD = 100; g.envS = .5f; g.envR = 200; }
    auto ePtr = std::make_unique<Engine>(); Engine& e = *ePtr; e.prepare(44100); e.setMasterGain(1); e.setLibrary(lib); e.noteOn(72, 127);
    std::vector<double> lv; levels(e, 50, lv);
    const double at5 = lv[4] / ref[4], sus = lv[45] / ref[45];
    CHECK(at5 < .65 && at5 > .3, "attack rises over 100 ms (%.2f after 45 ms)", at5);
    CHECK(std::fabs(sus - .5) < .04, "decay settles on the 50%% sustain (%.2f)", sus);
    e.noteOff(72); std::vector<double> rl; levels(e, 30, rl);
    CHECK(rl[9] / ref[59] < .3 && rl[9] / ref[59] > .15 && e.activeVoices() == 0, "release fades out over 200 ms (%.2f after 100 ms, %d voices left)", rl[9] / ref[59], e.activeVoices());
    // a knob drives the sustain live
    for (auto& g : lib->groups) g.envTag[2] = 0;
    lib->setTag("wtpos", .2f);
    auto e2Ptr = std::make_unique<Engine>(); Engine& e2 = *e2Ptr; e2.prepare(44100); e2.setMasterGain(1); e2.setLibrary(lib); e2.noteOn(72, 127); std::vector<double> k; levels(e2, 60, k);
    lib->setTag("wtpos", .8f); levels(e2, 80, k);
    CHECK(std::fabs(k[59] / ref[59] - .2) < .03 && std::fabs(k[139] / ref[139] - .8) < .04, "a knob on sustain changes held notes (%.2f then %.2f)", k[59] / ref[59], k[139] / ref[139]);
    for (auto& g : lib->groups) { g.envOn = false; g.envTag[2] = -1; }
    lib->setTag("wtpos", 0.f);
}

static void testDemo() {
    std::string err; auto lib = Library::load(std::string(EXAMPLES_DIR) + "/rompler-demo.vsamp", err);
    CHECK(lib != nullptr, "demo library loads %s", err.c_str());
    if (!lib) return;
    CHECK(lib->zones.size() == 15 && lib->groups.size() == 4 && lib->unsupportedZones == 0, "demo has 15 zones, 4 groups (%zu, %zu)", lib->zones.size(), lib->groups.size());
    LibraryInfo info; std::string e2;
    CHECK(Library::readInfo(std::string(EXAMPLES_DIR) + "/rompler-demo.vsamp", info, e2) && info.name == "Rompler Demo" && info.bannerTile.size() > 100, "info and banner read without decoding audio");
    auto ePtr = std::make_unique<Engine>(); Engine& e = *ePtr; e.prepare(48000); e.setLibrary(lib);
    std::vector<float> L(4800, 0.f), R(4800, 0.f);
    e.noteOn(50, 100); e.noteOn(55, 40); e.noteOn(62, 127);
    e.render(L.data(), R.data(), 4800);
    double peak = 0; bool finite = true; for (size_t i = 0; i < L.size(); ++i) { peak = std::max(peak, (double) std::fabs(L[i])); if (!std::isfinite(L[i]) || !std::isfinite(R[i])) finite = false; }
    CHECK(finite && peak > .01 && peak < 4, "chord plays, finite, peak %.3f", peak);
    CHECK(e.activeVoices() >= 3, "voices active: %d", e.activeVoices());
    e.noteOff(50); e.noteOff(55); e.noteOff(62);
    for (int b = 0; b < 40; ++b) { std::fill(L.begin(), L.end(), 0.f); std::fill(R.begin(), R.end(), 0.f); e.render(L.data(), R.data(), 4800); }
    CHECK(e.activeVoices() < 6, "voices die after release: %d left", e.activeVoices());
    // round robin hammers: consecutive hits differ in which sample plays
    std::vector<float> a1(2000, 0.f), b1(2000, 0.f), a2(2000, 0.f), b2(2000, 0.f);
    { auto rPtr = std::make_unique<Engine>(); Engine& r = *rPtr; r.prepare(44100); r.setLibrary(lib); r.noteOn(40, 100); r.render(a1.data(), b1.data(), 2000); r.allNotesOff(); r.noteOn(40, 100); r.render(a2.data(), b2.data(), 2000); }
    double diff = 0; for (int i = 0; i < 2000; ++i) diff += std::fabs(a1[(size_t) i] - a2[(size_t) i]);
    CHECK(diff > 1e-3, "round robin changes the sound between hits (diff %.3f)", diff);
    // a corrupted file is refused
    std::string path = std::string(TEST_DATA_DIR) + "/golden.vsamp"; std::ifstream f(path, std::ios::binary); std::vector<uint8_t> b((std::istreambuf_iterator<char>(f)), {});
    b[b.size() - 10] ^= 0xFF; VsampFile vf; std::string er; bool opened = vf.openBytes(b, er);
    bool blobBad = false;
    if (opened) { const Json& m = vf.manifest(); for (size_t i = 0; i < m["samples"].size(); ++i) { std::vector<uint8_t> out; std::string e3; if (!vf.blob(VsampFile::ref(m["samples"][i]["data"]), out, e3)) blobBad = true; } }
    CHECK(!opened || blobBad, "corrupted data is caught");
    std::vector<uint8_t> junk(40, 7); VsampFile v2; std::string e4; CHECK(!v2.openBytes(junk, e4) && !e4.empty(), "junk file refused: %s", e4.c_str());
}

static void testLibrarySwap() {
    std::string err; auto a = Library::load(std::string(TEST_DATA_DIR) + "/golden.vsamp", err), b = Library::load(std::string(EXAMPLES_DIR) + "/rompler-demo.vsamp", err);
    auto ePtr = std::make_unique<Engine>(); Engine& e = *ePtr; e.prepare(44100); std::vector<float> L(512), R(512);
    for (int i = 0; i < 20; ++i) { e.setLibrary(i % 2 ? a : b); e.noteOn(55, 100); std::fill(L.begin(), L.end(), 0.f); std::fill(R.begin(), R.end(), 0.f); e.render(L.data(), R.data(), 512); }
    e.setLibrary(nullptr); e.render(L.data(), R.data(), 512);
    CHECK(true, "libraries can be swapped and unloaded while playing");
}

static void testFx() {
    const std::string dir = TEST_DATA_DIR; std::string txt = readText(dir + "/fx-cases.json"), err;
    Json cases = Json::parse(txt.data(), txt.size());
    auto lib = Library::load(dir + "/fx.vsamp", err, 48000);
    CHECK(lib != nullptr && lib->fx && lib->fx->hasAny(), "fx test library loads with its chains %s", err.c_str());
    if (!lib) return;
    CHECK(lib->unsupported.empty(), "every module in the catalog is supported (%zu missing%s%s)", lib->unsupported.size(), lib->unsupported.empty() ? "" : ": ", lib->unsupported.empty() ? "" : lib->unsupported[0].c_str());
    auto renderKey = [&](int key, double secs, float tagCut, std::vector<float>* env) {
        auto L = Library::load(dir + "/fx.vsamp", err, 48000); if (tagCut >= 0) L->setTag("cut", tagCut);
        auto ePtr = std::make_unique<Engine>(); Engine& e = *ePtr; e.prepare(48000); e.setMasterGain(1.f); e.setLibrary(L); e.noteOn(key, 110);
        std::vector<float> l(480), r(480); double peak = 0, sum = 0; bool fin = true; const int blocks = (int) (secs * 100);
        for (int b = 0; b < blocks; ++b) { std::fill(l.begin(), l.end(), 0.f); std::fill(r.begin(), r.end(), 0.f); e.render(l.data(), r.data(), 480);
            double bs = 0; for (int i = 0; i < 480; ++i) { if (!std::isfinite(l[i]) || !std::isfinite(r[i])) fin = false; peak = std::max(peak, (double) std::max(std::fabs(l[i]), std::fabs(r[i]))); bs += l[i] * l[i] + r[i] * r[i]; }
            sum += bs; if (env) env->push_back((float) std::sqrt(bs / 960)); if (b == blocks / 2) e.noteOff(key); }
        return std::make_tuple(fin, peak, std::sqrt(sum / (blocks * 960.0)));
    };
    for (size_t i = 0; i < cases.size(); ++i) {
        const std::string mod = cases[i]["module"].str(); const int key = cases[i]["key"].integer();
        if (mod == "lfo-mod" || mod == "tag") continue;
        const double secs = mod == "feedback" ? 3 : 1;
        auto [fin, peak, rms] = renderKey(key, secs, -1, nullptr);
        CHECK(fin && peak > 1e-3 && peak < 8, "%s: finite and audible (peak %.3f, rms %.4f)", mod.c_str(), peak, rms);
    }
    int lfoKey = 0, tagKey = 0; for (size_t i = 0; i < cases.size(); ++i) { if (cases[i]["module"].str() == "lfo-mod") lfoKey = cases[i]["key"].integer(); if (cases[i]["module"].str() == "tag") tagKey = cases[i]["key"].integer(); }
    { std::vector<float> env; renderKey(lfoKey, 1, -1, &env); double ripple = 0; for (size_t i = 2; i + 2 < env.size() / 2; ++i) { const double sm = (env[i - 1] + env[i + 1]) / 2; ripple += std::fabs(env[i] - sm); }
      CHECK(ripple > .002, "an LFO on the filter cutoff makes the sound move (ripple %.4f)", ripple); }
    { auto open_ = renderKey(tagKey, .6, .95f, nullptr), shut = renderKey(tagKey, .6, 0.f, nullptr);
      CHECK(std::get<2>(open_) > std::get<2>(shut) * 1.5, "a knob (tag) linked to the cutoff changes the sound (%.4f vs %.4f)", std::get<2>(open_), std::get<2>(shut)); }
}

int main() {
    testJson(); testGolden(); testKeepSpeed(); testPlay(); testLiveModes(); testGroupEnv(); testDemo(); testLibrarySwap(); testFx();
    std::printf("\n%d checks, %d failed\n", checks, failures);
    return failures ? 1 : 0;
}
