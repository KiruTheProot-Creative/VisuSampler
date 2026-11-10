// An opened .vsamp: decoded audio plus zones, groups and the library info, ready for the Engine.
#pragma once
#include "Vsamp.h"
#include "Fx.h"
#include <array>
#include <memory>
#include <string>
#include <vector>

namespace visu {

enum class Interp { Nearest, Linear, Cubic, Sinc };
enum class GroupMode { Normal, RRCycle, RRRandom, RRUnique, Release };

struct UnisonVoice { float tuneCents, pan, gain, startMs; };
std::vector<UnisonVoice> unisonVoices(const Json& uni);   // same offsets as the JS core

struct Sample {
    std::string id, name; int sr = 44100, chn = 1; size_t frames = 0;
    std::vector<float> ch[2];
    std::string mode = "sampler";      // sampler, slicer, speedkeep, granular, wavetable
    std::vector<UnisonVoice> unison;   // one entry when unison is off
    // speed-keeping (time machine): pitch without changing the length
    float skSpeed = 100, skGrainMs = 50; bool skWsola = true, skSync = false; float bars = 2;
    // granular: a cloud of grains read from the sample, played live
    float grSize = 90, grDensity = 28, grPos = 45, grSpread = 15, grJitter = 0; int grShape = 0;   // shape: 0 hann, 1 triangle, 2 rectangle
    // wavetable: single-cycle frames, the position can follow a knob (tag) or sweep
    int wtFrame = 2048, wtFrames = 1, wtTag = -1; float wtPos = 0, wtPos2 = -1, wtSweep = 2500, wtGain = 1; std::string wtTagId;
    bool supported() const { return mode == "sampler" || mode == "slicer" || mode == "speedkeep" || mode == "granular" || mode == "wavetable"; }
    // streaming (player only): ch holds only the first headFrames; the rest is read from disk while playing
    int streamSrc = -1; size_t headFrames = 0;
    std::string key;   // VisuMaker live reloads: which audio this is (see Library::loadBytes)
};

struct GroupCfg {
    std::string name; GroupMode mode = GroupMode::Normal; int choke = 0, voices = 0;
    float vol = 0, pan = 0, tune = 0, velcurve = 1; Interp interp = Interp::Linear; bool inheritInterp = true, mute = false, solo = false;
    // per-note ADSR for the whole group (replaces the zones' own attack and release when on).
    // A, D, R in ms, S 0..1. A knob (tag) can drive each one: 0..1 maps to 0..10 s (squared) and 0..100 %.
    bool envOn = false; float envA = 5, envD = 300, envS = 1, envR = 300; int envTag[4] = { -1, -1, -1, -1 }; std::string envTagId[4];
    // knobs on the group: volume (dB), pan (-100..100), tune (semitones), fine (cents). The knob moves from `from` to `to`;
    // a linked value replaces the fixed one. Volume fades with equal power, and -60 dB or lower is silent.
    struct Link { int tag = -1; std::string tagId; float from = 0, to = 0; };
    Link lVol, lPan, lTune, lFine;
    // how this group plays: 0 = like the Playing settings, 1 = poly, 2 = mono (retrigger), 3 = legato; glide in ms (mono/legato)
    int pmode = 0; float glideMs = 0;
    // a filter per note: type, cutoff (Hz), resonance 0..1, key tracking 0..1, velocity and envelope in semitones, its own ADSR.
    // cutoff and resonance can follow knobs (tag 0..1 = 20 Hz..20 kHz, 0..100 %).
    struct VFilter { bool on = false; int type = 0; float cutoff = 8000, res = 0, key = 0, vel = 0, env = 0, a = 5, d = 300, s = 0, r = 300; Link cut, reso; } vf;   // type: 0 lp12, 1 lp24, 2 hp, 3 bp, 4 notch
    // an LFO per note (starts with the note): to cutoff (semitones), pitch (cents) and volume (0..1), after a delay (ms)
    struct VLfo { bool on = false, sync = false; int shape = 0, note = 10; float rate = 5, cut = 0, pitch = 0, vol = 0, delay = 0; } vl;   // sync: the rate is a note value (index into the effects' note list) at the tempo
};

// audio a zone plays: either the sample itself, or a prepared copy (loop crossfade baked in, or reversed)
struct ZoneAudio {
    std::vector<float> own[2];
    const float* ch[2] = { nullptr, nullptr };
    long len = 0; bool loop = false; long loopS = 0, loopE = 0;
    int streamSrc = -1; long head = 0;   // streamed: frames from `head` on come from disk
    long xf = 0, le = 0; bool pp = false; int curve = 0;   // streamed loop: crossfade length, loop end in the file, ping-pong, fade curve
};

struct Zone {
    int sample = -1, group = -1, lo = 0, hi = 127, vlo = 1, vhi = 127, root = 60, seq = 0;
    float tune = 0, vol = 0, pan = 0, start = 0, vstart = 0, attack = 0, release = 80;
    int fadeLo = 0, fadeHi = 0, vfadeLo = 0, vfadeHi = 0; std::string curve = "power";
    bool rev = false, keytrack = true, oneshot = false, mute = false, solo = false, hasInterp = false; Interp interp = Interp::Linear;
    bool onRelease = false;   // plays when the key is let go (release noises), not when it is pressed
    float humTune = 0, humVol = 0, humStart = 0;   // random variation per note (cents, dB, ms)
    ZoneAudio audio; std::string id;
};

struct ListDef { std::string name; int bank = 0; std::vector<int> groups; int ks = -1; std::vector<int> slots; };   // slots: every group named in the list, in order, -1 for one without zones (patch numbers count them)   // ks: keyswitch note that picks this list (silent)

// Features this engine can play (see docs/vsamp-format.md).
const std::vector<std::string>& supportedFeatures();

// an instrument inside a .vslib: where its .vsins lies in the library file
struct InstrumentRef { std::string id, name, bank, desc; uint64_t start = 0, length = 0; };
struct LibraryInfo {
    std::string id, name, author, version, desc, tags, category, web, licence, changelog, accent;
    std::string bannerWide, bannerTile, bannerIcon;   // PNG bytes
    bool collection = false;                       // a .vslib (several instruments) rather than one instrument
    std::vector<InstrumentRef> instruments;        // a .vslib's instruments, bank by bank in the library's order
};

class Library {
public:
    // Reads and fully decodes a library. Returns null and sets `error` on failure.
    // sampleRate: the effects are prepared for it (reload the library if the host rate changes)
    static std::shared_ptr<Library> load(const std::string& path, std::string& error, double sampleRate = 48000);
    // An instrument of a .vslib (by id; empty: the first). For an instrument file (.vsins / .vsamp) the id is ignored.
    static std::shared_ptr<Library> load(const std::string& path, const std::string& instrumentId, std::string& error, double sampleRate = 48000);
    static std::shared_ptr<Library> loadBytes(std::vector<uint8_t> bytes, std::string& error, double sampleRate = 48000);
    // VisuMaker's live reloads: a sample marked "keep" carries no audio and takes it from `reuse` (the library playing now),
    // matched by its "key". A missing one fails with kKeepMiss and the Maker sends everything again. Shipped files never use this.
    static std::shared_ptr<Library> loadBytes(std::vector<uint8_t> bytes, std::string& error, double sampleRate, const Library* reuse);
    static constexpr const char* kKeepMiss = "keepMiss";
    // How much audio sits in memory, and how many samples stream from disk (shown in the player).
    size_t memoryBytes() const; int streamedSamples() const;
    static constexpr size_t kPreloadFrames = 16384;   // in memory per streamed sample, plus the furthest zone start
    // Reads only the header info and banner images (fast, for the browser).
    static bool readInfo(const std::string& path, LibraryInfo& info, std::string& error);

