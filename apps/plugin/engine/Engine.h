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
    // rendering faster than real time (a DAW bounce): streamed samples wait for the disk instead of dropping out
    void setOffline(bool on);
    // which list plays: -1 = every group, -2 = the list the library was saved with
    void setList(int index) { list_.store(index); }
    // true once after a keyswitch note changed the list (the player then updates its interface)
    bool takeKeyswitchChange() { return ksChanged_.exchange(false); }
    int list() const { return list_.load(); }
    // layer B: a second list that plays at the same time (-2 = the one the library was saved with, -3 = off)
    void setListB(int index) { listB_.store(index); }
    // VisuMaker: an effect parameter moved (see fx::System::setParam); call it from the thread that renders
    bool setFxParam(const std::string& node, const std::string& key, float value, bool syncPos) { return lib_ && lib_->fx && lib_->fx->setParam(node, key, value, syncPos); }
    // the host's tempo and time signature (bpm <= 0: use the library's own tempo)
    void setHostTempo(double bpm, int sigN, int sigD) { hostBpm_.store(bpm); hostSig_.store(sigN * 100 + sigD); }
    double tempo() const { const double h = hostBpm_.load(); return h > 0 ? h : (lib_ ? lib_->bpm : 120); }
    // patch mode "group": which group of the chosen list plays on each layer (-2 = the one the library was saved with)
    void setPatch(int layer, int index) { patch_[layer & 1].store(index); }
    int patch(int layer) const { return patch_[layer & 1].load(); }
    int listB() const { return listB_.load(); }

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
        // per-note filter and LFO
        float fenv = 0, fRel = 0; int fstage = 0; float fz[2][2][2] = {}; float fa1 = 0, fa2 = 0, fa3 = 0, fk = 1; double lfoPh = 0; long lfoAge = 0;
        int layer = 0;   // 0 = A, 1 = B
        int64_t loops = 0;   // how often a streamed loop went round (the stream counts frames without wrapping)
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
    void startZone(const Zone& z, int note, int vel, bool fromRelease, float glideFrom = 0, int layer = 0);
    // scope: -1 = the groups that follow the Playing settings, g >= 0 = only group g (it has its own mono/legato/poly)
    void startNote(int note, int vel, float glideFrom, const Zone* const* skip, int nskip, int scope = -1);
    void startNoteLayer(int note, int vel, float glideFrom, const Zone* const* skip, int nskip, int layer, int scope);
    bool inScope(int group, int scope) const { return scope >= 0 ? group == scope : !lib_->anyOwnMode || lib_->groups[(size_t) group].pmode == 0; }
    int layerCount() const;   // 1, or 2 when layer B plays
public:
    struct VoiceSpan { const Voice* b; const Voice* e; const Voice* begin() const { return b; } const Voice* end() const { return e; } };
    VoiceSpan debugVoices() const { return { voices_, voices_ + kMaxVoices }; }   // tests
private:
    void voiceEnv(const Voice& v, float& a, float& d, float& s, float& r) const;   // the layer's envelope when it has one, else the group's
    void monoNoteOn(int note, int vel, int previous, int scope, bool legato, float glideMs);
    // the held keys of one mono scope (the global one, or a group with its own mono/legato)
    struct Mono { int stack[128] = {}; int size = 0, note = -1, last = -1, vel = 100; };
    static constexpr int kMonoGroups = 64;
    Mono monoG_[kMonoGroups];
    void monoPress(Mono& m, int note, int vel, int scope, bool legato, float glideMs);
    bool monoRelease(Mono& m, int note, int scope, bool legato, float glideMs);   // true: went back to a key still held
    float glideNow_ = 0;   // glide time of the note being started
    bool stealOne();
    int limit() const;
    int sounding() const;
    float glideStepFor(float semis) const;
    void groupEnv(int group, float& a, float& d, float& s, float& r) const;
    void groupLive(int group, float& gain, float& pan, float& semis) const;
    void layerLive(int layer, float& gain, float& pan, float& semis) const;   // the layer's knobs, added on top   // knob-driven group volume, pan and tuning   // live values (knobs included), A/D/R in ms
    Mono mono_;
    std::atomic<int> guard_{kMaxVoices};
    Interp interpFor(const Zone& z) const;
    float zoneGain(const Zone& z, int note, int vel) const;

    double sr_ = 44100;
    const Library* lib_ = nullptr;                      // audio thread only
    std::atomic<const Library*> pending_{nullptr};      // message thread -> audio thread
    std::atomic<const Library*> inUse_{nullptr};        // audio thread -> message thread (hazard pointer)
    std::vector<std::shared_ptr<const Library>> owners_; std::mutex ownersMutex_;
    std::atomic<float> master_{0.8f};
    std::atomic<double> hostBpm_{ 0 }; std::atomic<int> hostSig_{ 404 };
    std::atomic<int> list_{-2}, listB_{-2}; std::atomic<int> patch_[2] = { {-2}, {-2} };
    bool groupAllowed(int g, int layer = 0) const;
    int keyswitchList(int note) const;
    std::atomic<bool> ksChanged_{ false };
    float rnd() { rng_ = rng_ * 1664525u + 1013904223u; return (float) ((rng_ >> 8) & 0xFFFF) / 65535.f; }
    std::atomic<int> active_{0};
    Voice voices_[kMaxVoices];
    unsigned long clock_ = 0; bool sustain_ = false; bool heldNotes_[128] = {}; int noteVel_[128] = {};
    int rr_[256] = {}; uint32_t rng_ = 12345;
#ifndef VISU_NO_FILES
    std::atomic<bool> offline_{ false };
    std::unique_ptr<Streamer> streamer_;   // made on the message thread by the first library that streams, kept from then on
#endif
};

} // namespace visu
