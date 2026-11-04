// Real-time sample playback. No allocation, locks or file access on the audio thread.
#pragma once
#include "Library.h"
#include <atomic>
#include <memory>
#include <mutex>

namespace visu {

class Engine {
public:
    static constexpr int kMaxVoices = 256;
    Engine();
    void prepare(double sampleRate);

    // message thread: hand over a new library (nullptr unloads). The old one is kept alive until the audio thread has let go of it.
    void setLibrary(std::shared_ptr<const Library> lib);
    void setMasterGain(float g) { master_.store(g); }

    // audio thread
    void noteOn(int note, int velocity);
    void noteOff(int note);
    void sustain(bool down);
    void allNotesOff();
    void render(float* left, float* right, int numFrames);   // adds into the buffers
    int activeVoices() const { return active_.load(); }

private:
    struct Voice {
        bool on = false, releasing = false, oneshot = false, fromRelease = false, held = false;
        const Zone* zone = nullptr; const Sample* sample = nullptr; const ZoneAudio* audio = nullptr;
        double pos = 0, ratio = 1; Interp interp = Interp::Linear;
        float gain = 1, gl = 1, gr = 1, pan = 0, env = 1, envInc = 0, relInc = 0, attackInc = 0; bool stereoIn = false;
        int note = 0, group = -1, choke = 0; unsigned long age = 0; long maxLife = -1;
    };
    void adopt();
    void kill(Voice& v, bool fast);
    void startZone(const Zone& z, int note, int vel, bool fromRelease);
    Interp interpFor(const Zone& z) const;
    float zoneGain(const Zone& z, int note, int vel) const;

    double sr_ = 44100;
    const Library* lib_ = nullptr;                      // audio thread only
    std::atomic<const Library*> pending_{nullptr};      // message thread -> audio thread
    std::atomic<const Library*> inUse_{nullptr};        // audio thread -> message thread (hazard pointer)
    std::vector<std::shared_ptr<const Library>> owners_; std::mutex ownersMutex_;
    std::atomic<float> master_{0.8f};
    std::atomic<int> active_{0};
    Voice voices_[kMaxVoices];
    unsigned long clock_ = 0; bool sustain_ = false; bool heldNotes_[128] = {};
    int rr_[256] = {}; uint32_t rng_ = 12345;
};

} // namespace visu
