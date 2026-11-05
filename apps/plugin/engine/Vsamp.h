// .vsamp container reader (see docs/vsamp-format.md)
#pragma once
#include "Json.h"
#include <cstdint>
#include <string>
#include <vector>

namespace visu {

struct BlobRef { uint64_t off = 0, len = 0, raw = 0; uint32_t crc = 0; bool deflate = false; };

uint32_t crc32(const uint8_t* d, size_t n);

class VsampFile {
public:
    // Reads the whole file. Returns false and fills `error` on any problem (bad header, checksum, JSON).
    bool openFile(const std::string& path, std::string& error);
    bool openBytes(std::vector<uint8_t> bytes, std::string& error);

    const Json& manifest() const { return manifest_; }
    std::string manifestText() const { return std::string((const char*) bytes_.data() + 16, base_ > 16 ? base_ - 16 : 0); }
    static BlobRef ref(const Json& j);
    // Checks the blob CRC, unpacks if compressed. Returns false with `error` set on failure.
    bool blob(const BlobRef& r, std::vector<uint8_t>& out, std::string& error) const;
    size_t sizeBytes() const { return bytes_.size(); }

private:
    std::vector<uint8_t> bytes_;
    size_t base_ = 0;
    Json manifest_;
};

// interleaved little endian PCM (16, 24 or 32 = float) to per-channel floats
void decodePCM(const uint8_t* d, size_t nbytes, int chn, int bits, std::vector<float>* out);

} // namespace visu
