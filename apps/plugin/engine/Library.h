// An opened .vsamp: decoded audio plus zones, groups and the library info, ready for the Engine.
#pragma once
#include "Vsamp.h"
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
    std::string mode = "sampler";      // sampler, slicer play here; speedkeep, granular, wavetable are not supported yet
    std::vector<UnisonVoice> unison;   // one entry when unison is off
    bool supported() const { return mode == "sampler" || mode == "slicer"; }
};

struct GroupCfg {
    std::string name; GroupMode mode = GroupMode::Normal; int choke = 0, voices = 0;
    float vol = 0, pan = 0, tune = 0, velcurve = 1; Interp interp = Interp::Linear; bool inheritInterp = true, mute = false, solo = false;
};

// audio a zone plays: either the sample itself, or a prepared copy (loop crossfade baked in, or reversed)
struct ZoneAudio {
    std::vector<float> own[2];
    const float* ch[2] = { nullptr, nullptr };
    long len = 0; bool loop = false; long loopS = 0, loopE = 0;
};

struct Zone {
    int sample = -1, group = -1, lo = 0, hi = 127, vlo = 1, vhi = 127, root = 60, seq = 0;
    float tune = 0, vol = 0, pan = 0, start = 0, vstart = 0, attack = 0, release = 80;
    int fadeLo = 0, fadeHi = 0, vfadeLo = 0, vfadeHi = 0; std::string curve = "power";
    bool rev = false, keytrack = true, oneshot = false, mute = false, hasInterp = false; Interp interp = Interp::Linear;
    ZoneAudio audio; std::string id;
};

struct LibraryInfo {
    std::string id, name, author, version, desc, tags, category, web, licence, changelog, accent;
    std::string bannerWide, bannerTile, bannerIcon;   // PNG bytes
};

class Library {
public:
    // Reads and fully decodes a library. Returns null and sets `error` on failure.
    static std::shared_ptr<Library> load(const std::string& path, std::string& error);
    // Reads only the header info and banner images (fast, for the browser).
    static bool readInfo(const std::string& path, LibraryInfo& info, std::string& error);

    LibraryInfo info;
    std::vector<Sample> samples;
    std::vector<Zone> zones;
    std::vector<GroupCfg> groups;
    std::array<std::vector<int>, 128> byNote;   // zone indexes that cover each key
    bool anySolo = false; int unsupportedZones = 0; double bpm = 120;
};

} // namespace visu
