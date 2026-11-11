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
// the note a sound plays (MIDI key, with cents as the fraction), or -1 when it has no clear pitch
double detectKey(const float* mono, size_t n, double sampleRate);

// modulation (Vital / Serum style): a source moves any continuous parameter of a voice. Sources by id:
// lfo1..lfo4 (-1..1), env1, env2 (the mod envelopes, 0..1), macro1..macro4 (0..1), vel, wheel, at (aftertouch) 0..1,
// key (-1..1 around middle C), rand (-1..1, new on every note), ribbon (-1..1, when the ribbon is set to modulate). amt -1..1: how far, in the knob's own travel.
// Destinations: the settings of the layers ("l1." / "l2."), the continuous ones.
struct ModRoute { std::string src, dst; float amt = 0; };
const std::vector<std::string>& modSources();
// the shape of a drawn LFO segment (and a mod envelope stage): x 0..1 -> 0..1; curve -1..1 bends it (0 = straight)
float curveShape(float x, float curve);

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
    // Sample mode: the sound an oscillator plays (right empty = mono). Up to 30 s; saved in presets and the project.
    bool setSample(int layer, int osc, const std::vector<float>& left, const std::vector<float>& right, double sampleRate, const std::string& name);
    void clearSample(int layer, int osc);
    bool sample(int layer, int osc, std::vector<float>* left, std::vector<float>* right, double* sampleRate, std::string* name) const;
    // modulation: message thread (the audio thread picks the routes up without waiting)
    static constexpr int kMaxRoutes = 64, kLfos = 4, kMacros = 4;
    void setMods(const std::vector<ModRoute>& routes);   // unknown sources / destinations are dropped
    std::vector<ModRoute> mods() const;
    // a drawn LFO: points x,y,curve (x 0..1 rising, y 0..1); used while its shape is "Drawn"
    void setLfoShape(int lfo, const std::vector<float>& xyc);
    std::vector<float> lfoShape(int lfo) const;
    void setMacroName(int i, const std::string& name);
    std::string macroName(int i) const;
    void setTempo(double bpm);                  // for synced LFOs
    void setAftertouch(float v);                // 0..1 (channel pressure)
    float sourceValue(const std::string& src) const;   // the newest note's value of a source, for the panel
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
