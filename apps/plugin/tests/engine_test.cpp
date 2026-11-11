// Checks the C++ engine against the JS core (golden vectors) and against the example library.
#include <memory>
#include <thread>
#include <chrono>
#include <cstdio>
#include "Engine.h"
#include "FxRack.h"
#include "Synth.h"
#include <cmath>
#include <complex>
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
    // a group with its own way of playing: mono or legato on its own, or poly while the rest is mono
    int tg = -1; for (auto& z : lib->zones) if (72 >= z.lo && 72 <= z.hi && z.audio.loop) { tg = z.group; break; }
    if (tg < 0) { CHECK(false, "the looped zone's group"); }
    else {
        auto own = [&](int mode, float glide, bool globalMono) { lib->play = {}; lib->play.mono = globalMono; for (auto& g : lib->groups) { g.pmode = 0; g.glideMs = 0; }
            lib->groups[(size_t) tg].pmode = mode; lib->groups[(size_t) tg].glideMs = glide; lib->anyOwnMode = mode != 0; };
        {   own(2, 0, false); auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(44100); e.setLibrary(lib);
            e.noteOn(72, 110); hz(e, .05); e.noteOn(76, 110); hz(e, .1); const int v = e.activeVoices(); const double f = hz(e, .2);
            e.noteOff(76); hz(e, .02); const double back = hz(e, .2);
            CHECK(v == 1 && std::fabs(f / (base * std::pow(2.0, 4 / 12.0)) - 1) < .03 && std::fabs(back / base - 1) < .03, "a group set to mono plays one note while the library is poly (%d voice, %.0f Hz, back to %.0f Hz)", v, f, back); }
        {   own(3, 300, false); auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(44100); e.setLibrary(lib);
            e.noteOn(72, 110); hz(e, .05); e.noteOn(79, 110); std::vector<float> L(64), R(64); e.render(L.data(), R.data(), 64); const int v = e.activeVoices();
            const double early = hz(e, .04); hz(e, .3); const double late = hz(e, .1);
            CHECK(v == 1 && early < late * .85 && std::fabs(late / (base * std::pow(2.0, 7 / 12.0)) - 1) < .04, "a group set to legato with its own glide slides without restarting (%d voice, %.0f then %.0f Hz)", v, early, late); }
        {   own(1, 0, true); auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(44100); e.setLibrary(lib);
            e.noteOn(72, 110); e.noteOn(76, 110); hz(e, .1);
            CHECK(e.activeVoices() == 2, "a group set to poly plays chords while the rest of the library is mono (%d voices)", e.activeVoices()); }
        own(0, 0, false);
    }
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

// a filter per note: velocity, key tracking and its envelope move the cutoff; an LFO per note
static void testVFilter() {
    std::string err; auto lib = Library::load(std::string(TEST_DATA_DIR) + "/golden.vsamp", err, 44100);
    if (!lib) { CHECK(false, "golden loads"); return; }
    auto levels = [&](int note, int vel, int blocks, std::vector<double>& out, std::vector<int>* zc = nullptr) {
        auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(44100); e.setMasterGain(1); e.setLibrary(lib); e.noteOn(note, vel);
        std::vector<float> L(441), R(441); float prev = 0;
        for (int b = 0; b < blocks; ++b) { std::fill(L.begin(), L.end(), 0.f); std::fill(R.begin(), R.end(), 0.f); e.render(L.data(), R.data(), 441);
            double sq = 0; int c = 0; for (float x : L) { sq += (double) x * x; if (prev < 0 && x >= 0) ++c; prev = x; if (!std::isfinite(x)) sq = 1e9; }
            out.push_back(std::sqrt(sq / 441)); if (zc) zc->push_back(c); }
    };
    auto avg = [](const std::vector<double>& v, int a, int b) { double s = 0; for (int i = a; i < b; ++i) s += v[(size_t) i]; return s / (b - a); };
    std::vector<double> ref; levels(72, 127, 60, ref);
    for (auto& g : lib->groups) { g.vf = {}; g.vf.on = true; g.vf.type = 1; g.vf.cutoff = 100; }
    std::vector<double> lo; levels(72, 127, 40, lo);
    CHECK(avg(lo, 20, 40) < avg(ref, 20, 40) * .02, "a 24 dB low-pass far below the note silences it (%.4f)", avg(lo, 20, 40) / avg(ref, 20, 40));
    for (auto& g : lib->groups) g.vf.vel = 60;
    std::vector<double> soft, hard; levels(72, 20, 40, soft); levels(72, 127, 40, hard);
    CHECK(avg(hard, 20, 40) > avg(soft, 20, 40) * 5 && avg(hard, 20, 40) > avg(ref, 20, 40) * .8, "harder notes open the filter (soft %.3f, hard %.3f of the dry level)", avg(soft, 20, 40) / avg(ref, 20, 40), avg(hard, 20, 40) / avg(ref, 20, 40));
    for (auto& g : lib->groups) { g.vf.vel = 0; g.vf.env = 60; g.vf.a = 0; g.vf.d = 150; g.vf.s = 0; }
    std::vector<double> sw; levels(72, 127, 60, sw);
    CHECK(sw[1] / ref[1] > .7 && sw[50] / ref[50] < .05, "the filter envelope sweeps from open to closed (%.2f then %.3f)", sw[1] / ref[1], sw[50] / ref[50]);
    for (auto& g : lib->groups) { g.vf = {}; g.vf.on = true; g.vf.type = 2; g.vf.cutoff = 20000; }
    std::vector<double> hp; levels(72, 127, 40, hp);
    CHECK(avg(hp, 20, 40) < avg(ref, 20, 40) * .05, "a high-pass at the top removes the note (%.4f)", avg(hp, 20, 40) / avg(ref, 20, 40));
    for (auto& g : lib->groups) { g.vf = {}; g.vl = {}; g.vl.on = true; g.vl.rate = 2; g.vl.pitch = 200; }
    std::vector<double> d; std::vector<int> zc; levels(72, 127, 100, d, &zc);
    int mn = 1 << 30, mx = 0; for (int i = 0; i + 10 <= 100; i += 10) { int s = 0; for (int k = i; k < i + 10; ++k) s += zc[(size_t) k]; mn = std::min(mn, s); mx = std::max(mx, s); }
    CHECK(mx > mn * 1.15, "the LFO bends the pitch up and down (%d to %d cycles per 100 ms)", mn, mx);
    for (auto& g : lib->groups) { g.vl = {}; g.vl.on = true; g.vl.rate = 5; g.vl.vol = 1; }
    std::vector<double> tr; levels(72, 127, 60, tr); for (auto& g : lib->groups) g.vl = {}; std::vector<double> r60; levels(72, 127, 60, r60);
    double tmn = 9, tmx = 0; for (int i = 20; i < 60; ++i) { tmn = std::min(tmn, tr[(size_t) i] / r60[(size_t) i]); tmx = std::max(tmx, tr[(size_t) i] / r60[(size_t) i]); }
    CHECK(tmx > .8 && tmn < .2, "the LFO on volume makes a tremolo (%.2f to %.2f)", tmn, tmx);
    for (auto& g : lib->groups) { g.vf = {}; g.vl = {}; }
}

// knobs on a group's volume, pan and tuning
static void testGroupLinks() {
    std::string err; auto lib = Library::load(std::string(TEST_DATA_DIR) + "/golden.vsamp", err, 44100);
    if (!lib) { CHECK(false, "golden loads"); return; }
    auto play = [&](float tagv, double& rmsL, double& rmsR, double& hz) {
        lib->setTag("wtpos", tagv);
        auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(44100); e.setMasterGain(1); e.setLibrary(lib); e.noteOn(72, 127);
        const int n = 8820; std::vector<float> L(n, 0.f), R(n, 0.f); for (int o = 0; o < n; o += 441) e.render(L.data() + o, R.data() + o, 441);
        double sl = 0, sr = 0; int c = 0; for (int i = 4410; i < n; ++i) { sl += L[i] * L[i]; sr += R[i] * R[i]; if (L[i - 1] < 0 && L[i] >= 0) ++c; }
        rmsL = std::sqrt(sl / 4410); rmsR = std::sqrt(sr / 4410); hz = c / .1;
    };
    double l0, r0, h0, l1, r1, h1, lh, rh, hh;
    play(0, l0, r0, h0);   // reference: nothing linked
    for (auto& g : lib->groups) { g.lVol.tag = 0; g.lVol.from = 0; g.lVol.to = -60; }
    play(0, l1, r1, h1); play(.5f, lh, rh, hh); double ls, rs, hs; play(1, ls, rs, hs);
    CHECK(std::fabs(l1 / l0 - 1) < .02 && std::fabs(lh / l0 - .707) < .03 && ls < l0 * .01, "a knob fades a group out with equal power (%.2f, %.2f, %.3f)", l1 / l0, lh / l0, ls / l0);
    for (auto& g : lib->groups) { g.lVol.tag = -1; g.lPan.tag = 0; g.lPan.from = -100; g.lPan.to = 100; }
    play(0, l1, r1, h1); play(1, ls, rs, hs);
    CHECK(r1 < l1 * .05 && ls < rs * .05, "a knob pans a group from left to right (%.3f, %.3f)", r1 / l1, ls / rs);
    for (auto& g : lib->groups) { g.lPan.tag = -1; g.lTune.tag = 0; g.lTune.from = -12; g.lTune.to = 12; }
    play(.5f, l1, r1, h1); play(1, ls, rs, hs);
    CHECK(std::fabs(h1 / h0 - 1) < .03 && std::fabs(hs / h0 - 2) < .06, "a knob retunes a group in semitones (x%.2f in the middle, x%.2f at the top)", h1 / h0, hs / h0);
    for (auto& g : lib->groups) { g.lTune.tag = -1; }
    lib->setTag("wtpos", 0);
}

// long samples stream from disk and sound exactly like the same library fully in memory
static void testStreaming() {
    for (const char* name : { "stream.vsamp", "stream-z.vsamp", "stream-loop.vsamp" }) {
        const bool looped = std::string(name) == "stream-loop.vsamp";
        const std::string path = std::string(TEST_DATA_DIR) + "/" + name; std::string err;
        auto disk = Library::load(path, err, 48000);
        std::vector<uint8_t> bytes; { std::FILE* f = std::fopen(path.c_str(), "rb"); std::fseek(f, 0, SEEK_END); bytes.resize((size_t) std::ftell(f)); std::fseek(f, 0, SEEK_SET); if (std::fread(bytes.data(), 1, bytes.size(), f) != bytes.size()) bytes.clear(); std::fclose(f); }
        auto mem = Library::loadBytes(bytes, err, 48000);
        if (!disk || !mem) { CHECK(false, "%s loads (%s)", name, err.c_str()); continue; }
        CHECK(disk->streamedSamples() == 1 && mem->streamedSamples() == 0 && disk->memoryBytes() * (looped ? 2 : 3) < mem->memoryBytes(),
              "%s: the long sample streams; %.1f MB in memory instead of %.1f MB", name, disk->memoryBytes() / 1048576.0, mem->memoryBytes() / 1048576.0);
        for (int note : looped ? std::vector<int>{ 60, 63, 72, 84, 100 } : std::vector<int>{ 60, 79, 96 }) {   // straight, pitched up (faster reading), and a zone that starts 3 s in; looped: crossfade loop, ping-pong, an early loop kept in memory
            auto a = std::make_unique<Engine>(), b = std::make_unique<Engine>();
            a->prepare(48000); b->prepare(48000); a->setMasterGain(1); b->setMasterGain(1); a->setLibrary(disk); b->setLibrary(mem);
            a->noteOn(note, 110); b->noteOn(note, 110);
            std::vector<float> la(480), ra(480), lb(480), rb(480); double maxd = 0, peak = 0; const long miss0 = a->streamMisses(); int streaming = 0;
            for (int blk = 0; blk < (looped ? 1200 : 500); ++blk) {   // 5 s (12 s for loops: several rounds), about five times faster than real time
                std::fill(la.begin(), la.end(), 0.f); std::fill(ra.begin(), ra.end(), 0.f); std::fill(lb.begin(), lb.end(), 0.f); std::fill(rb.begin(), rb.end(), 0.f);
                a->render(la.data(), ra.data(), 480); b->render(lb.data(), rb.data(), 480); streaming = std::max(streaming, a->streamingVoices());
                for (int i = 0; i < 480; ++i) { maxd = std::max(maxd, (double) std::max(std::fabs(la[i] - lb[i]), std::fabs(ra[i] - rb[i]))); peak = std::max(peak, (double) std::fabs(lb[i])); }
                std::this_thread::sleep_for(std::chrono::milliseconds(2));
            }
            CHECK(streaming == (looped && note >= 91 ? 0 : 1) && maxd < 1e-5 && peak > .1 && a->streamMisses() == miss0, "%s note %d: streamed audio matches memory (max difference %.2g, %ld late reads)", name, note, maxd, a->streamMisses() - miss0);
        }
        /* offline (a DAW bounce): as fast as the CPU goes, with no pauses, the stream waits for the disk and never drops out */
        {
            const int note = looped ? 63 : 79;
            auto a = std::make_unique<Engine>(), b = std::make_unique<Engine>();
            a->prepare(48000); b->prepare(48000); a->setMasterGain(1); b->setMasterGain(1); a->setOffline(true); a->setLibrary(disk); b->setLibrary(mem);
            a->noteOn(note, 110); b->noteOn(note, 110);
            std::vector<float> la(480), ra(480), lb(480), rb(480); double maxd = 0; const long miss0 = a->streamMisses();
            for (int blk = 0; blk < (looped ? 1200 : 500); ++blk) {
                std::fill(la.begin(), la.end(), 0.f); std::fill(ra.begin(), ra.end(), 0.f); std::fill(lb.begin(), lb.end(), 0.f); std::fill(rb.begin(), rb.end(), 0.f);
                a->render(la.data(), ra.data(), 480); b->render(lb.data(), rb.data(), 480);
                for (int i = 0; i < 480; ++i) maxd = std::max(maxd, (double) std::max(std::fabs(la[i] - lb[i]), std::fabs(ra[i] - rb[i])));
            }
            CHECK(maxd < 1e-5 && a->streamMisses() == miss0, "%s offline, full speed: streamed audio matches memory (max difference %.2g, %ld late reads)", name, maxd, a->streamMisses() - miss0);
        }
    }
}

