#include "Stream.h"
#include "Inflate.h"
#include <algorithm>
#include <chrono>
#include <cstdio>
#include <cstring>
#include <list>
#include <map>
#include <mutex>
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#endif

namespace visu {

static std::mutex& regMutex() { static std::mutex m; return m; }
static std::vector<std::unique_ptr<StreamSource>>& registry() { static std::vector<std::unique_ptr<StreamSource>> r; return r; }

int registerStreamSource(StreamSource src) {
    std::lock_guard<std::mutex> g(regMutex());
    auto& r = registry();
    // the same sample of the same file (a reload) reuses its entry
    for (size_t i = 0; i < r.size(); ++i)
        if (r[i]->path == src.path && r[i]->base == src.base && !r[i]->chunks.empty() && !src.chunks.empty() && r[i]->chunks[0].off == src.chunks[0].off && r[i]->frames == src.frames) return (int) i;
    r.push_back(std::make_unique<StreamSource>(std::move(src)));
    return (int) r.size() - 1;
}
static bool sourceCopy(int id, StreamSource& out) {
    std::lock_guard<std::mutex> g(regMutex());
    if (id < 0 || id >= (int) registry().size()) return false;
    out = *registry()[(size_t) id]; return true;
}

static std::FILE* openFile(const std::string& path) {
#ifdef _WIN32
    const int n = MultiByteToWideChar(CP_UTF8, 0, path.c_str(), -1, nullptr, 0); std::wstring w((size_t) (n > 0 ? n : 1), L'\0');
    if (n > 0) MultiByteToWideChar(CP_UTF8, 0, path.c_str(), -1, &w[0], n);
    return _wfopen(w.c_str(), L"rb");
#else
    return std::fopen(path.c_str(), "rb");
#endif
}
static int seekTo(std::FILE* f, uint64_t o) {
#ifdef _WIN32
    return _fseeki64(f, (long long) o, SEEK_SET);
#else
    return fseeko(f, (off_t) o, SEEK_SET);
#endif
}

bool decodeChunk(const StreamSource& s, std::FILE* f, size_t k, std::vector<float>* out, int keepCh) {
    if (k >= s.chunks.size() || !f) return false;
    const BlobRef& r = s.chunks[k];
    std::vector<uint8_t> raw((size_t) r.len), pcm;
    if (seekTo(f, s.base + r.off) != 0 || std::fread(raw.data(), 1, raw.size(), f) != raw.size()) return false;
    if (r.deflate) { pcm.resize((size_t) r.raw); if (!inflateRaw(raw.data(), raw.size(), pcm.data(), pcm.size())) return false; } else pcm.swap(raw);
    std::vector<float> all[8]; if (s.chn > 8) return false;
    decodePCM(pcm.data(), pcm.size(), s.chn, s.bits, all);
    for (int c = 0; c < keepCh; ++c) out[c].swap(all[std::min(c, s.chn - 1)]);
    return true;
}

Streamer::Streamer() : slots_(new Slot[kSlots]) {
    for (int i = 0; i < kSlots; ++i) for (auto& r : slots_[(size_t) i].ring) r.assign((size_t) kRing, 0.f);
    thread_ = std::thread([this] { run(); });
}
Streamer::~Streamer() { running_ = false; if (thread_.joinable()) thread_.join(); }

int Streamer::open(int source, int64_t fromFrame) {
    for (int i = 0; i < kSlots; ++i) {
        Slot& s = slots_[(size_t) i];
        if (s.state.load(std::memory_order_acquire) != Free) continue;
        s.source = source; s.start = fromFrame;
        s.filled.store(fromFrame, std::memory_order_relaxed); s.readPos.store(fromFrame, std::memory_order_relaxed);
        s.state.store(Request, std::memory_order_release);
        return i;
    }
    return -1;
}
void Streamer::close(int slot) {
    if (slot < 0) return; Slot& s = slots_[(size_t) slot];
    int st = s.state.load(std::memory_order_acquire);
    while ((st == Request || st == Run) && !s.state.compare_exchange_weak(st, Freeing, std::memory_order_acq_rel)) {}
}
int Streamer::busy() const { int n = 0; for (int i = 0; i < kSlots; ++i) if (slots_[(size_t) i].state.load() != Free) ++n; return n; }

/* ---- disk thread ---- */
namespace {
struct ChunkCache {   // decoded chunks, shared by voices playing the same sample
    struct E { int src; size_t k; std::vector<float> ch[2]; };
    std::list<E> lru; std::map<std::string, std::FILE*> files;
    ~ChunkCache() { for (auto& f : files) if (f.second) std::fclose(f.second); }
    const E* get(int srcId, const StreamSource& s, size_t k) {
        for (auto it = lru.begin(); it != lru.end(); ++it) if (it->src == srcId && it->k == k) { lru.splice(lru.begin(), lru, it); return &lru.front(); }
        std::FILE*& f = files[s.path]; if (!f) f = openFile(s.path); if (!f) return nullptr;
        E e; e.src = srcId; e.k = k; const int keep = std::min(2, s.chn);
        if (!decodeChunk(s, f, k, e.ch, keep)) return nullptr;
        if (keep == 1) e.ch[1] = e.ch[0];
        lru.push_front(std::move(e)); if (lru.size() > 48) lru.pop_back();
        return &lru.front();
    }
};
thread_local ChunkCache* tCache = nullptr;
}

bool Streamer::fill(Slot& s) {
    const int64_t f = s.filled.load(std::memory_order_relaxed), r = s.readPos.load(std::memory_order_acquire);
    const int64_t room = r + kRing - 512 - f, end = (int64_t) s.src.frames;
    if (room < 1024 || f >= end) return false;
    const int64_t n = std::min<int64_t>(std::min<int64_t>(room, 8192), end - f);
    const size_t cf = (size_t) std::max(1, s.src.chunkFrames);
    int64_t done = 0;
    while (done < n) {
        const int64_t i = f + done; const size_t k = (size_t) i / cf, off = (size_t) i % cf;
        const auto* e = tCache->get(s.source, s.src, k);
        if (!e || off >= e->ch[0].size()) { done = n; break; }   // unreadable: give up on this part (plays silence)
        const int64_t take = std::min<int64_t>(n - done, (int64_t) (e->ch[0].size() - off));
        for (int c = 0; c < 2; ++c) { const float* src = e->ch[c].data() + off; float* ring = s.ring[c].data();
            for (int64_t j = 0; j < take; ++j) ring[(size_t) ((i + j) & (kRing - 1))] = src[j]; }
        done += take;
    }
    s.filled.store(f + n, std::memory_order_release);
    return true;
}

void Streamer::run() {
    ChunkCache cache; tCache = &cache;
    while (running_.load()) {
        bool busy = false;
        for (int i = 0; i < kSlots; ++i) {
            Slot& s = slots_[(size_t) i]; int st = s.state.load(std::memory_order_acquire);
            if (st == Request) {
                if (!sourceCopy(s.source, s.src)) s.src.frames = 0;
                int exp = Request; s.state.compare_exchange_strong(exp, Run, std::memory_order_acq_rel); busy = true;
            } else if (st == Run) { if (fill(s)) busy = true; }
            else if (st == Freeing) { s.state.store(Free, std::memory_order_release); }
        }
        if (!busy) std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    tCache = nullptr;
}

} // namespace visu
