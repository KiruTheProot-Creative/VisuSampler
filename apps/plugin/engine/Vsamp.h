// .vsamp container reader (see docs/vsamp-format.md)
#pragma once
#include "Json.h"
#include <cstdint>
#include <string>
#include <vector>

namespace visu {

struct BlobRef { uint64_t off = 0, len = 0, raw = 0; uint32_t crc = 0; bool deflate = false, nocrc = false; };   // nocrc: a slice of a bigger block (its CRC covers the whole block)

uint32_t crc32(const uint8_t* d, size_t n);

class VsampFile {
public:
    // Reads the whole file. Returns false and fills `error` on any problem (bad header, checksum, JSON).
    bool openFile(const std::string& path, std::string& error);
    // Reads only the header and the manifest; blobs are read from the file when asked for (used by the player, which streams audio).
    bool openFileLazy(const std::string& path, std::string& error);
    bool lazy() const { return lazy_; }
    const std::string& path() const { return path_; }
    uint64_t base() const { return base_; }   // file offset where blob offsets start
    // reads raw bytes of a blob without unpacking or checking (streaming); false if out of range
    bool readRaw(uint64_t off, uint64_t len, uint8_t* out) const;
    bool openBytes(std::vector<uint8_t> bytes, std::string& error);

    const Json& manifest() const { return manifest_; }
    std::string manifestText() const { return lazy_ ? manifestStr_ : std::string((const char*) bytes_.data() + 16, base_ > 16 ? base_ - 16 : 0); }
    static BlobRef ref(const Json& j);
    // Checks the blob CRC, unpacks if compressed. Returns false with `error` set on failure.
    bool blob(const BlobRef& r, std::vector<uint8_t>& out, std::string& error) const;
    size_t sizeBytes() const { return lazy_ ? (size_t) fileSize_ : bytes_.size(); }

private:
    std::vector<uint8_t> bytes_;
    size_t base_ = 0;
    bool lazy_ = false; std::string path_, manifestStr_; uint64_t fileSize_ = 0;
    Json manifest_;
};

// interleaved little endian PCM (16, 24 or 32 = float) to per-channel floats
void decodePCM(const uint8_t* d, size_t nbytes, int chn, int bits, std::vector<float>* out);

} // namespace visu