// keyswitches: a note that picks a list and makes no sound
static void testKeyswitch() {
    std::string err; auto lib = Library::load(std::string(EXAMPLES_DIR) + "/rompler-demo.vsamp", err);
    if (!lib || lib->lists.size() < 3) { CHECK(false, "demo with lists"); return; }
    lib->lists[0].ks = 24; lib->lists[2].ks = 26;
    auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(48000); e.setLibrary(lib);
    std::vector<float> L(4800), R(4800);
    e.noteOn(26, 100); e.render(L.data(), R.data(), 480);
    CHECK(e.list() == 2 && e.activeVoices() == 0 && e.takeKeyswitchChange(), "a keyswitch picks its list and stays silent (list %d, %d voices)", e.list(), e.activeVoices());
    e.noteOff(26); e.noteOn(60, 100); e.render(L.data(), R.data(), 480);
    const int v2 = e.activeVoices(); e.noteOff(60); for (int i = 0; i < 40; ++i) e.render(L.data(), R.data(), 480);
    e.noteOn(24, 100); e.noteOn(60, 100); e.render(L.data(), R.data(), 480);
    CHECK(e.list() == 0 && v2 > 0 && e.activeVoices() > 0, "another keyswitch switches again, and notes play the chosen list (%d then %d voices)", v2, e.activeVoices());
}

// layer B: a second patch from the same lists plays at the same time, with its own knobs
static void testLayers() {
    std::string err; auto lib = Library::load(std::string(EXAMPLES_DIR) + "/rompler-demo.vsamp", err);
    if (!lib || lib->lists.size() < 3 || lib->tags.empty()) { CHECK(false, "demo with lists and tags"); return; }
    // a fresh copy each time: the library's effects keep their tails between runs
    auto fresh = [&]() { std::string e2; auto c = Library::load(std::string(EXAMPLES_DIR) + "/rompler-demo.vsamp", e2); c->layerB = lib->layerB; c->layers[0] = lib->layers[0]; c->layers[1] = lib->layers[1];
        for (size_t i = 0; i < c->tags.size(); ++i) c->tagValues[i].store(lib->tagValues[i].load()); return c; };
    auto run = [&](int la, int lb, double& rms, int& voices) {
        auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(48000); e.setMasterGain(1); e.setLibrary(fresh()); e.setList(la); e.setListB(lb);
        e.noteOn(60, 100); std::vector<float> L(480), R(480); double sq = 0; int n = 0;
        for (int b = 0; b < 40; ++b) { std::fill(L.begin(), L.end(), 0.f); std::fill(R.begin(), R.end(), 0.f); e.render(L.data(), R.data(), 480); if (b == 0) voices = e.activeVoices(); if (b >= 10) for (float x : L) { sq += (double) x * x; ++n; } }
        rms = std::sqrt(sq / n);
    };
    double a, b, ab, aa; int va, vb, vab, vaa;
    lib->layerB = false; run(0, 2, a, va);
    CHECK(va > 0, "without layer B only patch A plays (%d voices)", va);
    lib->layerB = true; run(2, -3, b, vb); run(0, 2, ab, vab); run(0, 0, aa, vaa);
    CHECK(vab == va + vb && vaa == 2 * va, "layer B plays a second patch from the same lists at once (%d + %d = %d voices; the same patch twice: %d)", va, vb, vab, vaa);
    CHECK(aa / a > 1.3 && aa / a < 2.05, "the same patch on both layers is louder (x%.2f; humanize makes the copies differ)", aa / a);
    lib->layers[1].lVol.tag = 0; lib->layers[1].lVol.from = 0; lib->layers[1].lVol.to = -60; lib->tagValues[0].store(1.f);
    double m, a1; int vm; run(0, 0, m, vm); run(0, -3, a1, vm);
    CHECK(std::fabs(m / a1 - 1) < .03, "a knob on layer B's volume fades it out and leaves A alone (x%.2f of A)", m / a1);
    lib->tagValues[0].store(0.f); lib->layers[1].lTune.tag = 0; lib->layers[1].lTune.from = 0; lib->layers[1].lTune.to = 12; lib->tagValues[0].store(1.f);
    lib->layers[1].lVol.tag = -1;
    lib->layers[1].lTune.tag = -1; lib->tagValues[0].store(0.f);
    lib->layers[1].envOn = true; lib->layers[1].envA = 300; lib->layers[1].envD = 0; lib->layers[1].envS = 1; lib->layers[1].envR = 100;
    auto early = [&](int la, int lb) { auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(48000); e.setMasterGain(1); e.setLibrary(fresh()); e.setList(la); e.setListB(lb);
        e.noteOn(60, 100); std::vector<float> L(2400, 0.f), R(2400, 0.f); e.render(L.data(), R.data(), 2400); double sq = 0; for (float x : L) sq += (double) x * x; return std::sqrt(sq / 2400); };
    const double eA = early(0, -3), eAB = early(0, 0);
    CHECK(eAB < eA * 1.4, "layer B's own envelope fades it in slowly while A starts at once (x%.2f in the first 50 ms)", eAB / eA);
    lib->layers[1] = GroupCfg(); lib->layerB = false;
}

// patch mode "group": a list is a folder and each of its groups is one patch; samples can play on the key's release
static void testGroupPatches() {
    auto blk = [](Engine& e) { std::vector<float> L(480), R(480); e.render(L.data(), R.data(), 480); };
    std::string err; auto lib = Library::load(std::string(EXAMPLES_DIR) + "/rompler-demo.vsamp", err);
    if (!lib || lib->lists.empty()) { CHECK(false, "demo with lists"); return; }
    // a folder of the groups that play on key press
    std::vector<int> folder; for (size_t g = 0; g < lib->groups.size(); ++g) if (lib->groups[g].mode != GroupMode::Release) folder.push_back((int) g);
    if (folder.size() < 2) { CHECK(false, "two normal groups"); return; }
    const int li = 0; lib->lists[0].groups = folder; lib->lists[0].slots = folder;
    // count voices per group of the folder, list mode (only that group in the list) against group-patch mode
    bool same = true; std::string log; std::vector<int> per(folder.size(), 0);
    for (size_t p = 0; p < folder.size(); ++p) for (int note = 24; note <= 100; note += 4) {
        lib->groupPatches = false; lib->lists[(size_t) li].groups = { folder[p] }; lib->lists[(size_t) li].slots = { folder[p] };
        int want, got;
        { auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(48000); e.setLibrary(lib); e.setList(li); e.noteOn(note, 100); blk(e); want = e.activeVoices(); }
        lib->groupPatches = true; lib->lists[(size_t) li].groups = folder; lib->lists[(size_t) li].slots = folder;
        { auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(48000); e.setLibrary(lib); e.setList(li); e.setPatch(0, (int) p); e.noteOn(note, 100); blk(e); got = e.activeVoices(); }
        if (want != got) same = false; per[p] += got;
    }
    for (int x : per) { log += std::to_string(x) + " "; if (x == 0) same = false; }
    CHECK(same, "each group of a list plays on its own as a patch, exactly as if it were alone in the list (voices per group: %s)", log.c_str());
    {   auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(48000); e.setLibrary(lib); e.setList(li); e.setPatch(0, 99); e.noteOn(60, 100); blk(e);
        CHECK(e.activeVoices() == 0, "a patch number past the folder plays nothing (%d)", e.activeVoices()); }
    lib->layerB = true;
    int nB = 60; for (auto& z : lib->zones) if (z.group == folder[1] && !z.mute) { nB = (z.lo + z.hi) / 2; break; }
    {   auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(48000); e.setLibrary(lib); e.setList(li); e.setListB(li); e.setPatch(0, 0); e.setPatch(1, 1);
        e.noteOn(nB, 100); blk(e); const int both = e.activeVoices();
        auto e2p = std::make_unique<Engine>(); Engine& e2 = *e2p; e2.prepare(48000); e2.setLibrary(lib); e2.setList(li); e2.setListB(-3); e2.setPatch(0, 0); e2.noteOn(nB, 100); blk(e2);
        auto e3p = std::make_unique<Engine>(); Engine& e3 = *e3p; e3.prepare(48000); e3.setLibrary(lib); e3.setList(li); e3.setListB(-3); e3.setPatch(0, 1); e3.noteOn(nB, 100); blk(e3);
        CHECK(both == e2.activeVoices() + e3.activeVoices() && both > 0, "layer A and B play two patches of the same folder together (%d = %d + %d)", both, e2.activeVoices(), e3.activeVoices());
        CHECK(e3.activeVoices() > 0, "patch 2 sounds on its own key (%d voices)", e3.activeVoices()); }
    lib->layerB = false; lib->groupPatches = false;
    // a sample set to play on release
    Zone* rz = nullptr; for (auto& z : lib->zones) if (60 >= z.lo && 60 <= z.hi && !z.audio.loop) { rz = &z; break; }
    if (!rz) { CHECK(false, "a zone on C4"); return; }
    lib->lists.clear();
    int on0; { auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(48000); e.setLibrary(lib); e.noteOn(60, 100); blk(e); on0 = e.activeVoices(); }
    rz->onRelease = true;
    {   auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(48000); e.setLibrary(lib); e.noteOn(60, 90); std::vector<float> L(480), R(480); e.render(L.data(), R.data(), 480);
        const int atPress = e.activeVoices();
        e.noteOff(60); int fresh = 0; e.render(L.data(), R.data(), 480); fresh = e.activeVoices();
        CHECK(atPress == on0 - 1 && fresh >= 1, "a sample set to 'release' waits for the key to be let go (%d of %d at the press, %d voices after)", atPress, on0, fresh); }
    rz->onRelease = false;
}

