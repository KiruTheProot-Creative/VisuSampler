// VisuMaker's native audio: the same engine as the VST, driven by VisuMaker over a pipe.
// The protocol is the AudioWorklet's (packages/engine-wasm/src/worklet.js), one JSON object per line:
//   in:  {t:'load',path} {t:'on',n,v} {t:'off',n} {t:'sustain',d} {t:'alloff'} {t:'list',i} {t:'listB',i} {t:'patch',l,i}
//        {t:'gain',g} {t:'tag',name,v} {t:'cc',cc,v} {t:'bend',v} {t:'unload'} {t:'scope',on} {t:'fxp',n,k,v,ps}
//        device commands ({t:'devices'}, {t:'setDevice',...}) go to the host (the JUCE app), not here
//   out: {t:'loaded',error,zones,unsupportedZones} {t:'voices',n} {t:'scope',d,sr} {t:'error',error}
// Notes and knobs are queued and applied by the audio thread at the start of each block (the engine is single-threaded);
// loading a library happens on the command thread and the engine adopts it on its own.
#pragma once
#include "Engine.h"
#include "Json.h"
#include <atomic>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

namespace visu {

class HelperCore {
public:
    std::function<void(const std::string&)> send;   // one line of JSON out (thread-safe callers: command thread and tick)
    HelperCore();
    // command thread
    void command(const std::string& line);
    void reload();                                   // load the last library again (after the sample rate changed)
    // audio thread
    void prepare(double sampleRate, int maxBlock);
    void render(float* L, float* R, int n);
    // a timer, ~30 times a second: voice count and scope pictures
    void tick();
    double sampleRate() const { return sr_.load(); }
private:
    struct Ev { int t; int a; float f; };
    void apply(const Ev& e);
    Engine engine_;
    std::shared_ptr<Library> lib_;
    std::string path_;
    std::mutex qm_; std::vector<Ev> queue_, work_;
    struct FxEv { std::string node, key; float v; bool ps; }; std::vector<FxEv> fxq_, fxw_;   // effect parameters (same lock)
    std::atomic<double> sr_{ 48000 };
    std::atomic<int> voices_{ 0 }; int lastVoices_ = -1;
    std::atomic<bool> scopeOn_{ false };
    static constexpr int kScope = 4096; float scope_[kScope] = {}; std::atomic<int> scopeW_{ 0 };
    std::mutex sendM_;
public:
    void out(const std::string& s) { std::lock_guard<std::mutex> g(sendM_); if (send) send(s); }
    static std::string esc(const std::string& s);
};

} // namespace visu
