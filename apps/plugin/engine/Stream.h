// Streams long samples from disk while they play (VisuPlayer). The start of each sample stays in memory (the "head");
// a background thread reads the rest into a small ring per playing voice. The audio thread never waits, locks or reads a file:
// if the disk falls behind, the voice plays silence for that moment and the miss is counted.
// Not compiled into the WebAssembly build (VISU_NO_FILES): there everything is in memory.
#pragma once
#include "Vsamp.h"
#include <atomic>
#include <cstdint>
#include <memory>
#include <string>
#include <thread>
#include <vector>

namespace visu {

// Where a sample's audio lives: chunks that each unpack on their own (or one raw block split into virtual chunks).
struct StreamSource {
    std::string path; uint64_t base = 0;            // file and the offset where blob offsets start
    std::vector<BlobRef> chunks; int chunkFrames = 32768; int chn = 1, bits = 16; uint64_t frames = 0;
};
// A loop the disk thread unrolls while streaming: the voice reads a timeline that keeps going, and frame k of it is
// frame k of the prepared loop (crossfade at the loop end, ping-pong mirrored), same rules as Library's prepareAudio.
struct StreamLoop { bool on = false, pp = false; int64_t ls = 0, le = 0, outLen = 0, x = 0; int curve = 0; };   // curve: 0 power, 1 linear, 2 s
// Sources are registered once (message thread) and never freed, so the disk thread can always use them.
int registerStreamSource(StreamSource src);
bool decodeChunk(const StreamSource& s, std::FILE* f, size_t k, std::vector<float>* out, int keepCh);   // per-channel floats

class Streamer {
public:
    static constexpr int kSlots = 64, kRing = 32768;   // frames per voice ring (power of two)
    Streamer();
    ~Streamer();
    // audio thread
    int open(int source, int64_t fromFrame, const StreamLoop* loop = nullptr);   // a slot, or -1 when all are busy
    void close(int slot);
    void setRead(int slot, int64_t frame) { if (slot >= 0) slots_[(size_t) slot].readPos.store(frame, std::memory_order_release); }
    inline float at(int slot, int c, int64_t i) const {
        const Slot& s = slots_[(size_t) slot]; const int64_t f = s.filled.load(std::memory_order_acquire);
        if (i >= f || i < s.start) { if (i >= f) misses_.fetch_add(1, std::memory_order_relaxed); return 0.f; }
        return s.ring[c][(size_t) (i & (kRing - 1))];
    }
    int busy() const;
    long misses() const { return misses_.load(); }
private:
    enum { Free = 0, Request = 1, Run = 2, Freeing = 3 };
    struct Slot {
        std::atomic<int> state{ Free }; int source = -1; int64_t start = 0;
        std::atomic<int64_t> filled{ 0 }, readPos{ 0 };
        std::vector<float> ring[2];
        StreamLoop loop;                               // written before the slot is handed to the disk thread
        StreamSource src; int64_t next = 0;           // disk thread only
    };
    void run();
    bool fill(Slot& s);
    bool fillLoop(Slot& s);
    std::unique_ptr<Slot[]> slots_;
    std::atomic<bool> running_{ true };
    mutable std::atomic<long> misses_{ 0 };
    std::thread thread_;
};

} // namespace visu
