// C interface for the WebAssembly build of the engine (used by VisuMaker).
// The host copies a .vsamp into memory from visu_alloc, calls visu_load, then drives notes and visu_render.
#include "Engine.h"
#include <cstdlib>
#include <cstring>
#include <string>

using namespace visu;

namespace {
Engine* g_engine = nullptr;
std::shared_ptr<Library> g_lib;
std::string g_error;
std::vector<float> g_left, g_right; double g_sr = 48000;
Engine& eng() { if (!g_engine) g_engine = new Engine(); return *g_engine; }
}

extern "C" {

void* visu_alloc(int bytes) { return std::malloc((size_t) bytes); }
void visu_free(void* p) { std::free(p); }

void visu_prepare(double sampleRate, int maxFrames) {
    eng().prepare(sampleRate); g_sr = sampleRate;
    g_left.assign((size_t) maxFrames, 0.f); g_right.assign((size_t) maxFrames, 0.f);
}

// Takes ownership of the bytes (they are freed). Returns 1 on success.
int visu_load(uint8_t* bytes, int length) {
    std::vector<uint8_t> v(bytes, bytes + length); std::free(bytes);
    std::string err; auto lib = Library::loadBytes(std::move(v), err, g_sr);
    if (!lib) { g_error = err; return 0; }
    g_lib = lib; eng().setLibrary(lib); g_error.clear();
    return 1;
}
void visu_unload() { eng().setLibrary(nullptr); g_lib.reset(); }
const char* visu_error() { return g_error.c_str(); }

void visu_note_on(int note, int velocity) { eng().noteOn(note, velocity); }
void visu_note_off(int note) { eng().noteOff(note); }
void visu_sustain(int down) { eng().sustain(down != 0); }
void visu_all_off() { eng().allNotesOff(); }
void visu_set_list(int index) { eng().setList(index); }
void visu_set_gain(float g) { eng().setMasterGain(g); }
// name is a NUL-terminated string allocated with visu_alloc (freed here)
int visu_set_tag(char* name, float value) { int ok = g_lib && g_lib->setTag(name, value) ? 1 : 0; std::free(name); return ok; }
void visu_controller(int cc, int value) { eng().controller(cc, value); }
void visu_pitch_bend(float v01) { eng().pitchBend(v01); }

// Renders `frames` (at most maxFrames) into the output buffers below.
void visu_render(int frames) {
    if ((size_t) frames > g_left.size()) frames = (int) g_left.size();
    std::memset(g_left.data(), 0, sizeof(float) * (size_t) frames); std::memset(g_right.data(), 0, sizeof(float) * (size_t) frames);
    eng().render(g_left.data(), g_right.data(), frames);
}
float* visu_left() { return g_left.data(); }
float* visu_right() { return g_right.data(); }
int visu_voices() { return eng().activeVoices(); }
int visu_zones() { return g_lib ? (int) g_lib->zones.size() : 0; }
int visu_unsupported_zones() { return g_lib ? g_lib->unsupportedZones : 0; }

}
