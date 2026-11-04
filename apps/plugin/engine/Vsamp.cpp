#include "Vsamp.h"
#include <fstream>
#include "Inflate.h"
#include <cstring>

namespace visu {

static const uint32_t* crcTable() {
    static uint32_t t[256]; static bool init = false;
    if (!init) { for (uint32_t n = 0; n < 256; ++n) { uint32_t c = n; for (int k = 0; k < 8; ++k) c = (c & 1) ? 0xEDB88320u ^ (c >> 1) : c >> 1; t[n] = c; } init = true; }
    return t;
}
uint32_t crc32(const uint8_t* d, size_t n) {
    const uint32_t* t = crcTable(); uint32_t c = 0xFFFFFFFFu;
    for (size_t i = 0; i < n; ++i) c = t[(c ^ d[i]) & 255] ^ (c >> 8);
    return c ^ 0xFFFFFFFFu;
}

static const uint8_t kMagic[5] = { 0x56, 0x53, 0x41, 0x4d, 0x50 };
static uint32_t rd32(const uint8_t* p) { return (uint32_t) p[0] | ((uint32_t) p[1] << 8) | ((uint32_t) p[2] << 16) | ((uint32_t) p[3] << 24); }

bool VsampFile::openFile(const std::string& path, std::string& error) {
    std::ifstream f(path, std::ios::binary | std::ios::ate);
    if (!f) { error = "Could not open the file."; return false; }
    auto sz = (size_t) f.tellg(); f.seekg(0);
    std::vector<uint8_t> b(sz);
    if (sz && !f.read((char*) b.data(), (std::streamsize) sz)) { error = "Could not read the file."; return false; }
    return openBytes(std::move(b), error);
}

bool VsampFile::openBytes(std::vector<uint8_t> bytes, std::string& error) {
    bytes_ = std::move(bytes);
    if (bytes_.size() < 16) { error = "File is too short."; return false; }
    if (memcmp(bytes_.data(), kMagic, 5) != 0) { error = "Not a .vsamp file (wrong header)."; return false; }
    if (bytes_[6] > 1) { error = "This file was made by a newer version."; return false; }
    uint32_t ml = rd32(&bytes_[8]), mc = rd32(&bytes_[12]);
    if ((uint64_t) 16 + ml > bytes_.size()) { error = "Manifest runs past the end of the file."; return false; }
    if (crc32(&bytes_[16], ml) != mc) { error = "Manifest checksum does not match."; return false; }
    try { manifest_ = Json::parse((const char*) &bytes_[16], ml); }
    catch (const std::exception& e) { error = std::string("Manifest is not valid: ") + e.what(); return false; }
    base_ = 16 + ml;
    return true;
}

BlobRef VsampFile::ref(const Json& j) {
    BlobRef r; r.off = (uint64_t) j["off"].num(); r.len = (uint64_t) j["len"].num(); r.raw = (uint64_t) j["raw"].num();
    r.crc = (uint32_t) j["crc"].num(); r.deflate = j["enc"].str() == "deflate"; return r;
}

bool VsampFile::blob(const BlobRef& r, std::vector<uint8_t>& out, std::string& error) const {
    if (base_ + r.off + r.len > bytes_.size()) { error = "A data block runs past the end of the file."; return false; }
    const uint8_t* d = &bytes_[base_ + r.off];
    if (crc32(d, (size_t) r.len) != r.crc) { error = "A data block failed its checksum."; return false; }
    if (!r.deflate) { out.assign(d, d + r.len); return true; }
    out.resize((size_t) r.raw);
    if (!inflateRaw(d, (size_t) r.len, out.data(), out.size())) { error = "A data block could not be unpacked."; return false; }
    return true;
}

void decodePCM(const uint8_t* d, size_t nbytes, int chn, int bits, std::vector<float>* out) {
    int bps = bits == 24 ? 3 : bits == 32 ? 4 : 2;
    size_t n = nbytes / (size_t) (bps * chn);
    for (int k = 0; k < chn; ++k) out[k].assign(n, 0.f);
    for (size_t i = 0; i < n; ++i) for (int k = 0; k < chn; ++k) {
        const uint8_t* p = d + (i * (size_t) chn + (size_t) k) * (size_t) bps; float v;
        if (bits == 16) v = (float) (int16_t) (p[0] | (p[1] << 8)) / 32768.f;
        else if (bits == 24) { int32_t q = (int32_t) ((uint32_t) p[0] << 8 | (uint32_t) p[1] << 16 | (uint32_t) p[2] << 24) >> 8; v = (float) q / 8388608.f; }
        else { uint32_t u = rd32(p); memcpy(&v, &u, 4); }
        out[k][i] = v;
    }
}

} // namespace visu
