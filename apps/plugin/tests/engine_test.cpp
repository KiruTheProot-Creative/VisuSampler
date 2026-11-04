// Checks the C++ engine against the JS core (golden vectors) and against the example library.
#include "Engine.h"
#include <cmath>
#include <cstdio>
#include <fstream>
#include <sstream>
#include <string>

using namespace visu;
static int failures = 0, checks = 0;
#define CHECK(c, ...) do { ++checks; if (!(c)) { ++failures; std::printf("FAIL  "); std::printf(__VA_ARGS__); std::printf("\n"); } else { std::printf("ok    "); std::printf(__VA_ARGS__); std::printf("\n"); } } while (0)

static std::string readText(const std::string& p) { std::ifstream f(p, std::ios::binary); std::stringstream s; s << f.rdbuf(); return s.str(); }

static void renderNote(const std::shared_ptr<Library>& lib, int note, int vel, int frames, std::vector<float>& L, std::vector<float>& R) {
    Engine e; e.prepare(44100); e.setMasterGain(1.f); e.setLibrary(lib);
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

static void testDemo() {
    std::string err; auto lib = Library::load(std::string(EXAMPLES_DIR) + "/rompler-demo.vsamp", err);
    CHECK(lib != nullptr, "demo library loads %s", err.c_str());
    if (!lib) return;
    CHECK(lib->zones.size() == 15 && lib->groups.size() == 4 && lib->unsupportedZones == 0, "demo has 15 zones, 4 groups (%zu, %zu)", lib->zones.size(), lib->groups.size());
    LibraryInfo info; std::string e2;
    CHECK(Library::readInfo(std::string(EXAMPLES_DIR) + "/rompler-demo.vsamp", info, e2) && info.name == "Rompler Demo" && info.bannerTile.size() > 100, "info and banner read without decoding audio");
    Engine e; e.prepare(48000); e.setLibrary(lib);
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
    { Engine r; r.prepare(44100); r.setLibrary(lib); r.noteOn(40, 100); r.render(a1.data(), b1.data(), 2000); r.allNotesOff(); r.noteOn(40, 100); r.render(a2.data(), b2.data(), 2000); }
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
    Engine e; e.prepare(44100); std::vector<float> L(512), R(512);
    for (int i = 0; i < 20; ++i) { e.setLibrary(i % 2 ? a : b); e.noteOn(55, 100); std::fill(L.begin(), L.end(), 0.f); std::fill(R.begin(), R.end(), 0.f); e.render(L.data(), R.data(), 512); }
    e.setLibrary(nullptr); e.render(L.data(), R.data(), 512);
    CHECK(true, "libraries can be swapped and unloaded while playing");
}

int main() {
    testJson(); testGolden(); testDemo(); testLibrarySwap();
    std::printf("\n%d checks, %d failed\n", checks, failures);
    return failures ? 1 : 0;
}