    LibraryInfo info;
    std::vector<Sample> samples;
    std::vector<Zone> zones;
    std::vector<GroupCfg> groups;
    std::array<std::vector<int>, 128> byNote;   // zone indexes that cover each key
    std::vector<ListDef> lists;           // empty: every group plays
    int defaultList = -1;                 // the list the library was saved with
    // layers: A is the list chosen above; B (when the library has it) is a second list that plays at the same time.
    // Each layer has its own envelope and knob links (same fields as a group: env*, lVol/lPan/lTune/lFine), applied on top of the groups.
    bool layerB = false; int defaultListB = -1;
    // patch mode "group": a list is a folder of groups and each group in it is one patch (one plays per layer).
    // "list" (older libraries): a list is the patch and all its groups play together.
    bool groupPatches = false; int defaultPatch[2] = { 0, 1 };
    std::vector<int> allSlots;            // patch numbers when there are no lists: the project's groups in order
    GroupCfg layers[2];
    Interp projectInterp = Interp::Linear;
    // how the library plays (project.play): mono / legato / glide, pitch-bend range, voice limit and stealing
    bool anyOwnMode = false;              // some group plays its own way (poly / mono / legato)
    struct Play { bool mono = false, legato = false, quietest = false; float glideMs = 0, bend = 2; int maxVoices = 0; } play;
    std::vector<std::string> features;    // what the file says it uses
    // for drawing the library's own interface in the plugin window
    struct Blob { std::string mime, name; int w = 0, h = 0; std::string data; };
    std::string manifestText;
    std::vector<std::pair<std::string, Blob>> assets, fonts;
    std::vector<std::string> unsupported; // the ones this engine cannot play yet
    bool anySolo = false, anyZoneSolo = false; int unsupportedZones = 0; double bpm = 120; int sigN = 4, sigD = 4;
    // knobs, buttons and other tags of the library's interface: effects follow them
    std::vector<fx::TagDef> tags;
    std::unique_ptr<std::atomic<float>[]> tagValues;
    bool setTag(const std::string& name, float value) const;
    std::unique_ptr<fx::System> fx;       // the library's effect chains (state changes while playing)
    double sampleRate = 48000;
    // NodeFX: a "library" that is only an effect chain. json: {"graph":{nodes,cables}, "fxRanges":{...}, "tags":[...]}
    // (the master chain, ranges and tags in VisuMaker's formats). The chain runs on whatever is written into
    // fx->groupIn(-1) (the master input).
    static std::shared_ptr<Library> fromFx(const std::string& json, std::string& error, double sampleRate = 48000);
    static std::shared_ptr<Library> fromFx(const Json& in, std::string& error, double sampleRate = 48000);
private:
    static void readTags(const Json& tj, Library& L);
    static std::shared_ptr<Library> fromFile(const VsampFile& f, std::string& error, double sampleRate, const Library* reuse = nullptr);
};

} // namespace visu