// round robin: each key press plays one position of the group's sequence (cycle, random, or random without repeats)
static void testRoundRobin() {
    std::string err; auto lib = Library::load(std::string(TEST_DATA_DIR) + "/golden.vsamp", err, 44100);
    if (!lib) { CHECK(false, "golden loads"); return; }
    int zi = -1; for (size_t i = 0; i < lib->zones.size(); ++i) if (72 >= lib->zones[i].lo && 72 <= lib->zones[i].hi) { zi = (int) i; break; }
    if (zi < 0) { CHECK(false, "a zone on 72"); return; }
    const int g = lib->zones[(size_t) zi].group; lib->zones[(size_t) zi].seq = 1;
    for (int s = 2; s <= 3; ++s) { Zone c = lib->zones[(size_t) zi]; c.seq = s; lib->zones.push_back(c); for (int n = c.lo; n <= c.hi; ++n) lib->byNote[(size_t) n].push_back((int) lib->zones.size() - 1); }
    for (GroupMode md : { GroupMode::RRCycle, GroupMode::RRRandom, GroupMode::RRUnique }) {
        lib->groups[(size_t) g].mode = md;
        auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(44100); e.setLibrary(lib);
        std::vector<float> L(441), R(441); std::string seen; bool one = true; int repeats = 0, last = -1;
        for (int k = 0; k < 12; ++k) {
            e.noteOn(72, 100); e.render(L.data(), R.data(), 441);
            int pos = -1, cnt = 0; for (const auto& v : e.debugVoices()) if (v.on && !v.releasing && v.zone && v.zone->group == g) { pos = v.zone->seq; ++cnt; }
            if (cnt != 1) one = false;
            seen += cnt == 1 ? std::to_string(pos) : "[" + std::to_string(cnt) + "]"; if (pos == last) ++repeats; last = pos;
            e.noteOff(72); for (int b = 0; b < 40; ++b) e.render(L.data(), R.data(), 441);
        }
        const char* nm = md == GroupMode::RRCycle ? "cycle" : md == GroupMode::RRRandom ? "random" : "random, no repeats";
        CHECK(one, "round robin (%s): every key press plays exactly one position (%s)", nm, seen.c_str());
        if (md == GroupMode::RRCycle) CHECK(seen == "123123123123", "round robin (cycle) goes 1, 2, 3 in order (%s)", seen.c_str());
        if (md == GroupMode::RRUnique) CHECK(repeats == 0, "round robin (no repeats) never plays the same position twice in a row (%s)", seen.c_str());
    }
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
        if (mod == "lfo-mod" || mod == "tag" || mod == "macro" || mod == "sync" || mod.rfind("bypass", 0) == 0) continue;
        const double secs = mod.rfind("feedback", 0) == 0 ? 3 : 1;
        auto [fin, peak, rms] = renderKey(key, secs, -1, nullptr);
        CHECK(fin && peak > 1e-3 && peak < 8, "%s: finite and audible (peak %.3f, rms %.4f)", mod.c_str(), peak, rms);
    }
    {   // no notes: the chains are silent, even an amp that feeds back into itself (fx-play has no noise makers like vinyl)
        auto L = Library::load(dir + "/fx-play.vsamp", err, 48000); auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(48000); e.setMasterGain(1.f); e.setLibrary(L);
        std::vector<float> l(480), r(480); double pk = 0; for (int b = 0; b < 100; ++b) { std::fill(l.begin(), l.end(), 0.f); std::fill(r.begin(), r.end(), 0.f); e.render(l.data(), r.data(), 480); for (float x : l) pk = std::max(pk, (double) std::fabs(x)); }
        CHECK(pk < 1e-4, "with no notes every effect chain stays silent, feedback loops included (peak %.2g)", pk);
    }
    int lfoKey = 0, tagKey = 0; for (size_t i = 0; i < cases.size(); ++i) { if (cases[i]["module"].str() == "lfo-mod") lfoKey = cases[i]["key"].integer(); if (cases[i]["module"].str() == "tag") tagKey = cases[i]["key"].integer(); }
    { std::vector<float> env; renderKey(lfoKey, 1, -1, &env); double ripple = 0; for (size_t i = 2; i + 2 < env.size() / 2; ++i) { const double sm = (env[i - 1] + env[i + 1]) / 2; ripple += std::fabs(env[i] - sm); }
      CHECK(ripple > .002, "an LFO on the filter cutoff makes the sound move (ripple %.4f)", ripple); }
    { auto open_ = renderKey(tagKey, .6, .95f, nullptr), shut = renderKey(tagKey, .6, 0.f, nullptr);
      CHECK(std::get<2>(open_) > std::get<2>(shut) * 1.5, "a knob (tag) linked to the cutoff changes the sound (%.4f vs %.4f)", std::get<2>(open_), std::get<2>(shut)); }
    const std::string playFile = dir + "/fx-play.vsamp";
    auto renderPlay = [&](int key, double secs, float tagCut) {
        auto L = Library::load(playFile, err, 48000); L->setTag("cut", tagCut);
        auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(48000); e.setMasterGain(1.f); e.setLibrary(L); e.noteOn(key, 110);
        std::vector<float> l(480), r(480), env; const int blocks = (int) (secs * 100);
        for (int b = 0; b < blocks; ++b) { std::fill(l.begin(), l.end(), 0.f); std::fill(r.begin(), r.end(), 0.f); if (b == blocks / 2) e.noteOff(key); e.render(l.data(), r.data(), 480);
            double bs = 0; for (int i = 0; i < 480; ++i) bs += l[i] * l[i]; env.push_back((float) std::sqrt(bs / 480)); }
        return env; };
    auto rmsOf = [](const std::vector<float>& v, size_t from, size_t to) { double s = 0; for (size_t i = from; i < to && i < v.size(); ++i) s += v[i] * v[i]; return std::sqrt(s / std::max<size_t>(1, to - from)); };
    auto keyOf = [&](const char* name) { for (size_t i = 0; i < cases.size(); ++i) if (cases[i]["module"].str() == name) return cases[i]["key"].integer(); return 0; };
    { const int k = keyOf("macro"); const double lo = rmsOf(renderPlay(k, .6, 0.f), 5, 30), mid = rmsOf(renderPlay(k, .6, .2f), 5, 30), hi = rmsOf(renderPlay(k, .6, 1.f), 5, 30);
      CHECK(mid > lo * 1.3 && hi > mid * 1.3, "a macro on a knob sweeps the filter across the whole knob (at 0, 20 and 100 %%: %.4f, %.4f, %.4f)", lo, mid, hi); }
    {   // "Sync to tempo": a 1/4-note delay follows the host's tempo (only the echo is heard, so it starts one quarter note late)
        const int k = keyOf("sync");
        auto onset = [&](double bpm) {
            auto L = Library::load(playFile, err, 48000); L->setTag("cut", 1.f);
            auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(48000); e.setMasterGain(1.f); e.setLibrary(L); e.setHostTempo(bpm, 4, 4); e.noteOn(k, 110);
            std::vector<float> l(48), r(48);
            for (int b = 0; b < 3000; ++b) { std::fill(l.begin(), l.end(), 0.f); std::fill(r.begin(), r.end(), 0.f); e.render(l.data(), r.data(), 48);
                for (int i = 0; i < 48; ++i) if (std::fabs(l[i]) > .02f) return (b * 48 + i) / 48.0; }
            return -1.0; };
        const double a = onset(120), b = onset(60), c = onset(150);
        CHECK(std::fabs(a - 500) < 15 && std::fabs(b - 1000) < 15 && std::fabs(c - 400) < 15, "a synced 1/4-note delay follows the host tempo (%.0f ms at 120, %.0f at 60, %.0f at 150 BPM)", a, b, c);
    }
    {   // VisuMaker moves an effect slider: the engine changes that value live (a synced 1/4 delay becomes 1/8)
        const int k = keyOf("sync");
        auto L = Library::load(playFile, err, 48000); L->setTag("cut", 1.f);
        auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(48000); e.setMasterGain(1.f); e.setLibrary(L); e.setHostTempo(120, 4, 4);
        std::vector<float> l(48), r(48); e.render(l.data(), r.data(), 48);
        const bool none = !e.setFxParam("no-such-node", "time", .5f, true);
        const bool hit = e.setFxParam("dsync", "time", 7.f / 17, true);
        e.noteOn(k, 110); double onset = -1;
        for (int b = 0; b < 3000 && onset < 0; ++b) { std::fill(l.begin(), l.end(), 0.f); std::fill(r.begin(), r.end(), 0.f); e.render(l.data(), r.data(), 48);
            for (int i = 0; i < 48; ++i) if (std::fabs(l[i]) > .02f) { onset = (b * 48 + i) / 48.0 - 1; break; } }
        CHECK(none && hit && std::fabs(onset - 250) < 15, "an effect parameter changes live without reloading (synced delay now %.0f ms, 1/8 at 120 BPM)", onset);
    }
    {   // the knob bypasses the delay: off = only the dry note; with tails the echoes keep ringing after switching off
        const int k = keyOf("bypass"), kt = keyOf("bypass-tails");
        const double on = rmsOf(renderPlay(k, 1.6, 1.f), 95, 150), off = rmsOf(renderPlay(k, 1.6, 0.f), 95, 150);
        CHECK(on > off * 3, "a knob bypasses a module (echo level %.3f on, %.3f bypassed)", on, off);
        auto ring = [&](int key) {   // echoes going, then the knob switches the delay off
            auto L = Library::load(playFile, err, 48000); L->setTag("cut", 1.f);
            auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(48000); e.setMasterGain(1.f); e.setLibrary(L); e.noteOn(key, 110);
            std::vector<float> l(480), r(480); double after = 0;
            for (int b = 0; b < 120; ++b) { std::fill(l.begin(), l.end(), 0.f); std::fill(r.begin(), r.end(), 0.f);
                if (b == 30) e.noteOff(key); if (b == 60) L->setTag("cut", 0.f); e.render(l.data(), r.data(), 480);
                if (b >= 70) for (int i = 0; i < 480; ++i) after += std::fabs(l[i]); }
            return after; };
        const double cut = ring(k), rings = ring(kt);
        CHECK(rings > cut * 5 && rings > .5, "with tails on, echoes ring out after bypassing (%.2f vs %.2f)", rings, cut);
    }
}

// Backwards compatibility: libraries made by earlier versions (tests/compat, never changed or removed) must keep loading
// and sound the same. compat.json holds each file's loudness every 100 ms for a few notes, recorded when the file was added.
// VISU_COMPAT_WRITE=1 records files that have no fingerprint yet (it never overwrites an existing one).
static std::vector<double> compatPrint(const std::shared_ptr<Library>& lib, int note) {
    auto ep = std::make_unique<Engine>(); Engine& e = *ep; e.prepare(48000); e.setMasterGain(1.f); e.setOffline(true); e.setLibrary(lib); e.noteOn(note, 100);   // offline: streamed samples never drop out, however slow the disk
    std::vector<float> l(800), r(800); std::vector<double> out; double sq = 0;
    for (int b = 0; b < 72; ++b) {   // 1.2 s: held 0.8 s, then released
        if (b == 48) e.noteOff(note);
        std::fill(l.begin(), l.end(), 0.f); std::fill(r.begin(), r.end(), 0.f); e.render(l.data(), r.data(), 800);
        for (int i = 0; i < 800; ++i) sq += (double) l[i] * l[i] + (double) r[i] * r[i];
        if (b % 6 == 5) { out.push_back(std::sqrt(sq / 9600.0)); sq = 0; }
    }
    return out;
}
/* .vslib: a library holding instruments. Each instrument inside plays exactly like its own file, streaming included. */
static void testVslib() {
    const std::string dir = TEST_DATA_DIR, lib = dir + "/lib.vslib";
    LibraryInfo li; std::string err;
    const bool ok = Library::readInfo(lib, li, err);
    CHECK(ok && li.collection && li.name == "Test Library" && li.instruments.size() == 3, "vslib: the library and its 3 instruments are listed (%s)", err.c_str());
    if (!ok || li.instruments.size() != 3) return;
    CHECK(li.instruments[0].bank == "01. Keys" && li.instruments[1].id == "fxplay" && li.instruments[1].desc == "macros and bypass" && li.instruments[2].bank == "02. Long",
          "vslib: banks, ids and descriptions come through");
    CHECK(li.bannerTile.size() == 8 && (uint8_t) li.bannerTile[0] == 0x89, "vslib: the library's banner image comes through");
    LibraryInfo gi; CHECK(Library::readInfo(dir + "/golden.vsamp", gi, err) && !gi.collection && gi.instruments.empty(), "an instrument file is not a collection");
    struct C { const char* id; const char* file; int note; };
    for (const C c : { C{ "golden", "golden.vsamp", 60 }, C{ "fxplay", "fx-play.vsamp", 0 }, C{ "stream", "stream.vsamp", 72 } }) {
        auto a = Library::load(lib, c.id, err, 48000); std::string e2; auto b = Library::load(dir + "/" + c.file, e2, 48000);
        if (!a || !b) { CHECK(false, "vslib: %s loads (%s%s)", c.id, err.c_str(), e2.c_str()); continue; }
        int note = c.note; if (!note && !b->zones.empty()) note = b->zones[0].lo;
        auto ea = std::make_unique<Engine>(), eb = std::make_unique<Engine>();
        for (Engine* e : { ea.get(), eb.get() }) { e->prepare(48000); e->setMasterGain(1); e->setOffline(true); }
        ea->setLibrary(a); eb->setLibrary(b); ea->noteOn(note, 110); eb->noteOn(note, 110);
        std::vector<float> la(512), ra(512), lb(512), rb(512); double maxd = 0, peak = 0;
        for (int blk = 0; blk < 300; ++blk) {
            std::fill(la.begin(), la.end(), 0.f); std::fill(ra.begin(), ra.end(), 0.f); std::fill(lb.begin(), lb.end(), 0.f); std::fill(rb.begin(), rb.end(), 0.f);
            ea->render(la.data(), ra.data(), 512); eb->render(lb.data(), rb.data(), 512);
            for (int i = 0; i < 512; ++i) { maxd = std::max(maxd, (double) std::fabs(la[i] - lb[i]) + std::fabs(ra[i] - rb[i])); peak = std::max(peak, (double) std::fabs(lb[i])); }
        }
        CHECK(maxd == 0 && peak > .01 && a->zones.size() == b->zones.size() && a->streamedSamples() == b->streamedSamples(),
              "vslib: instrument \"%s\" plays exactly like its own file (difference %.3g, peak %.2f, %d streamed)", c.id, maxd, peak, (int) a->streamedSamples());
    }
    auto first = Library::load(lib, "", err, 48000);
    CHECK(first && first->info.name == Library::load(dir + "/golden.vsamp", err, 48000)->info.name, "vslib: no instrument named loads the first one");
    std::string e3; CHECK(!Library::load(lib, "nope", e3, 48000) && e3.find("nope") != std::string::npos, "vslib: an instrument that is not there is reported (%s)", e3.c_str());
}

