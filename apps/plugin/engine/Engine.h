// Real-time sample playback. No allocation, locks or file access on the audio thread.
#pragma once
#include "Library.h"
#ifndef VISU_NO_FILES
#include "Stream.h"
#endif
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
    // which list plays: -1 = every group, -2 = the list the library was saved with
    void setList(int index) { list_.store(index); }
    // true once after a keyswitch note changed the list (the player then updates its interface)
    bool takeKeyswitchChange() { return ksChanged_.exchange(false); }
    int list() const { return list_.load(); }

    // audio thread
    void noteOn(int note, int velocity);
    void noteOff(int note);
    void sustain(bool down);
    void allNotesOff();
    void render(float* left, float* right, int numFrames);   // adds into the buffers
    void controller(int cc, int value);
    void setTagIndex(int index, float value01);   // audio thread: a knob moved by DAW automation or a MIDI controller    // mod wheel (1), expression (11), sustain (64)
    void pitchBend(float v01);
    void aftertouch(float v01);
    int activeVoices() const { return active_.load(); }
    // streaming from disk: voices reading from disk now, and how often the disk was late (silence played)
    int streamingVoices() const;
    long streamMisses() const;
    // CPU guard: the host reports how much of the block's time the last render took (1 = all of it).
    // Under load the engine lowers its voice limit and steals the extra voices; it recovers when the load drops.
    void reportLoad(float fraction);
    int voiceLimit() const { return guard_.load(); }

private:
    struct Voice {
        bool on = false, releasing = false, oneshot = false, fromRelease = false, held = false;
        const Zone* zone = nullptr; const Sample* sample = nullptr; const ZoneAudio* audio = nullptr;
        double pos = 0, ratio = 1; Interp interp = Interp::Linear;
        float gain = 1, gl = 1, gr = 1, pan = 0, env = 1, envInc = 0, relInc = 0, attackInc = 0; bool stereoIn = false;
        int note = 0, group = -1, choke = 0; unsigned long age = 0; long maxLife = -1;
        // speed-keeping: two overlapping grains read at the pitch while the position moves at the speed (from EmulonX)
        bool stolen = false; float glide = 0, glideStep = 0; int vel = 100;   // glide: semitones still to slide (from EmulonX)
        bool adsr = false; int stage = 0; float gmul = -1;
        int slot = -1;   // disk stream for a long sample (player)   // group envelope: 0 attack, 1 decay, 2 sustain
        int kind = 0;   // 0 sample, 2 granular, 3 wavetable
        struct Grain { double o, p0, rate; };
        static constexpr int kMaxGrains = 64;
        Grain grains[kMaxGrains]; int ngr = 0, gk = 0, seed = 0; double gt = 0, nextSpawn = 0, pitch = 1;
        double wph = 0, wf = 440, wms = 0; int wfade = 0;
        bool keepSpeed = false, wsola = true; double k = 1, read0 = 0, read1 = 0; int grain = 2048, grainCounter = 0;
    };
    void adopt();
    int renderVoices(float* L, float* R, int n, float gainScale);
    fx::Control ctl_;
    void kill(Voice& v, bool fast);
    void endVoice(Voice& v);
    void startZone(const Zone& z, int note, int vel, bool fromRelease, float glideFrom = 0);
    void startNote(int note, int vel, float glideFrom, const Zone* const* skip, int nskip);
    void monoNoteOn(int note, int vel, int previous);
    bool stealOne();
    int limit() const;
    int sounding() const;
    float glideStepFor(float semis) const;
    void groupEnv(int group, float& a, float& d, float& s, float& r) const;
    void groupLive(int group, float& gain, float& pan, float& semis) const;   // knob-driven group volume, pan and tuning   // live values (knobs included), A/D/R in ms
    int stack_[128] = {}; int stackSize_ = 0, monoNote_ = -1, lastNote_ = -1, monoVel_ = 100;
    std::atomic<int> guard_{kMaxVoices};
    Interp interpFor(const Zone& z) const;
    float zoneGain(const Zone& z, int note, int vel) const;

    double sr_ = 44100;
    const Library* lib_ = nullptr;                      // audio thread only
    std::atomic<const Library*> pending_{nullptr};      // message thread -> audio thread
    std::atomic<const Library*> inUse_{nullptr};        // audio thread -> message thread (hazard pointer)
    std::vector<std::shared_ptr<const Library>> owners_; std::mutex ownersMutex_;
    std::atomic<float> master_{0.8f};
    std::atomic<int> list_{-2};
    bool groupAllowed(int g) const;
    int keyswitchList(int note) const;
    std::atomic<bool> ksChanged_{ false };
    float rnd() { rng_ = rng_ * 1664525u + 1013904223u; return (float) ((rng_ >> 8) & 0xFFFF) / 65535.f; }
    std::atomic<int> active_{0};
    Voice voices_[kMaxVoices];
    unsigned long clock_ = 0; bool sustain_ = false; bool heldNotes_[128] = {};
    int rr_[256] = {}; uint32_t rng_ = 12345;
#ifndef VISU_NO_FILES
    std::unique_ptr<Streamer> streamer_;   // made on the message thread by the first library that streams, kept from then on
#endif
};

} // namespace visu
