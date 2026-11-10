// NodeFX: VisuSampler's effect chains on live audio. A rack is one master chain (VisuMaker's node format) with its
// macro tags, built off the audio thread and then processed in place on the host's stereo buffers.
#pragma once
#include "Library.h"
#include <memory>
#include <string>

namespace visu {

class FxRack {
public:
    // json: {"graph":{nodes,cables}, "fxRanges":{...}, "tags":[{id,name,kind,def},...]}; null and `error` on failure
    static std::shared_ptr<FxRack> build(const std::string& json, double sampleRate, std::string& error);
    // the host's audio, changed in place (any block size)
    void process(float* left, float* right, int n);
    void setTempo(double bpm, int sigN, int sigD) { c_.bpm = bpm > 0 ? bpm : 120; c_.sigN = sigN > 0 ? sigN : 4; c_.sigD = sigD > 0 ? sigD : 4; }
    // a macro (tag) by index, 0..1; safe from any thread
    void setTag(int index, float v) { if (index >= 0 && index < (int) lib_->tags.size()) lib_->tagValues[(size_t) index].store(v < 0 ? 0 : v > 1 ? 1 : v); }
    float tag(int index) const { return index >= 0 && index < (int) lib_->tags.size() ? lib_->tagValues[(size_t) index].load() : 0.f; }
    int tagIndex(const std::string& idOrName) const;
    int numTags() const { return (int) lib_->tags.size(); }
    // a parameter moved in the editor (audio thread only: queue it from the UI); false = no such node or parameter
    bool setParam(const std::string& nodeId, const std::string& key, float value, bool syncPos) { return lib_->fx->setParam(nodeId, key, value, syncPos); }
    const std::vector<std::string>& unsupported() const { return lib_->unsupported; }
    bool empty() const { return !lib_->fx->hasAny(); }
private:
    std::shared_ptr<Library> lib_;
    fx::Control c_;
};

} // namespace visu