/* NodeFX: an effect chain on live audio (FxRack) */
static void testFxRack() {
    const std::string dir = TEST_DATA_DIR; std::string err;
    auto rack = [&](const char* n) { err.clear(); auto r = FxRack::build(readText(dir + "/rack-" + n + ".json"), 48000, err); return r; };
    /* a delay of 100 ms: an impulse comes back 4800 samples later, in odd block sizes */
    { auto r = rack("delay"); CHECK(r != nullptr, "nodefx: a chain builds (%s)", err.c_str());
      if (r) { std::vector<float> l(48000, 0.f), rr(48000, 0.f); l[0] = rr[0] = 1;
        for (int at = 0; at < 48000; at += 333) r->process(l.data() + at, rr.data() + at, std::min(333, 48000 - at));
        int pk = 0; for (int i = 1; i < 48000; ++i) if (std::fabs(l[i]) > std::fabs(l[pk])) pk = i;
        CHECK(std::abs(pk - 4800) <= 4 && std::fabs(l[pk]) > .3, "nodefx: the delay echoes after 100 ms (peak at %d, %.2f)", pk, l[pk]);
        CHECK(r->setParam("dly", "time", 200, false), "nodefx: a parameter changes live");
        std::vector<float> a(48000, 0.f), b(48000, 0.f); a[0] = b[0] = 1;
        for (int at = 0; at < 48000; at += 512) r->process(a.data() + at, b.data() + at, std::min(512, 48000 - at));
        int p2 = 0; for (int i = 1; i < 48000; ++i) if (std::fabs(a[i]) > std::fabs(a[p2])) p2 = i;
        CHECK(std::abs(p2 - 9600) <= 400, "nodefx: and the echo moves to 200 ms (peak at %d)", p2); } }
    /* a macro (tag) on the filter cutoff: closing it quietens a bright tone */
    { auto r = rack("macro");
      if (!r) CHECK(false, "nodefx: macro chain builds (%s)", err.c_str());
      else { auto level = [&](float macro) { r->setTag(r->tagIndex("Tone"), macro); std::vector<float> l(9600), rr(9600);
               for (int i = 0; i < 9600; ++i) l[i] = rr[i] = .5f * std::sin(i * 2 * 3.14159265 * 8000 / 48000.0);
               r->process(l.data(), rr.data(), 9600); double e = 0; for (int i = 4800; i < 9600; ++i) e += l[i] * l[i]; return std::sqrt(e / 4800); };
             const double open = level(1), shut = level(0);
             CHECK(r->numTags() == 1 && r->tagIndex("m1") == 0 && open > .2 && shut < open * .2, "nodefx: a macro moves the filter (open %.3f, closed %.3f)", open, shut); } }
    /* an amp fed back into itself stays silent with no input, and bounded with input */
    { auto r = rack("amp"); if (r) { std::vector<float> l(48000, 0.f), rr(48000, 0.f); r->process(l.data(), rr.data(), 48000); double pk = 0; for (float v : l) pk = std::max(pk, (double) std::fabs(v));
        std::vector<float> a(48000), b(48000); for (int i = 0; i < 48000; ++i) a[i] = b[i] = .8f * std::sin(i * .05); r->process(a.data(), b.data(), 48000); double pk2 = 0; for (float v : a) pk2 = std::max(pk2, (double) std::fabs(v));
        CHECK(pk < 1e-6 && pk2 < 4 && pk2 > .05, "nodefx: an amp feedback loop is silent without input and bounded with it (%.2g / %.2f)", pk, pk2); } else CHECK(false, "nodefx: amp chain builds"); }
    /* an unknown module passes the sound through and is reported; an empty chain changes nothing */
    { auto r = rack("unknown"); bool listed = r && std::find(r->unsupported().begin(), r->unsupported().end(), "fx:nosuchfx") != r->unsupported().end();
      std::vector<float> l(256, .25f), rr(256, .25f); if (r) r->process(l.data(), rr.data(), 256);
      CHECK(listed && std::fabs(l[200] - .25f) < 1e-6, "nodefx: an unknown module is listed and passes sound through"); }
    { auto r = rack("thru"); std::vector<float> l(1000), rr(1000); for (int i = 0; i < 1000; ++i) l[i] = rr[i] = std::sin(i * .1f) * .5f; auto l0 = l;
      if (r) r->process(l.data(), rr.data(), 1000); double d = 0; for (int i = 0; i < 1000; ++i) d = std::max(d, (double) std::fabs(l[i] - l0[i]));
      CHECK(r && r->empty() && d < 1e-7, "nodefx: an empty chain leaves the sound exactly as it was"); }
    { std::string e; CHECK(!FxRack::build("{\"nope\":1}", 48000, e) && !e.empty(), "nodefx: something that is not a chain is refused (%s)", e.c_str()); }
}

/* NodeFX's factory presets: each one builds, plays, stays bounded with every macro at either end */
static void testNodeFXFactory() {
    const std::string txt = readText(std::string(TEST_DATA_DIR) + "/nodefx-factory.json");
    const Json all = Json::parse(txt.data(), txt.size());
    const Json& ps = all["presets"];
    CHECK(ps.size() >= 20, "nodefx factory: %d presets", (int) ps.size());
    int bad = 0;
    for (size_t i = 0; i < ps.size(); ++i) {
        const Json& st = ps[i]["state"]; const std::string name = ps[i]["bank"].str() + " / " + ps[i]["name"].str();
        Json in; in.type = Json::Obj; in.o = { { "graph", st["graph"] }, { "tags", st["tags"] }, { "fxRanges", all["fxRanges"] } };
        std::string err; auto r = FxRack::build(in, 48000, err);
        if (!r || !r->unsupported().empty()) { ++bad; std::printf("      %s: %s %s\n", name.c_str(), err.c_str(), r && !r->unsupported().empty() ? r->unsupported()[0].c_str() : ""); continue; }
        bool noisy = false; for (size_t k = 0; k < st["graph"]["nodes"].size(); ++k) { const std::string t = st["graph"]["nodes"][k]["type"].str(); if (t == "radio" || t == "lofi" || t == "vinyl" || t == "tapemach" || t == "vintage") noisy = true; }
        std::vector<float> l(96000, 0.f), rr(96000, 0.f); r->process(l.data(), rr.data(), 96000);
        double quiet = 0; for (int k = 48000; k < 96000; ++k) quiet = std::max(quiet, (double) std::fabs(l[k]) + std::fabs(rr[k]));   // after a start-up click settles
        double worst = 0, rms = 0, asSet = 0; bool finite = true;
        for (int pass = 0; pass < 3; ++pass) {   // macros as set, all down, all up
            if (pass) for (int m = 0; m < 8; ++m) r->setTag(r->macro[m], pass == 1 ? 0.f : 1.f);
            std::vector<float> a(96000), b(96000);
            for (int k = 0; k < 96000; ++k) { const double t = k / 48000.0, env = std::exp(-std::fmod(t, .5) * 5); const float v = (float) (.5 * env * (2 * std::fmod(t * 110, 1.0) - 1)); a[k] = v; b[k] = v * .9f; }
            r->process(a.data(), b.data(), 96000);
            double e = 0; for (int k = 0; k < 96000; ++k) { if (!std::isfinite(a[k]) || !std::isfinite(b[k])) finite = false; worst = std::max(worst, (double) std::fabs(a[k])); e += a[k] * a[k]; }
            if (!pass) { rms = std::sqrt(e / 96000); asSet = worst; }
        }
        // as loaded: a sensible level (the test signal peaks at 0.5); every macro at either end: finite and bounded
        const bool ok = finite && asSet < 1.6 && worst < 12 && rms > .005 && (noisy || quiet < 1e-3);
        if (!ok || std::getenv("NODEFX_LEVELS")) std::printf("      %s %s: as loaded peak %.2f (level %.3f), at the extremes %.2f, silence %.2g\n", ok ? "  " : "!!", name.c_str(), asSet, rms, worst, quiet);
        if (!ok) ++bad;
    }
    CHECK(bad == 0, "nodefx factory: every preset builds with known modules, plays, stays finite and bounded with its macros at either end, and is silent with no input (%d problems)", bad);
}

/* Effect quality: smoothed parameter moves, 4x oversampled distortion, the brick-wall limiter, filters that stay calm
   while they move. Chains are built here from the Maker's catalog (golden/fx-catalog.json, saved by save-fx-catalog.mjs). */
