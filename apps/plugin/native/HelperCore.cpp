#include "HelperCore.h"
#include <cmath>
#include <cstdio>
#include <cstring>

namespace visu {

enum { EvOn, EvOff, EvSustain, EvAllOff, EvList, EvListB, EvPatch0, EvPatch1, EvGain, EvCC, EvBend };

HelperCore::HelperCore() { queue_.reserve(1024); work_.reserve(1024); engine_.prepare(48000); }

std::string HelperCore::esc(const std::string& s) {
    std::string o; o.reserve(s.size() + 8);
    for (char c : s) { if (c == '"' || c == '\\') { o += '\\'; o += c; } else if ((unsigned char) c < 0x20) { char b[8]; std::snprintf(b, sizeof b, "\\u%04x", c); o += b; } else o += c; }
    return o;
}

void HelperCore::prepare(double sampleRate, int) {
    const bool changed = std::fabs(sampleRate - sr_.load()) > .5;
    sr_.store(sampleRate); engine_.prepare(sampleRate);
    if (changed && lib_) reload();   // libraries are resampled for the device's rate when they load
}

void HelperCore::reload() {
    if (path_.empty()) return;
    std::string err; auto lib = Library::load(path_, err, sr_.load());
    if (!lib) { out("{\"t\":\"loaded\",\"error\":\"" + esc(err) + "\",\"zones\":0,\"unsupportedZones\":0}"); return; }
    lib_ = lib; engine_.setLibrary(lib);
    out("{\"t\":\"loaded\",\"error\":null,\"zones\":" + std::to_string(lib->zones.size()) + ",\"unsupportedZones\":" + std::to_string(lib->unsupportedZones)
        + ",\"memory\":" + std::to_string(lib->memoryBytes()) + ",\"streamed\":" + std::to_string(lib->streamedSamples()) + "}");
}

void HelperCore::command(const std::string& line) {
    Json m; try { m = Json::parse(line.data(), line.size()); } catch (const std::exception& e) { out(std::string("{\"t\":\"error\",\"error\":\"") + esc(e.what()) + "\"}"); return; }
    const std::string t = m["t"].str();
    auto push = [&](int type, int a, float f) { std::lock_guard<std::mutex> g(qm_); queue_.push_back({ type, a, f }); };
    if (t == "on") push(EvOn, m["n"].integer() | (std::max(1, std::min(127, m["v"].integer(100))) << 8), 0);
    else if (t == "off") push(EvOff, m["n"].integer(), 0);
    else if (t == "sustain") push(EvSustain, m["d"].boolean() ? 1 : 0, 0);
    else if (t == "alloff") push(EvAllOff, 0, 0);
    else if (t == "list") push(EvList, m["i"].integer(-1), 0);
    else if (t == "listB") push(EvListB, m["i"].integer(-3), 0);
    else if (t == "patch") push(m["l"].integer() ? EvPatch1 : EvPatch0, m["i"].integer(0), 0);
    else if (t == "gain") push(EvGain, 0, (float) m["g"].num(1));
    else if (t == "cc") push(EvCC, m["cc"].integer() | (m["v"].integer() << 8), 0);
    else if (t == "bend") push(EvBend, 0, (float) m["v"].num(.5));
    else if (t == "tag") { if (lib_) lib_->setTag(m["name"].str(), (float) m["v"].num()); }   // knob values are atomics: safe from here
    else if (t == "scope") scopeOn_.store(m["on"].boolean());
    else if (t == "load") { path_ = m["path"].str(); reload(); }
    else if (t == "unload") { engine_.setLibrary(nullptr); lib_.reset(); path_.clear(); }
}

void HelperCore::apply(const Ev& e) {
    switch (e.t) {
        case EvOn: engine_.noteOn(e.a & 255, e.a >> 8); break;
        case EvOff: engine_.noteOff(e.a); break;
        case EvSustain: engine_.sustain(e.a != 0); break;
        case EvAllOff: engine_.allNotesOff(); break;
        case EvList: engine_.setList(e.a); break;
        case EvListB: engine_.setListB(e.a); break;
        case EvPatch0: engine_.setPatch(0, e.a); break;
        case EvPatch1: engine_.setPatch(1, e.a); break;
        case EvGain: engine_.setMasterGain(e.f); break;
        case EvCC: engine_.controller(e.a & 255, e.a >> 8); break;
        case EvBend: engine_.pitchBend(e.f); break;
    }
}

void HelperCore::render(float* L, float* R, int n) {
    if (qm_.try_lock()) { work_.swap(queue_); qm_.unlock(); for (const Ev& e : work_) apply(e); work_.clear(); }   // never waits: a busy queue is taken next block
    std::memset(L, 0, sizeof(float) * (size_t) n); std::memset(R, 0, sizeof(float) * (size_t) n);
    engine_.render(L, R, n);
    voices_.store(engine_.activeVoices(), std::memory_order_relaxed);
    if (scopeOn_.load(std::memory_order_relaxed)) {
        int w = scopeW_.load(std::memory_order_relaxed);
        for (int i = 0; i < n; ++i) { scope_[w] = .5f * (L[i] + R[i]); w = (w + 1) & (kScope - 1); }
        scopeW_.store(w, std::memory_order_release);
    }
}

void HelperCore::tick() {
    const int v = voices_.load(); if (v != lastVoices_) { lastVoices_ = v; out("{\"t\":\"voices\",\"n\":" + std::to_string(v) + "}"); }
    if (scopeOn_.load()) {
        const int w = scopeW_.load(std::memory_order_acquire), n = 2048; std::string s; s.reserve(n * 8 + 64);
        s += "{\"t\":\"scope\",\"sr\":" + std::to_string((int) sr_.load()) + ",\"d\":[";
        char b[24];
        for (int i = 0; i < n; ++i) { std::snprintf(b, sizeof b, i ? ",%.4g" : "%.4g", scope_[(w - n + i + kScope) & (kScope - 1)]); s += b; }
        s += "]}"; out(s);
    }
}

} // namespace visu
