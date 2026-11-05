// Checks the C++ engine against the JS core (golden vectors) and against the example library.
#include <memory>
#include <thread>
#include <chrono>
#include <cstdio>
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
    std::vector<double> ref; levels(72, 127, 40, ref);
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
    for (const char* name : { "stream.vsamp", "stream-z.vsamp" }) {
        const std::string path = std::string(TEST_DATA_DIR) + "/" + name; std::string err;
        auto disk = Library::load(path, err, 48000);
        std::vector<uint8_t> bytes; { std::FILE* f = std::fopen(path.c_str(), "rb"); std::fseek(f, 0, SEEK_END); bytes.resize((size_t) std::ftell(f)); std::fseek(f, 0, SEEK_SET); if (std::fread(bytes.data(), 1, bytes.size(), f) != bytes.size()) bytes.clear(); std::fclose(f); }
        auto mem = Library::loadBytes(bytes, err, 48000);
        if (!disk || !mem) { CHECK(false, "%s loads (%s)", name, err.c_str()); continue; }
        CHECK(disk->streamedSamples() == 1 && mem->streamedSamples() == 0 && disk->memoryBytes() * 3 < mem->memoryBytes(),
              "%s: the long sample streams; %.1f MB in memory instead of %.1f MB", name, disk->memoryBytes() / 1048576.0, mem->memoryBytes() / 1048576.0);
        for (int note : { 60, 79, 96 }) {   // straight, pitched up (faster reading), and a zone that starts 3 s in
            auto a = std::make_unique<Engine>(), b = std::make_unique<Engine>();
            a->prepare(48000); b->prepare(48000); a->setMasterGain(1); b->setMasterGain(1); a->setLibrary(disk); b->setLibrary(mem);
            a->noteOn(note, 110); b->noteOn(note, 110);
            std::vector<float> la(480), ra(480), lb(480), rb(480); double maxd = 0, peak = 0; const long miss0 = a->streamMisses(); int streaming = 0;
            for (int blk = 0; blk < 500; ++blk) {   // 5 s, about five times faster than real time
                std::fill(la.begin(), la.end(), 0.f); std::fill(ra.begin(), ra.end(), 0.f); std::fill(lb.begin(), lb.end(), 0.f); std::fill(rb.begin(), rb.end(), 0.f);
                a->render(la.data(), ra.data(), 480); b->render(lb.data(), rb.data(), 480); streaming = std::max(streaming, a->streamingVoices());
                for (int i = 0; i < 480; ++i) { maxd = std::max(maxd, (double) std::max(std::fabs(la[i] - lb[i]), std::fabs(ra[i] - rb[i]))); peak = std::max(peak, (double) std::fabs(lb[i])); }
                std::this_thread::sleep_for(std::chrono::milliseconds(2));
            }
            CHECK(streaming == 1 && maxd < 1e-5 && peak > .1 && a->streamMisses() == miss0, "%s note %d: streamed audio matches memory (max difference %.2g, %ld late reads)", name, note, maxd, a->streamMisses() - miss0);
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
        if (mod == "lfo-mod" || mod == "tag" || mod == "macro" || mod.rfind("bypass", 0) == 0) continue;
        const double secs = mod == "feedback" ? 3 : 1;
        auto [fin, peak, rms] = renderKey(key, secs, -1, nullptr);
        CHECK(fin && peak > 1e-3 && peak < 8, "%s: finite and audible (peak %.3f, rms %.4f)", mod.c_str(), peak, rms);
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

int main() {
    testJson(); testGolden(); testKeepSpeed(); testPlay(); testLiveModes(); testGroupEnv(); testGroupLinks(); testVFilter(); testKeyswitch(); testLayers(); testGroupPatches(); testStreaming(); testDemo(); testLibrarySwap(); testFx();
    std::printf("\n%d checks, %d failed\n", checks, failures);
    return failures ? 1 : 0;
}