static double toneDb(const std::vector<float>& v, size_t from, size_t to, double f, double sr) {   // level of one frequency (Hann window)
    std::complex<double> acc = 0; const size_t n = to - from;
    for (size_t i = from; i < to; ++i) { const double w = .5 - .5 * std::cos(2 * 3.14159265358979 * (double) (i - from) / (double) n); acc += std::polar(w * v[i], -2 * 3.14159265358979 * f * (double) i / sr); }
    return 20 * std::log10(std::abs(acc) / ((double) n / 4) + 1e-15);
}
static void testFxQuality() {
    const std::string ct = readText(std::string(TEST_DATA_DIR) + "/fx-catalog.json"); const Json cat = Json::parse(ct.data(), ct.size());
    // input -> one module -> output; `p` is the module's settings as JSON
    auto chain = [&](const std::string& type, const std::string& p, const char* port = "mix") {
        const std::string g = "{\"nodes\":[{\"id\":\"i\",\"type\":\"input\",\"p\":{}},{\"id\":\"m\",\"type\":\"" + type + "\",\"p\":" + p + "},{\"id\":\"o\",\"type\":\"output\",\"p\":{}}],"
            "\"cables\":[{\"from\":{\"n\":\"i\",\"p\":\"out\"},\"to\":{\"n\":\"m\",\"p\":\"in\"}},{\"from\":{\"n\":\"m\",\"p\":\"" + std::string(port) + "\"},\"to\":{\"n\":\"o\",\"p\":\"in\"}}]}";
        Json in; in.type = Json::Obj; in.o = { { "graph", Json::parse(g.data(), g.size()) }, { "fxRanges", cat["ranges"] } };
        std::string err; auto r = FxRack::build(in, 48000, err); if (!r) std::printf("      %s: %s\n", type.c_str(), err.c_str()); return r;
    };
    const double sr = 48000, PI = 3.14159265358979;
    /* 1. a parameter that moves glides (about 12 ms) instead of jumping */
    { auto r = chain("util", "{\"gain\":-24,\"pan\":0,\"width\":100}", "out");
      std::vector<float> l(9600), rr(9600); auto feed = [&](int n) { for (int i = 0; i < n; ++i) l[(size_t) i] = rr[(size_t) i] = .25f; r->process(l.data(), rr.data(), n); };
      if (r) { feed(4800); r->setParam("m", "gain", 0, false); feed(9600);
        const double first = l[31] / .25, mid = l[1200] / .25, late = l[9000] / .25;   // 0.6 ms, 25 ms, 190 ms after the move
        CHECK(first < .3 && mid > .5 && mid < .97 && std::fabs(late - 1) < .01, "fx quality: a moved gain glides to its new value (%.2f after 0.6 ms, %.2f after 25 ms, %.3f after 190 ms)", first, mid, late); }
      else CHECK(false, "fx quality: util chain builds"); }
    /* 2. oversampling: a hard-clipped 7 kHz tone; its harmonics above 24 kHz fold back down (35 kHz -> 13 kHz, 49 kHz -> 1 kHz) */
    for (const char* type : { "dist", "amp" }) {
        double alias[2] = {}, fund[2] = {};
        for (int os = 0; os < 2; ++os) {
            const std::string p = std::string(type) == "dist" ? "{\"type\":2,\"drive\":70,\"tone\":100,\"level\":0,\"os\":" + std::to_string(os) + ",\"mix\":100}"
                                                               : "{\"amp\":2,\"gain\":80,\"bass\":0,\"mid\":0,\"treble\":0,\"volume\":0,\"mic\":0,\"os\":" + std::to_string(os) + ",\"mix\":100}";
            auto r = chain(type, p); if (!r) continue;
            std::vector<float> l(48000), rr(48000); for (int i = 0; i < 48000; ++i) l[(size_t) i] = rr[(size_t) i] = (float) (.8 * std::sin(2 * PI * 7000 * i / sr));
            r->process(l.data(), rr.data(), 48000);
            alias[os] = std::max(toneDb(l, 8000, 48000, 1000, sr), toneDb(l, 8000, 48000, 13000, sr)); fund[os] = toneDb(l, 8000, 48000, 7000, sr);
        }
        // a hard clip loses almost all of it; the amp at full gain is close to a square wave, so some is left even at 4x
        CHECK(alias[0] - alias[1] > (std::string(type) == "dist" ? 40 : 12) && std::fabs(fund[0] - fund[1]) < 1.5, "fx quality: %s with Oversampling has far less aliasing (%.0f dB -> %.0f dB, the note itself %.1f -> %.1f dB)", type, alias[0], alias[1], fund[0], fund[1]);
    }
    /* 3. brick wall: nothing gets past the ceiling, ever; 2 ms of lookahead, reported; quiet sound passes untouched and the
       dry part of Mix lines up with it */
    { auto r = chain("limiter", "{\"brick\":1,\"ceiling\":-1,\"release\":60,\"mix\":100}");
      if (!r) CHECK(false, "fx quality: limiter chain builds");
      else {
        const float ceil = std::pow(10.f, -1 / 20.f); std::vector<float> l(96000), rr(96000); uint32_t s = 7;
        for (int i = 0; i < 96000; ++i) { s = s * 1664525u + 1013904223u; const float nz = ((s >> 8) / 8388608.f - 1);
            float v = (float) (.6 * std::sin(2 * PI * 110 * i / sr)) + .3f * nz; if (i % 7919 == 0) v = 4; if (i % 12007 == 5) v = -3.5f; if (i > 60000 && i < 60100) v *= 8; l[(size_t) i] = v; rr[(size_t) i] = -v * .7f; }
        for (int at = 0; at < 96000; at += 517) r->process(l.data() + at, rr.data() + at, std::min(517, 96000 - at));
        double pk = 0; for (int i = 0; i < 96000; ++i) pk = std::max(pk, (double) std::max(std::fabs(l[(size_t) i]), std::fabs(rr[(size_t) i])));
        CHECK(pk <= ceil + 1e-6 && pk > ceil * .9, "fx quality: the brick-wall limiter never goes past its ceiling (peak %.6f, ceiling %.6f, input peaks up to 32)", pk, ceil);
        CHECK(r->latency() == 96, "fx quality: its 2 ms lookahead is reported (%d samples at 48 kHz)", r->latency());
      }
      auto q = chain("limiter", "{\"brick\":1,\"ceiling\":-1,\"release\":60,\"mix\":50}");
      if (q) { std::vector<float> l(2000, 0.f), rr(2000, 0.f); l[100] = rr[100] = .5f; q->process(l.data(), rr.data(), 2000);
        int pk = 0; for (int i = 0; i < 2000; ++i) if (std::fabs(l[(size_t) i]) > std::fabs(l[(size_t) pk])) pk = i; double rest = 0; for (int i = 0; i < 2000; ++i) if (i != pk) rest = std::max(rest, (double) std::fabs(l[(size_t) i]));
        CHECK(pk == 196 && std::fabs(l[196] - .5f) < 1e-6 && rest < 1e-6, "fx quality: below the ceiling the sound passes untouched, and at Mix 50%% the dry part lines up (one click at %d, %.4f)", pk, l[(size_t) pk]); }
      auto c = chain("limiter", "{\"ceiling\":-1,\"release\":60,\"mix\":100}");   // saved before Brick wall existed: the classic one, no delay
      CHECK(c && c->latency() == 0, "fx quality: a limiter saved before Brick wall existed keeps the classic one (no lookahead)"); }
    /* 4. a resonant low-pass swept fast by an LFO stays calm (no bursts) */
    { const std::string g = "{\"nodes\":[{\"id\":\"i\",\"type\":\"input\",\"p\":{}},{\"id\":\"f\",\"type\":\"filter\",\"p\":{\"type\":0,\"cutoff\":800,\"res\":100,\"slope\":1,\"gain\":0,\"mix\":100}},"
          "{\"id\":\"lfo\",\"type\":\"lfo\",\"p\":{\"rate\":20,\"shape\":2,\"depth\":100,\"retrig\":0}},{\"id\":\"o\",\"type\":\"output\",\"p\":{}}],"
          "\"cables\":[{\"from\":{\"n\":\"i\",\"p\":\"out\"},\"to\":{\"n\":\"f\",\"p\":\"in\"}},{\"from\":{\"n\":\"f\",\"p\":\"mix\"},\"to\":{\"n\":\"o\",\"p\":\"in\"}},{\"from\":{\"n\":\"lfo\",\"p\":\"out\"},\"to\":{\"n\":\"f\",\"p\":\"p:cutoff\"},\"amt\":100}]}";
      Json in; in.type = Json::Obj; in.o = { { "graph", Json::parse(g.data(), g.size()) }, { "fxRanges", cat["ranges"] } }; std::string err; auto r = FxRack::build(in, 48000, err);
      if (r) { std::vector<float> l(96000), rr(96000); for (int i = 0; i < 96000; ++i) l[(size_t) i] = rr[(size_t) i] = (float) (.5 * (2 * std::fmod(i * 110 / sr, 1.0) - 1));
        r->process(l.data(), rr.data(), 96000); double pk = 0; bool fin = true; for (float v : l) { if (!std::isfinite(v)) fin = false; pk = std::max(pk, (double) std::fabs(v)); }
        CHECK(fin && pk < 5, "fx quality: a resonant filter swept by a fast LFO stays calm (peak %.2f)", pk); }
      else CHECK(false, "fx quality: sweep chain builds (%s)", err.c_str()); }
    /* 5. ring mod: 1000 Hz times a 300 Hz carrier = 700 Hz + 1300 Hz, and nothing left at 1000 Hz */
    { auto r = chain("ring", "{\"freq\":300,\"wave\":0,\"sweep\":0,\"attack\":0,\"decay\":600,\"speed\":0,\"depth\":0,\"mix\":100}");
      if (!r) CHECK(false, "ring mod: chain builds");
      else { std::vector<float> l(48000), rr(48000); for (int i = 0; i < 48000; ++i) l[(size_t) i] = rr[(size_t) i] = (float) (.5 * std::sin(2 * PI * 1000 * i / sr));
        r->process(l.data(), rr.data(), 48000);
        const double lo = toneDb(l, 4800, 48000, 700, sr), hi = toneDb(l, 4800, 48000, 1300, sr), mid = toneDb(l, 4800, 48000, 1000, sr);
        CHECK(lo > -15 && hi > -15 && mid < lo - 60, "ring mod: sum and difference tones (700 Hz %.0f dB, 1300 Hz %.0f dB), the original gone (1000 Hz %.0f dB)", lo, hi, mid); } }
    /* the carrier input: the sound times itself = twice the frequency */
    { const std::string g = "{\"nodes\":[{\"id\":\"i\",\"type\":\"input\",\"p\":{}},{\"id\":\"m\",\"type\":\"ring\",\"p\":{\"freq\":300,\"mix\":100}},{\"id\":\"o\",\"type\":\"output\",\"p\":{}}],"
          "\"cables\":[{\"from\":{\"n\":\"i\",\"p\":\"out\"},\"to\":{\"n\":\"m\",\"p\":\"in\"}},{\"from\":{\"n\":\"i\",\"p\":\"out\"},\"to\":{\"n\":\"m\",\"p\":\"carrier\"}},{\"from\":{\"n\":\"m\",\"p\":\"wet\"},\"to\":{\"n\":\"o\",\"p\":\"in\"}}]}";
      Json in; in.type = Json::Obj; in.o = { { "graph", Json::parse(g.data(), g.size()) }, { "fxRanges", cat["ranges"] } }; std::string err; auto r = FxRack::build(in, 48000, err);
      if (!r) CHECK(false, "ring mod: carrier chain builds (%s)", err.c_str());
      else { std::vector<float> l(48000), rr(48000); for (int i = 0; i < 48000; ++i) l[(size_t) i] = rr[(size_t) i] = (float) (.5 * std::sin(2 * PI * 1000 * i / sr));
        r->process(l.data(), rr.data(), 48000);
        const double two = toneDb(l, 4800, 48000, 2000, sr), own = toneDb(l, 4800, 48000, 300, sr) , one = toneDb(l, 4800, 48000, 1000, sr);
        CHECK(two > -20 && own < -80 && one < -80, "ring mod: a patched carrier replaces the built-in tone (2000 Hz %.0f dB, 300 Hz %.0f dB)", two, own); } }
}

/* the ring mod's sweep follows the notes (instruments; NodeFX plays no notes) */
static void testRingSweep() {
    const std::string ct = readText(std::string(TEST_DATA_DIR) + "/fx-catalog.json"); const Json cat = Json::parse(ct.data(), ct.size());
    const std::string g = "{\"nodes\":[{\"id\":\"i\",\"type\":\"input\",\"p\":{}},{\"id\":\"m\",\"type\":\"ring\",\"p\":{\"freq\":200,\"wave\":0,\"sweep\":24,\"attack\":0,\"decay\":400,\"speed\":0,\"depth\":0,\"mix\":100}},{\"id\":\"o\",\"type\":\"output\",\"p\":{}}],"
        "\"cables\":[{\"from\":{\"n\":\"i\",\"p\":\"out\"},\"to\":{\"n\":\"m\",\"p\":\"in\"}},{\"from\":{\"n\":\"m\",\"p\":\"wet\"},\"to\":{\"n\":\"o\",\"p\":\"in\"}}]}";
    Json in; in.type = Json::Obj; in.o = { { "graph", Json::parse(g.data(), g.size()) }, { "fxRanges", cat["ranges"] } };
    std::string err; auto r = FxRack::build(in, 48000, err);
    CHECK(r != nullptr, "ring sweep: builds (%s)", err.c_str());
    if (!r) return;
    r->noteOn(60, 1.f);   // a note: the carrier jumps 2 octaves up (800 Hz) and falls back to 200 Hz
    std::vector<float> l(96000, .5f), rr(96000, .5f);   // a constant input shows the carrier itself
    r->process(l.data(), rr.data(), 96000);
    auto zc = [&](size_t a, size_t b) { int z = 0; for (size_t i = a + 1; i < b; ++i) if ((l[i - 1] < 0) != (l[i] < 0)) ++z; return z * 48000.0 / 2 / (double) (b - a); };
    const double early = zc(0, 960), late = zc(72000, 96000);
    CHECK(early > 650 && late > 180 && late < 220, "ring sweep: with a note the carrier starts high and falls back (%.0f Hz at first, %.0f Hz after 1.5 s)", early, late);
}

