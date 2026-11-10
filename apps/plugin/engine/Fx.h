// FX graphs for the engine: one graph per sample group plus the master graph, connected by sends and returns.
// Graphs, modules and parameter rules match VisuMaker's Effects tab (apps/maker/src/parts/p300-p330).
// Audio is processed in blocks of kBlock frames. Everything is allocated when the library loads, never while playing.
#pragma once
#include "Json.h"
#include <atomic>
#include <memory>
#include <string>
#include <vector>

namespace visu {
class Library;
namespace fx {

constexpr int kBlock = 64;
constexpr int kBuses = 4;

struct Stereo { float l[kBlock], r[kBlock]; void clear(int n); void add(const Stereo& o, int n, float g = 1.f); };

// Values the modulators and tag links read. Written by the engine (audio thread) and the UI (tags).
struct Control {
    double sampleRate = 44100, time = 0;           // seconds since the engine started
    double bpm = 120; int sigN = 4, sigD = 4;
    float vel = 0, key = 60, mod = 0, expr = 1, at = 0, bend = .5f;
    bool gate = false; double tOn = -1, tOff = -1; float lvlOn = 0;
    const std::atomic<float>* tags = nullptr; int numTags = 0;
};

struct TagDef { std::string id, name, kind, basis; int steps = 0; float def = 0; };

double noteBeats(int i, int sigN, int sigD);   // note value i of the tempo-sync list, in quarter notes

class Module;
struct Node;

// One graph (a group chain or the master chain).
class Graph {
public:
    ~Graph();
    Stereo input;                       // what flows in from the voices (group) or from the groups (master)
    Stereo output;
    bool empty() const;
    std::vector<std::unique_ptr<Node>> nodes;
    std::vector<int> order;             // processing order (back edges read the previous block)
    mutable std::vector<int> latAt, latPos;   // scratch for System::latency (sized when built: nothing allocated while playing)
    std::string warn;
};

class System {
public:
    // Builds every graph from the manifest. Unknown modules pass sound through and are listed in `unsupported`.
    static std::unique_ptr<System> build(const Json& manifest, const Library& lib, const std::vector<TagDef>& tags,
                                         const std::vector<std::string>& groupNames, std::vector<std::string>& unsupported);
    ~System();
    void prepare(double sampleRate);
    // groupIn(g): where voices of group g write; groups without a chain write straight into the master input.
    Stereo& groupIn(int g);
    // runs every group chain, then the master chain; result in master().output
    void process(int n, Control& c);
    const Stereo& out() const { return master_->output; }
    // a parameter moved in VisuMaker's effects view: changes it without rebuilding anything (raw value, or the note
    // position 0..1 of a tempo-synced parameter when `syncPos`). Returns false when there is no such node or parameter.
    bool setParam(const std::string& nodeId, const std::string& key, float value, bool syncPos);
    bool hasAny() const { return any_; }
    // samples of lookahead delay on the way through the master chain (a brick-wall limiter, for example)
    int latency() const;
private:
    std::vector<std::unique_ptr<Graph>> groups_;   // index = group index; null = no chain
    std::unique_ptr<Graph> master_;
    Stereo buses_[kBuses];
    std::vector<TagDef> tags_;
    bool any_ = false;
};

const std::vector<std::string>& supportedModules();

} // namespace fx
} // namespace visu
