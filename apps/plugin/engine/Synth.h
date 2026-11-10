// HyperSynth: the sound engine. Two layers per note (CS-80 style), each with 3 oscillators (Wavetable, Spectrum,
// Sample, Analog, FM, Noise modes) and Hyper unison up to 16 voices, a sub and noise, a high-pass into a low-pass
// filter, amp and filter envelopes. Up to 32 notes. Its effects are NodeFX's (FxRack), added by the plugin.
//
// Parameters are one flat table (params()): ids like "l1.o2.detune" (layer 1, oscillator 2). Presets are .hsyn files:
// JSON {"format":"hsyn","v":1,"name","category","params":{id:value}}. A preset loads in every later version: an id it
// lacks gets that parameter's `old` value (the sound it had before the parameter existed), unknown ids are ignored.
#pragma once
#include <atomic>
#include <memory>
#include <string>
#include <vector>

namespace visu {
namespace hs {

struct ParamDef {
    std::string id, name, unit;
    float min = 0, max = 1, def = 0, old = 0;   // old: the value for a preset saved before this parameter existed
    bool log = false;                           // knob moves logarithmically (frequencies, times)
    std::vector<std::string> opts;              // a choice (step) parameter: its names; value = index
};
const std::vector<ParamDef>& params();
int paramIndex(const std::string& id);          // -1 when unknown

// the factory wavetables (names, in the order of the "table" parameter; new ones are only ever added at the end)
const std::vector<std::string>& wavetableNames();
// a factory table for drawing: `frames` frames spread over its Position range, `points` samples per cycle each (peak 1)
std::vector<float> wavetablePreview(int table, int frames, int points);

// any sound -> wavetable frames (2048 samples each). A wavetable file is cut into its frames (frameSize from its "clm"
// chunk when known, else 2048); any other sound has its pitch found, and single cycles are taken from across the file.
// how: what was done, in words.
std::vector<float> framesFromAudio(const float* mono, size_t n, double sampleRate, int frameSize, std::string* how, int maxFrames = 64);

class Synth {
public:
    static constexpr int kMaxVoices = 32, kMaxUnison = 16;
    Synth();
    ~Synth();
    void prepare(double sampleRate);
    // playing: audio thread
    void noteOn(int key, float velocity);       // velocity 0..1
    void noteOff(int key);
    void allNotesOff(bool hard = false);        // hard: silence at once
    void setBend(float v);                      // -1..1
    void setModWheel(float v);                  // 0..1 (vibrato)
    void setSustain(bool down);
    // parameters: any thread
    void setParam(int index, float value);
    float param(int index) const;
    void resetParams();                         // every parameter to its default (the init sound)
    // adds the synth's output to nothing: overwrites l and r
    void process(float* left, float* right, int n);
    // an imported wavetable for one oscillator (layer 0/1, osc 0..2), used while its "wtsrc" is Custom. Any thread but
    // the audio thread; the audio thread picks it up without waiting. Saved in presets and the DAW project.
    bool setCustomTable(int layer, int osc, const std::vector<float>& frames, const std::string& name);
    void clearCustomTable(int layer, int osc);
    bool customTable(int layer, int osc, std::vector<float>* frames, std::string* name) const;
    // presets
    std::string presetJson(const std::string& name, const std::string& category) const;
    bool loadPreset(const std::string& json, std::string* error = nullptr, std::string* name = nullptr, std::string* category = nullptr);
    int activeVoices() const;
    struct Impl;
private:
    std::unique_ptr<Impl> d_;
};

} // namespace hs
} // namespace visu