/* HyperSynth's sound engine (step 1 of its roadmap: the gate is clean aliasing and usable CPU) */
static constexpr double kPiT = 3.14159265358979323846;
static void testSynth() {
    using namespace visu::hs;
    const auto& P = params(); const double sr = 48000, PI = 3.14159265358979;
    { bool uniq = true, sane = true; for (size_t i = 0; i < P.size(); ++i) { for (size_t j = i + 1; j < P.size(); ++j) if (P[i].id == P[j].id) uniq = false; if (P[i].def < P[i].min || P[i].def > P[i].max) sane = false; }
      CHECK(P.size() > 150 && uniq && sane, "hypersynth: %zu parameters, unique ids, defaults in range", P.size()); }
    auto set = [](Synth& s, const char* id, float v) { const int i = paramIndex(id); if (i < 0) std::printf("      no parameter %s\n", id); s.setParam(i, v); };
    auto render = [&](Synth& s, size_t n) { std::vector<float> l(n), r(n); for (size_t at = 0; at < n; at += 512) s.process(l.data() + at, r.data() + at, (int) std::min<size_t>(512, n - at)); return std::make_pair(l, r); };
    auto peakOf = [](const std::vector<float>& v) { double p = 0; bool fin = true; for (float x : v) { if (!std::isfinite(x)) fin = false; p = std::max(p, (double) std::fabs(x)); } return fin ? p : -1.0; };
    auto rms = [](const std::vector<float>& v, size_t a, size_t b) { double s = 0; for (size_t i = a; i < b; ++i) s += (double) v[i] * v[i]; return std::sqrt(s / (double) (b - a)); };
    /* the init sound */
    { Synth s; s.prepare(sr); s.noteOn(60, .8f); auto o = render(s, 24000); const double pk = peakOf(o.first);
      CHECK(pk > .05 && pk < 1, "hypersynth: the init sound plays (peak %.3f)", pk); }
    /* aliasing: a high saw (2637 Hz); its 19th harmonic (50.1 kHz) would fold back to 2103 Hz */
    double al[2] = {}; const char* how[2] = { "Analog (polyBLEP)", "Wavetable (band-limited copies)" };
    for (int m = 0; m < 2; ++m) {
        Synth s; s.prepare(sr); set(s, "l1.lp.cut", 20000); set(s, "l1.lp.type", 0); set(s, "l1.lp.key", 0);
        if (m == 1) { set(s, "l1.o1.mode", 0); set(s, "l1.o1.pos", 2.f / 3); }
        s.noteOn(100, 1); auto o = render(s, 48000);
        al[m] = toneDb(o.first, 8000, 48000, 2103.4, sr) - toneDb(o.first, 8000, 48000, 2637.0, sr);
        CHECK(al[m] < (m ? -70 : -40), "hypersynth: %s saw at 2637 Hz, folded-back harmonic %.0f dB under the note", how[m], al[m]);
    }
    /* Hyper unison: 9 voices spread wide, about as loud as one */
    { Synth a, b; for (Synth* s : { &a, &b }) { s->prepare(sr); set(*s, "l1.o1.shape", 0); }
      set(b, "l1.o1.voices", 9); set(b, "l1.o1.detune", 30); set(b, "l1.o1.spread", 1);
      a.noteOn(48, 1); b.noteOn(48, 1); auto oa = render(a, 48000), ob = render(b, 48000);
      double c = 0, nl = 0, nr = 0; for (size_t i = 4800; i < 48000; ++i) { c += (double) ob.first[i] * ob.second[i]; nl += (double) ob.first[i] * ob.first[i]; nr += (double) ob.second[i] * ob.second[i]; }
      const double corr = c / std::sqrt(nl * nr + 1e-30), lv = 20 * std::log10(rms(ob.first, 4800, 48000) / rms(oa.first, 4800, 48000));
      CHECK(corr < .8 && std::fabs(lv) < 4, "hypersynth: 9 Hyper voices make it wide (L/R correlation %.2f) at about the same level (%+.1f dB)", corr, lv); }
    /* the low-pass filter */
    { Synth open, shut; for (Synth* s : { &open, &shut }) { s->prepare(sr); set(*s, "l1.lp.key", 0); set(*s, "l1.lp.res", 0); }
      set(open, "l1.lp.cut", 20000); set(shut, "l1.lp.cut", 400); open.noteOn(45, 1); shut.noteOn(45, 1);
      auto oo = render(open, 48000), os = render(shut, 48000);
      const double drop = (toneDb(os.first, 8000, 48000, 2200, sr) - toneDb(os.first, 8000, 48000, 110, sr)) - (toneDb(oo.first, 8000, 48000, 2200, sr) - toneDb(oo.first, 8000, 48000, 110, sr));
      CHECK(drop < -40, "hypersynth: the 24 dB low-pass at 400 Hz takes the 20th harmonic down %.0f dB more", drop); }
    /* envelope: released notes end, and their voices free up */
    { Synth s; s.prepare(sr); set(s, "l1.aenv.r", 100); s.noteOn(60, 1); render(s, 4800); s.noteOff(60); auto o = render(s, 24000);
      CHECK(rms(o.first, 0, 960) > .01 && peakOf(std::vector<float>(o.first.begin() + 19200, o.first.end())) < 1e-4 && s.activeVoices() == 0, "hypersynth: a 100 ms release fades out and frees the voice"); }
    /* two layers and the crossfade */
    { double lo[2], hi[2];
      for (int x = 0; x < 2; ++x) { Synth s; s.prepare(sr); set(s, "play", 2); set(s, "xfade", (float) x); set(s, "l1.o1.shape", 3); set(s, "l2.o1.shape", 3); set(s, "l2.o1.oct", 2);
        s.noteOn(57, 1); auto o = render(s, 48000); lo[x] = toneDb(o.first, 8000, 48000, 220, sr); hi[x] = toneDb(o.first, 8000, 48000, 880, sr); }
      CHECK(lo[0] - hi[0] > 60 && hi[1] - lo[1] > 60, "hypersynth: Crossfade I..II (layer I alone %+.0f dB, layer II alone %+.0f dB)", lo[0] - hi[0], hi[1] - lo[1]); }
    /* voices: 40 notes on a 16-voice setting, mono keeps one */
    { Synth s; s.prepare(sr); set(s, "voices", 16); for (int k = 30; k < 70; ++k) s.noteOn(k, .7f); auto o = render(s, 9600);
      Synth m; m.prepare(sr); set(m, "mode", 2); set(m, "glide", 80); for (int k : { 60, 64, 67 }) m.noteOn(k, 1); render(m, 4800);
      CHECK(s.activeVoices() == 16 && peakOf(o.first) >= 0 && m.activeVoices() == 1, "hypersynth: 40 notes play on 16 voices (stealing the oldest), legato keeps 1 (%d voices, %d in legato)", s.activeVoices(), m.activeVoices()); }
    /* the wavetables: every factory table stays clean on a high note (no folded-back tones below the note) */
    { const auto& names = wavetableNames(); std::string dirty; double worst = -999;
      for (size_t t = 0; t < names.size(); ++t) {
        Synth s; s.prepare(sr); set(s, "l1.o1.mode", 0); set(s, "l1.o1.table", (float) t); set(s, "l1.o1.pos", .7f); set(s, "l1.lp.cut", 20000); set(s, "l1.lp.type", 0); set(s, "l1.lp.key", 0);
        s.noteOn(100, 1); auto o = render(s, 48000);
        const double all = 20 * std::log10(rms(o.first, 8000, 48000) + 1e-12); double below = -999;
        for (double f = 150; f < 2450; f += 50) below = std::max(below, toneDb(o.first, 8000, 48000, f, sr));
        worst = std::max(worst, below - all); if (below - all > -60) dirty += " " + names[t];
      }
      CHECK(names.size() == 17 && dirty.empty(), "hypersynth: %zu factory wavetables, all alias-free on a 2.6 kHz note (worst %.0f dB)%s", names.size(), worst, dirty.c_str()); }
    /* importing: a wavetable file is cut into its frames; any other sound gives single cycles at its pitch */
    { std::vector<float> wt(8 * 2048); for (int f = 0; f < 8; ++f) for (int i = 0; i < 2048; ++i) wt[(size_t) (f * 2048 + i)] = (float) std::sin(2 * PI * (f + 1) * i / 2048.0);
      std::string how; auto fr = framesFromAudio(wt.data(), wt.size(), 48000, 0, &how);
      double e = 0; for (size_t i = 0; i < fr.size(); ++i) e = std::max(e, (double) std::fabs(fr[i] - wt[i]));
      CHECK(fr.size() == wt.size() && e < 1e-3, "hypersynth import: a wavetable file (8 frames of 2048) comes in as its 8 frames (%s)", how.c_str());
      std::vector<float> clm(5 * 256); for (size_t i = 0; i < clm.size(); ++i) clm[i] = (float) std::sin(2 * PI * (double) (i % 256) / 256);
      auto f2 = framesFromAudio(clm.data(), clm.size(), 48000, 256, &how);
      CHECK(f2.size() == 5 * 2048, "hypersynth import: a file with 256-sample frames (its clm chunk) becomes 5 frames of 2048");
      std::vector<float> saw(48000); for (size_t i = 0; i < saw.size(); ++i) { double ph = std::fmod(i * 220.0 / 48000, 1.0); saw[i] = (float) (.5 * (2 * ph - 1) * (1 - .5 * i / 48000.0)); }
      auto f3 = framesFromAudio(saw.data(), saw.size(), 48000, 0, &how, 64);
      auto harm = [&](int h) { std::complex<double> acc = 0; for (int i = 0; i < 2048; ++i) acc += std::polar((double) f3[(size_t) i], -2 * PI * h * i / 2048.0); return 20 * std::log10(std::abs(acc) + 1e-12); };
      const double h1 = harm(1), h2 = harm(2), h3 = harm(3);
      CHECK(f3.size() == 64 * 2048 && std::fabs(h2 - h1 + 6.02) < 1.5 && std::fabs(h3 - h1 + 9.54) < 1.5, "hypersynth import: a 220 Hz saw recording becomes 64 single-cycle frames with a saw's harmonics (%s)", how.c_str());
      std::vector<float> nz(48000); uint32_t z = 9; for (auto& v : nz) { z = z * 1664525u + 1013904223u; v = (float) ((z >> 8) / 8388608.0 - 1); }
      auto f4 = framesFromAudio(nz.data(), nz.size(), 48000, 0, &how);
      CHECK(!f4.empty() && how.find("no clear pitch") != std::string::npos, "hypersynth import: noise has no pitch, so it is sliced instead (%s)", how.c_str());
      /* an imported table plays, alias-free, and travels inside the preset */
      Synth s; s.prepare(sr); CHECK(s.setCustomTable(0, 0, f3, "My Saw"), "hypersynth import: the table loads into oscillator 1");
      set(s, "l1.o1.mode", 0); set(s, "l1.o1.wtsrc", 1); set(s, "l1.lp.cut", 20000); set(s, "l1.lp.type", 0); set(s, "l1.lp.key", 0);
      s.noteOn(100, 1); auto o = render(s, 48000);
      const double fund = toneDb(o.first, 8000, 48000, 2637, sr), alias = toneDb(o.first, 8000, 48000, 2103.4, sr);
      CHECK(fund > -30 && alias - fund < -70, "hypersynth import: it plays (note %.0f dB) without aliasing (%.0f dB under)", fund, alias - fund);
      const std::string js = s.presetJson("Imported", "User"); Synth t; t.loadPreset(js); std::vector<float> back; std::string nm;
      double err = 0; const bool has = t.customTable(0, 0, &back, &nm); if (has) for (size_t i = 0; i < back.size() && i < f3.size(); ++i) err = std::max(err, (double) std::fabs(back[i] - f3[i]));
      Synth u; u.setCustomTable(0, 0, f3, "x"); u.loadPreset("{\"format\":\"hsyn\",\"v\":1,\"params\":{}}");
      CHECK(has && nm == "My Saw" && back.size() == f3.size() && err < 2e-4 && js.size() < 400000 && !u.customTable(0, 0, nullptr, nullptr),
            "hypersynth import: the table is saved inside the .hsyn (%zu KB) and comes back; a preset without one clears it", js.size() / 1024); }
    /* fast playing over long releases: nothing is cut at the default, and a voice taken for a new note fades (no click) */
    for (int lim : { 32, 6 }) {
        Synth s; s.prepare(sr); set(s, "l1.aenv.a", 20); set(s, "l1.aenv.r", 2500); set(s, "l1.o1.voices", 5); set(s, "l1.lp.cut", 4000); if (lim < 32) set(s, "voices", (float) lim);
        const int arp[8] = { 48, 55, 60, 64, 67, 72, 67, 64 }; int most = 0, cuts = 0; double jump = 0; float prev = 0; std::vector<float> l(6000), r(6000);
        for (int n = 0; n < 64; ++n) { if (s.activeVoices() >= lim) ++cuts; const int k = arp[n % 8] + (n / 16) * 2; s.noteOn(k, .8f);
            s.process(l.data(), r.data(), 3000); s.noteOff(k); s.process(l.data() + 3000, r.data() + 3000, 3000);
            most = std::max(most, s.activeVoices()); for (float x : l) { jump = std::max(jump, (double) std::fabs(x - prev)); prev = x; } }
        if (lim == 32) CHECK(cuts == 0 && most > 16, "hypersynth: a fast arpeggio over 2.5 s releases keeps every tail (%d voices at most of 32)", most);
        else CHECK(cuts > 30 && jump < .15, "hypersynth: with only %d voices, %d notes take a voice, and the tails they replace fade out (biggest step %.3f)", lim, cuts, jump);
    }
    /* presets (.hsyn) */
    { Synth a; a.prepare(sr); set(a, "l1.o1.voices", 7); set(a, "l2.lp.cut", 900); set(a, "play", 2);
      const std::string js = a.presetJson("Test \"Pad\"", "Pads");
      Synth b; std::string name, cat, err; const bool ok = b.loadPreset(js, &err, &name, &cat);
      bool same = true; for (size_t i = 0; i < P.size(); ++i) if (std::fabs(a.param((int) i) - b.param((int) i)) > 1e-3f) same = false;
      Synth c; c.setParam(paramIndex("l1.o1.voices"), 5); c.loadPreset("{\"format\":\"hsyn\",\"v\":1,\"params\":{\"l2.lp.cut\":500,\"from.the.future\":3}}");
      const bool older = c.param(paramIndex("l1.o1.voices")) == P[(size_t) paramIndex("l1.o1.voices")].old && c.param(paramIndex("l2.lp.cut")) == 500;
      CHECK(ok && same && name == "Test \"Pad\"" && cat == "Pads" && older && !c.loadPreset("{\"format\":\"nfx\"}"), "hypersynth: presets round-trip; missing settings get their saved-before value, unknown ones are skipped"); }
    /* the factory presets: each plays, stays clean, and ends */
    { const std::string ft = readText(std::string(TEST_DATA_DIR) + "/../../hypersynth/presets/factoryPresets.json"); const Json fac = Json::parse(ft.data(), ft.size());
      int good = 0; std::string bad;
      for (size_t i = 0; i < fac.size(); ++i) {
        const Json& pr = fac[i]; std::string js = "{\"format\":\"hsyn\",\"v\":1,\"params\":{";
        bool first = true; for (auto& kv : pr["params"].o) { char b2[64]; std::snprintf(b2, sizeof b2, "%.7g", kv.second.num()); js += (first ? "\"" : ",\"") + kv.first + "\":" + b2; first = false; }
        js += "}}";
        Synth s; s.prepare(sr); const bool ok = s.loadPreset(js);
        for (auto& kv : pr["params"].o) if (paramIndex(kv.first) < 0) { bad += " unknown:" + kv.first; }
        /* its modulation and effects (one preset per line in the file: the fx text is cut from its line) */
        std::vector<ModRoute> routes; for (const auto& r : pr["mods"].a) routes.push_back({ r["src"].str(), r["dst"].str(), (float) r["amt"].num(0) });
        s.setMods(routes); if (s.mods().size() != routes.size()) bad += " " + pr["name"].str() + ": a route the engine refuses";
        std::shared_ptr<visu::FxRack> rack;
        if (pr["fx"].type == Json::Obj) { size_t ln = 0, at = 0; for (size_t q = 0; q < ft.size() && ln <= i + 1; ++q) if (ft[q] == '\n') { if (++ln == i + 1) at = q + 1; }
          const size_t f0 = ft.find('{', ft.find("\"fx\"", at)); size_t f1 = f0; for (int dep = 0; f1 < ft.size(); ++f1) { if (ft[f1] == '{') ++dep; else if (ft[f1] == '}' && --dep == 0) break; }
          std::string e2; rack = visu::FxRack::build(ft.substr(f0, f1 - f0 + 1), sr, e2); if (!rack || !rack->unsupported().empty()) bad += " " + pr["name"].str() + ": its effects don't build " + e2; }
        const std::vector<int> chord = s.param(paramIndex("mode")) > .5f ? std::vector<int> { 40 } : std::vector<int> { 48, 55, 60, 64 };
        for (int k : chord) s.noteOn(k, .9f);
        auto on = render(s, 4 * 48000); for (int k : chord) s.noteOff(k); auto off = render(s, 6 * 48000);
        if (rack) { rack->noteOn(chord[0], 110); rack->process(on.first.data(), on.second.data(), (int) on.first.size()); rack->noteOff(); rack->process(off.first.data(), off.second.data(), (int) off.first.size()); }
        const double pk = std::max(peakOf(on.first), peakOf(on.second)), tail = peakOf(std::vector<float>(off.first.end() - 4800, off.first.end()));
        if (ok && pk > .02 && pk < 1.0 && tail < 1e-3) ++good; else { char m[160]; std::snprintf(m, sizeof m, " %s(peak %.3f tail %.4f)", pr["name"].str().c_str(), pk, tail); bad += m; }
        if (std::getenv("HS_LEVELS")) std::printf("         %s / %s: peak %.3f\n", pr["category"].str().c_str(), pr["name"].str().c_str(), pk);
      }
      CHECK(good == (int) fac.size() && bad.empty(), "hypersynth: all %d factory presets play cleanly (peak under 1) and end%s", (int) fac.size(), bad.c_str()); }
    if (const char* out = std::getenv("HS_PARAMS_OUT")) {   // the parameter list, for the panel's test
        std::FILE* f = std::fopen(out, "wb"); if (f) { std::fputs("[", f);
            for (size_t i = 0; i < P.size(); ++i) { const auto& d = P[i]; std::fprintf(f, "%s{\"id\":\"%s\",\"name\":\"%s\",\"unit\":\"%s\",\"min\":%g,\"max\":%g,\"def\":%g,\"log\":%s,\"whole\":%s,\"opts\":[",
                i ? "," : "", d.id.c_str(), d.name.c_str(), d.unit.c_str(), d.min, d.max, d.def, d.log ? "true" : "false",
                (d.id == "voices" || d.id.find(".voices") != std::string::npos || d.id.find(".oct") != std::string::npos || d.id.find(".parts") != std::string::npos || d.id.find(".root") != std::string::npos) ? "true" : "false");
              for (size_t k = 0; k < d.opts.size(); ++k) std::fprintf(f, "%s\"%s\"", k ? "," : "", d.opts[k].c_str()); std::fputs("]}", f); }
            std::fputs("]", f); std::fclose(f); } }
    { const auto& names = wavetableNames(); int good = 0;
      for (int t = 0; t < (int) names.size(); ++t) { auto v = wavetablePreview(t, 9, 128); float pk = 0; for (float x : v) pk = std::max(pk, std::fabs(x)); if (v.size() == 9 * 128 && pk > .3f && pk < 1.2f) ++good; }
      CHECK(good == (int) names.size() && wavetablePreview(99, 9, 128).empty(), "hypersynth: every factory table can be drawn on the screen (%d/%d)", good, (int) names.size());
      if (const char* out = std::getenv("HS_TABLES_OUT")) {   // what the plugin's tablePreviews() returns, for the panel's test
        std::FILE* f = std::fopen(out, "wb"); if (f) { std::fputs("[", f);
          for (int t = 0; t < (int) names.size(); ++t) { auto v = wavetablePreview(t, 9, 128); std::fprintf(f, "%s{\"name\":\"%s\",\"frames\":[", t ? "," : "", names[(size_t) t].c_str());
            for (int fr = 0; fr < 9; ++fr) { std::fputs(fr ? ",[" : "[", f); for (int i = 0; i < 128; ++i) std::fprintf(f, "%s%.3f", i ? "," : "", v[(size_t) fr * 128 + i]); std::fputs("]", f); }
            std::fputs("]}", f); }
          std::fputs("]", f); std::fclose(f); } } }
    /* modulation: LFOs, mod envelopes, macros, velocity, drawn shapes, saved in presets */
    { auto win = [&](const std::vector<float>& v, size_t ms0, size_t ms1) { return rms(v, ms0 * 48, ms1 * 48); };
      // an LFO (square, 4 Hz) on layer I's level: the sound pulses
      Synth s; s.prepare(sr); set(s, "lfo1.shape", 4); set(s, "lfo1.rate", 4); s.setMods({ { "lfo1", "l1.level", -.5f } }); s.noteOn(60, .9f);
      auto o = render(s, 48000); double hi = 0, lo = 1e9; for (int w = 4; w < 36; ++w) { const double r = win(o.first, (size_t) w * 25, (size_t) w * 25 + 20); hi = std::max(hi, r); lo = std::min(lo, r); }
      CHECK(lo > 0 && hi / lo > 8, "hypersynth mod: an LFO on the level makes it pulse (loud / quiet %.1fx)", lo > 0 ? hi / lo : 0);
      // synced to 1/4 at 90 BPM = 1.5 Hz: count the pulses in 2 s
      Synth y; y.prepare(sr); y.setTempo(90); set(y, "lfo1.shape", 4); set(y, "lfo1.sync", 7); y.setMods({ { "lfo1", "l1.level", -.5f } }); y.noteOn(60, .9f);
      auto yo = render(y, 96000); int pulses = 0; bool loud = false;
      for (int w = 0; w < 400; ++w) { const bool l = win(yo.first, (size_t) w * 5, (size_t) w * 5 + 5) > .02; if (l && !loud) ++pulses; loud = l; }
      CHECK(pulses == 3, "hypersynth mod: an LFO synced to 1/4 at 90 BPM pulses 3 times in 2 s (%d)", pulses);
      // a mod envelope on the cutoff: bright at the start, dark later
      Synth e; e.prepare(sr); set(e, "l1.lp.cut", 300); set(e, "env1.a", 1); set(e, "env1.d", 150); set(e, "env1.s", 0); e.setMods({ { "env1", "l1.lp.cut", .7f } }); e.noteOn(48, .9f);
      auto bright = [&](const std::vector<float>& v, size_t a, size_t b) { double d = 0; for (size_t i = a + 1; i < b; ++i) d += (double) (v[i] - v[i - 1]) * (v[i] - v[i - 1]); return std::sqrt(d / (double) (b - a)) / std::max(1e-9, rms(v, a, b)); };
      auto eo = render(e, 48000); const double early = bright(eo.first, 480, 4800), late = bright(eo.first, 38400, 42720);
      CHECK(early > late * 2.5, "hypersynth mod: a mod envelope opens the filter, then it closes (bright / dark %.1fx)", late > 0 ? early / late : 0);
      // a macro: at 0 nothing changes; turned up it does
      Synth m0, m1; for (Synth* z : { &m0, &m1 }) { z->prepare(sr); z->setMods({ { "macro1", "l1.level", -1 } }); }
      set(m1, "macro1", 1); m0.noteOn(60, .9f); m1.noteOn(60, .9f); Synth plain; plain.prepare(sr); plain.noteOn(60, .9f);
      auto a0 = render(m0, 9600), a1 = render(m1, 9600), ap = render(plain, 9600); double same = 0; for (size_t i = 0; i < a0.first.size(); ++i) same = std::max(same, (double) std::fabs(a0.first[i] - ap.first[i]));
      CHECK(same < 1e-6 && rms(a1.first, 4800, 9600) < rms(ap.first, 4800, 9600) * .1, "hypersynth mod: a macro at 0 changes nothing (%.1g), turned up it does", same);
      // velocity on the cutoff: harder notes brighter
      double vb[2]; for (int k = 0; k < 2; ++k) { Synth z; z.prepare(sr); set(z, "l1.lp.cut", 300); set(z, "l1.vel", 0); z.setMods({ { "vel", "l1.lp.cut", .6f } }); z.noteOn(48, k ? 1.f : .1f);
        auto zo = render(z, 9600); vb[k] = bright(zo.first, 4800, 9600); }
      CHECK(vb[1] > vb[0] * 1.5, "hypersynth mod: velocity on the cutoff makes hard notes brighter (%.1fx)", vb[1] / vb[0]);
      // a drawn LFO: a ramp up and a hold, read back as drawn
      Synth dr; dr.prepare(sr); set(dr, "lfo1.shape", 7); set(dr, "lfo1.rate", 1); dr.setLfoShape(0, { 0, 0, 0, .5f, 1, 0, 1, 1, 0 }); dr.setMods({ { "lfo1", "l1.pan", .1f } }); dr.noteOn(60, .9f);
      render(dr, 12000); const float q1 = dr.sourceValue("lfo1"); render(dr, 24000); const float q3 = dr.sourceValue("lfo1");
      CHECK(q1 > -.1f && q1 < .1f && q3 > .95f, "hypersynth mod: a drawn LFO follows its points (at 1/4: %.2f, at 3/4: %.2f)", q1, q3);
      // saved and loaded; a preset from before modulation has none
      Synth sv; sv.setMods({ { "lfo2", "l2.o1.pos", .25f }, { "env2", "l1.lp.cut", -.5f }, { "nope", "l1.lp.cut", 1 }, { "lfo1", "master", 1 } });
      sv.setLfoShape(2, { 0, .2f, .5f, .3f, .9f, -.4f, 1, .2f, 0 }); sv.setMacroName(1, "Brightness"); const auto js = sv.presetJson("M", "Test");
      Synth ld; ld.loadPreset(js); const auto rt = ld.mods(); const auto sh = ld.lfoShape(2);
      Synth old; old.setMods({ { "lfo1", "l1.level", 1 } }); old.loadPreset("{\"format\":\"hsyn\",\"v\":1,\"name\":\"Old\",\"params\":{}}");
      CHECK(rt.size() == 2 && rt[0].src == "lfo2" && rt[1].dst == "l1.lp.cut" && std::fabs(rt[1].amt + .5f) < 1e-4f && sh.size() == 9 && std::fabs(sh[4] - .9f) < 1e-3f
            && ld.macroName(1) == "Brightness" && old.mods().empty() && old.macroName(1) == "Macro 2",
            "hypersynth mod: routes, drawn shapes and macro names are saved in the .hsyn (unknown ones dropped); an older preset has none"); }
    /* Spectrum and Sample modes, warps */
    { auto mag = [&](const std::vector<float>& v, size_t a0, size_t a1, double hz) {   // the level of one frequency (Goertzel, Hann window)
        double c = 2 * std::cos(2 * kPiT * hz / sr), q1 = 0, q2 = 0; const size_t N = a1 - a0;
        for (size_t i = 0; i < N; ++i) { const double w = .5 - .5 * std::cos(2 * kPiT * i / (N - 1)); const double q0 = v[a0 + i] * w + c * q1 - q2; q2 = q1; q1 = q0; }
        return std::sqrt(q1 * q1 + q2 * q2 - c * q1 * q2) / (N / 4.0); };
      auto solo = [&](Synth& z, int mode) { z.prepare(sr); set(z, "l1.o1.mode", (float) mode); set(z, "l1.lp.cut", 20000); set(z, "l1.lp.key", 0); };
      // Spectrum: odd only = hollow (no 2nd harmonic); stretch = bell-like partials off the harmonic grid
      Synth a; solo(a, 1); set(a, "l1.o1.sp.odd", -1); a.noteOn(45, .9f); auto ao = render(a, 24000);
      const double f0 = 110, h1 = mag(ao.first, 4800, 24000, f0), h2 = mag(ao.first, 4800, 24000, 2 * f0), h3 = mag(ao.first, 4800, 24000, 3 * f0);
      Synth b; solo(b, 1); set(b, "l1.o1.sp.stretch", 1); b.noteOn(45, .9f); auto bo = render(b, 24000);
      const double hm = 110 * std::pow(4.0, 1.15), on4 = mag(bo.first, 4800, 24000, hm), grid4 = mag(bo.first, 4800, 24000, 440);
      CHECK(h2 < h1 * .01 && h3 > h1 * .2 && on4 > grid4 * 5, "hypersynth Spectrum: odd-only partials (2nd %.3f, 3rd %.2f of the 1st); stretched partials leave the harmonic grid (%.0fx)", h2 / h1, h3 / h1, grid4 > 0 ? on4 / grid4 : 0);
      // Spectrum high up: nothing folds back below the note
      Synth c; solo(c, 1); set(c, "l1.o1.sp.tilt", 1); c.noteOn(105, .9f); auto co = render(c, 24000); const double top = 440 * std::pow(2.0, 36 / 12.0);
      double below = 0; for (double hz = 200; hz < top * .9; hz += 97) below = std::max(below, mag(co.first, 4800, 24000, hz));
      CHECK(below < mag(co.first, 4800, 24000, top) * .01, "hypersynth Spectrum: a high note with a flat spectrum does not alias (%.4f)", below);
      // Sample: a 220 Hz recording, its key found (A3 = 57), played on A4 sounds at 440 Hz; loops keep it going
      std::vector<float> sm((size_t) (sr * .5)), smR(sm.size()); for (size_t i = 0; i < sm.size(); ++i) { sm[i] = (float) (.6 * std::sin(2 * kPiT * 220 * i / sr) + .2 * std::sin(2 * kPiT * 440 * i / sr)); smR[i] = sm[i] * .5f; }
      const double key = detectKey(sm.data(), sm.size(), sr);
      Synth d; solo(d, 2); set(d, "l1.o1.smp.root", (float) std::lround(key)); CHECK(d.setSample(0, 0, sm, smR, sr, "Test tone"), "hypersynth Sample: a sound can be loaded");
      d.noteOn(69, .9f); auto dout = render(d, 24000); const double at440 = mag(dout.first, 2400, 19200, 440), at220 = mag(dout.first, 2400, 19200, 220);
      CHECK(std::fabs(key - 57) < .1 && at440 > at220 * 20 && rms(dout.second, 2400, 9600) < rms(dout.first, 2400, 9600) * .7, "hypersynth Sample: its key is found (%.2f), A4 plays it an octave up (440 Hz %.2f, 220 Hz %.3f), in stereo", key, at440, at220);
      Synth e; solo(e, 2); set(e, "l1.o1.smp.root", 57); e.setSample(0, 0, sm, {}, sr, "t"); e.noteOn(57, .9f); auto eo = render(e, 48000);
      Synth f; solo(f, 2); set(f, "l1.o1.smp.root", 57); set(f, "l1.o1.smp.loop", 1); set(f, "l1.o1.smp.ls", .2f); set(f, "l1.o1.smp.le", .8f); f.setSample(0, 0, sm, {}, sr, "t"); f.noteOn(57, .9f); auto fo = render(f, 48000);
      Synth g2; solo(g2, 2); set(g2, "l1.o1.smp.root", 57); set(g2, "l1.o1.smp.loop", 2); g2.setSample(0, 0, sm, {}, sr, "t"); g2.noteOn(57, .9f); auto go = render(g2, 48000);
      const double early = rms(eo.first, 4800, 20000);
      CHECK(rms(eo.first, 30000, 48000) < 1e-6 && rms(fo.first, 30000, 48000) > early * .5 && rms(go.first, 30000, 48000) > early * .5,
            "hypersynth Sample: without a loop it ends with the sound (%.1g); Forward and Ping-pong loops keep it playing (%.2f, %.2f of the start)", rms(eo.first, 30000, 48000), rms(fo.first, 30000, 48000) / early, rms(go.first, 30000, 48000) / early);
      // saved inside the .hsyn and back
      Synth sh; sh.setSample(1, 2, sm, smR, sr, "Tone"); const auto js = sh.presetJson("S", "T"); Synth sh2; sh2.loadPreset(js); std::vector<float> l2, r2; double rt = 0; std::string nm;
      Synth sh3; sh3.setSample(0, 0, sm, {}, sr, "x"); sh3.loadPreset("{\"format\":\"hsyn\",\"v\":1,\"params\":{}}");
      CHECK(sh2.sample(1, 2, &l2, &r2, &rt, &nm) && nm == "Tone" && rt == sr && l2.size() == sm.size() && r2.size() == sm.size() && std::fabs(l2[1000] - sm[1000]) < 1e-3f && !sh3.sample(0, 0, nullptr, nullptr, nullptr, nullptr),
            "hypersynth Sample: the sound is saved in the .hsyn (%zu KB) and comes back; a preset without one clears it", js.size() / 1024);
      // warps: Sync on a sine adds harmonics; RM from OSC 1 makes sum and difference tones; Off leaves it pure
      auto sine2 = [&](Synth& z, int warp) { z.prepare(sr); set(z, "l1.o1.mode", 3); set(z, "l1.o1.shape", 3); set(z, "l1.lp.cut", 20000); set(z, "l1.lp.key", 0);
        set(z, "l1.o1.warp", (float) warp); set(z, "l1.o1.warpAmt", .5f); };
      Synth w0, w1; sine2(w0, 0); sine2(w1, 1); w0.noteOn(57, .9f); w1.noteOn(57, .9f); auto w0o = render(w0, 24000), w1o = render(w1, 24000);
      double hw0 = 0, hw1 = 0; for (int hh = 2; hh <= 8; ++hh) { hw0 += mag(w0o.first, 4800, 24000, 220.0 * hh); hw1 += mag(w1o.first, 4800, 24000, 220.0 * hh); }
      Synth rm; rm.prepare(sr); set(rm, "l1.o1.mode", 3); set(rm, "l1.o1.shape", 3); set(rm, "l1.o2.on", 1); set(rm, "l1.o2.mode", 3); set(rm, "l1.o2.shape", 3); set(rm, "l1.o2.semi", 7);
      set(rm, "l1.o2.warp", 8); set(rm, "l1.o2.warpAmt", 1); set(rm, "l1.o1.level", 0.01f); set(rm, "l1.lp.cut", 20000); set(rm, "l1.lp.key", 0); rm.noteOn(57, .9f); auto rmo = render(rm, 24000);
      const double f2 = 220 * std::pow(2.0, 7 / 12.0), sum = mag(rmo.first, 4800, 24000, f2 + 220), plain = mag(rmo.first, 4800, 24000, f2);
      CHECK(hw0 < .01 && hw1 > .2 && sum > plain * 3, "hypersynth warps: Off stays a pure sine (%.4f), Sync adds harmonics (%.2f), RM from OSC 1 makes sum tones (%.1fx)", hw0, hw1, plain > 0 ? sum / plain : 0);
      // every warp on a wavetable stays clean and bounded
      int fine = 0; for (int wv = 1; wv <= 8; ++wv) { Synth z; z.prepare(sr); set(z, "l1.o1.mode", 0); set(z, "l1.o1.table", 2); set(z, "l1.o1.pos", .5f); set(z, "l1.o1.warp", (float) wv); set(z, "l1.o1.warpAmt", .8f);
        set(z, "l1.o2.on", 1); z.noteOn(48, .9f); z.noteOn(84, .9f); auto zo = render(z, 24000); const double pk = peakOf(zo.first); if (pk > .01 && pk < 1 && std::isfinite(pk)) ++fine; }
      CHECK(fine == 8, "hypersynth warps: all 8 warps play cleanly on a wavetable (%d/8)", fine); }
    /* the FX tab: the chain the panel's test made (Ring mod -> Reverb, an LFO on the ring's frequency) runs after the synth */
    { std::string err; auto rack = visu::FxRack::build(readText(std::string(TEST_DATA_DIR) + "/hypersynth-fx.json"), sr, err);
      Synth s; s.prepare(sr); s.noteOn(57, .9f); auto dry = render(s, 48000);
      double in = 0, out = 0, diff = 0;
      if (rack) { std::vector<float> l = dry.first, r = dry.second; rack->noteOn(57, .9f); rack->process(l.data(), r.data(), (int) l.size());
        for (size_t i = 0; i < l.size(); ++i) { in += dry.first[i] * dry.first[i]; out += l[i] * l[i]; diff += (l[i] - dry.first[i]) * (l[i] - dry.first[i]); } }
      CHECK(rack && !rack->empty() && rack->unsupported().empty() && out > in * .05 && diff > in * .1 && std::isfinite(out),
            "hypersynth FX tab: the panel's chain builds and changes the sound (%s; out/in %.2f, change %.2f)", err.empty() ? "ok" : err.c_str(), in > 0 ? out / in : 0, in > 0 ? diff / in : 0); }
    /* CPU: a big sound, 8 notes x 2 layers x 3 oscillators x 16 Hyper voices */
    { Synth s; s.prepare(sr); set(s, "play", 2);
      for (int L = 1; L <= 2; ++L) for (int k = 1; k <= 3; ++k) { char id[32]; std::snprintf(id, sizeof id, "l%d.o%d.on", L, k); set(s, id, 1); std::snprintf(id, sizeof id, "l%d.o%d.voices", L, k); set(s, id, 16); }
      { std::vector<ModRoute> r; const char* src[] = { "lfo1", "lfo2", "lfo3", "lfo4", "env1", "env2", "vel", "rand" };
        for (int L = 1; L <= 2; ++L) for (int k = 1; k <= 3; ++k) for (const char* d : { "pos", "detune", "level", "fine" }) { char id[32]; std::snprintf(id, sizeof id, "l%d.o%d.%s", L, k, d); r.push_back({ src[r.size() % 8], id, .2f }); }
        for (const char* d : { "l1.lp.cut", "l2.lp.cut", "l1.lp.res", "l2.pan" }) r.push_back({ "lfo1", d, .3f });
        s.setMods(r); }
      for (int k : { 48, 52, 55, 59, 60, 64, 67, 71 }) s.noteOn(k, .8f);
      const auto t0 = std::chrono::steady_clock::now(); auto o = render(s, 480000); const double secs = std::chrono::duration<double>(std::chrono::steady_clock::now() - t0).count();
      CHECK(peakOf(o.first) >= 0 && secs < 10, "hypersynth: worst case (768 oscillators at once, 28 modulations) runs at %.0f%% of one core", secs / 10 * 100); }
}

static void testCompat() {
    const std::string dir = COMPAT_DIR, jp = dir + "/compat.json"; std::string txt = readText(jp);
    Json db = txt.empty() ? Json() : Json::parse(txt.data(), txt.size());
    const bool write = std::getenv("VISU_COMPAT_WRITE") != nullptr;
    const int notes[] = { 36, 48, 60, 72, 84 };
    std::vector<std::string> files; for (const char* f : { "2026-11-04-golden.vsamp", "2026-11-04-rompler-demo.vsamp", "2026-11-05-fx.vsamp", "2026-11-05b-fx.vsamp", "2026-11-06-fx.vsamp", "2026-11-06-maker-features.vsamp" }) files.push_back(f);
    std::string outJson = "{\n"; bool added = false;
    for (size_t fi = 0; fi < files.size(); ++fi) {
        const std::string& name = files[fi]; std::string err; auto lib = Library::load(dir + "/" + name, err, 48000);
        CHECK(lib != nullptr, "compat: %s still loads %s", name.c_str(), err.c_str());
        const Json& rec = db[name.c_str()];
        std::string line = "  \"" + name + "\": [";
        int worst = -1; double worstD = 0; bool same = true;
        for (size_t k = 0; k < 5; ++k) {
            const std::vector<double> got = lib ? compatPrint(lib, notes[k]) : std::vector<double>();
            line += (k ? ", [" : "[");
            for (size_t j = 0; j < got.size(); ++j) { char b[32]; std::snprintf(b, sizeof b, "%s%.6g", j ? ", " : "", got[j]); line += b; }
            line += "]";
            if (!rec.isNull()) for (size_t j = 0; j < got.size() && j < rec[k].size(); ++j) {
                const double want = rec[k][j].num(), d = std::fabs(got[j] - want) / std::max(1e-4, std::fabs(want));
                if (d > worstD) { worstD = d; worst = notes[k]; } if (d > 2e-3) same = false;
            }
        }
        line += "]"; outJson += line + (fi + 1 < files.size() ? ",\n" : "\n");
        if (rec.isNull()) { added = true; CHECK(write, "compat: %s has a fingerprint (run with VISU_COMPAT_WRITE=1 once when adding a file)", name.c_str()); }
        else CHECK(same, "compat: %s sounds the same as when it was frozen (largest change %.2g%% at note %d)", name.c_str(), worstD * 100, worst);
    }
    outJson += "}\n";
    if (write && added) {   // only new files get a fingerprint; existing ones stay as recorded
        std::string merged = "{\n"; size_t p = outJson.find('\n') + 1;
        for (size_t fi = 0; fi < files.size(); ++fi) {
            const size_t e = outJson.find('\n', p); std::string line = outJson.substr(p, e - p); p = e + 1;
            const Json& rec = db[files[fi].c_str()];
            if (!rec.isNull()) {   // keep the recorded values
                std::string keep = "  \"" + files[fi] + "\": [";
                for (size_t k = 0; k < rec.size(); ++k) { keep += k ? ", [" : "["; for (size_t j = 0; j < rec[k].size(); ++j) { char b[32]; std::snprintf(b, sizeof b, "%s%.6g", j ? ", " : "", rec[k][j].num()); keep += b; } keep += "]"; }
                line = keep + "]" + (fi + 1 < files.size() ? "," : "");
            }
            merged += line + "\n";
        }
        merged += "}\n"; std::FILE* f = std::fopen(jp.c_str(), "wb"); if (f) { std::fwrite(merged.data(), 1, merged.size(), f); std::fclose(f); }
        std::printf("compat: wrote fingerprints for new files to %s\n", jp.c_str());
    }
}

int main() {
    testJson(); testGolden(); testKeepSpeed(); testPlay(); testLiveModes(); testGroupEnv(); testGroupLinks(); testVFilter(); testKeyswitch(); testLayers(); testRoundRobin(); testGroupPatches(); testStreaming(); testDemo(); testLibrarySwap(); testFx(); testVslib(); testFxRack(); testNodeFXFactory(); testFxQuality(); testRingSweep(); testSynth(); testCompat();
    std::printf("\n%d checks, %d failed\n", checks, failures);
    return failures ? 1 : 0;
}
