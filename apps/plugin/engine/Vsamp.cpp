#include "Vsamp.h"
#ifndef VISU_NO_FILES
#include <fstream>
#include <cstdio>
#ifdef _WIN32
#ifndef NOMINMAX
#define NOMINMAX
#endif
#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#endif
#endif
#include <algorithm>
#include "Inflate.h"
#include <cstring>

namespace visu {

#ifndef VISU_NO_FILES
#ifdef _WIN32
static int MultiByteToWideCharShim(const std::string& s, std::wstring& w) {   // UTF-8 paths on Windows
    const int n = MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, nullptr, 0); w.assign((size_t) std::max(0, n), L'\0');
    if (n > 0) MultiByteToWideChar(CP_UTF8, 0, s.c_str(), -1, &w[0], n); if (!w.empty()) w.pop_back(); return n;
}
static long long visu_ftell(std::FILE* f) { return _ftelli64(f); }
static int visu_fseek(std::FILE* f, long long o) { return _fseeki64(f, o, SEEK_SET); }
#else
static long long visu_ftell(std::FILE* f) { return (long long) ftello(f); }
static int visu_fseek(std::FILE* f, long long o) { return fseeko(f, (off_t) o, SEEK_SET); }
#endif
#endif

/* CRC-32 (zlib's), slicing by 8: the same numbers as the byte-at-a-time version, several times faster */
struct CrcTables { uint32_t t[8][256];
    CrcTables() { for (uint32_t n = 0; n < 256; ++n) { uint32_t c = n; for (int k = 0; k < 8; ++k) c = (c & 1) ? 0xEDB88320u ^ (c >> 1) : c >> 1; t[0][n] = c; }
                  for (uint32_t n = 0; n < 256; ++n) for (int k = 1; k < 8; ++k) t[k][n] = t[0][t[k - 1][n] & 255] ^ (t[k - 1][n] >> 8); } };
static const CrcTables& crcTables() { static const CrcTables T; return T; }
uint32_t crc32(const uint8_t* d, size_t n) {
    const auto& T = crcTables().t; uint32_t c = 0xFFFFFFFFu;
    while (n >= 8) {
        const uint32_t a = c ^ ((uint32_t) d[0] | (uint32_t) d[1] << 8 | (uint32_t) d[2] << 16 | (uint32_t) d[3] << 24),
                       b = (uint32_t) d[4] | (uint32_t) d[5] << 8 | (uint32_t) d[6] << 16 | (uint32_t) d[7] << 24;
        c = T[7][a & 255] ^ T[6][(a >> 8) & 255] ^ T[5][(a >> 16) & 255] ^ T[4][a >> 24] ^ T[3][b & 255] ^ T[2][(b >> 8) & 255] ^ T[1][(b >> 16) & 255] ^ T[0][b >> 24];
        d += 8; n -= 8;
    }
    while (n--) c = T[0][(c ^ *d++) & 255] ^ (c >> 8);
    return c ^ 0xFFFFFFFFu;
}

static const uint8_t kMagic[5] = { 0x56, 0x53, 0x41, 0x4d, 0x50 };
static uint32_t rd32(const uint8_t* p) { return (uint32_t) p[0] | ((uint32_t) p[1] << 8) | ((uint32_t) p[2] << 16) | ((uint32_t) p[3] << 24); }

#ifndef VISU_NO_FILES
bool VsampFile::openFile(const std::string& path, std::string& error) {
    std::ifstream f(path, std::ios::binary | std::ios::ate);
    if (!f) { error = "Could not open the file."; return false; }
    auto sz = (size_t) f.tellg(); f.seekg(0);
    std::vector<uint8_t> b(sz);
    if (sz && !f.read((char*) b.data(), (std::streamsize) sz)) { error = "Could not read the file."; return false; }
    return openBytes(std::move(b), error);
}
#endif

#ifndef VISU_NO_FILES
static std::FILE* openRead(const std::string& path) {
#ifdef _WIN32
    std::wstring w; int n = MultiByteToWideCharShim(path, w); (void) n; return _wfopen(w.c_str(), L"rb");
#else
    return std::fopen(path.c_str(), "rb");
#endif
}
bool VsampFile::openFileLazy(const std::string& path, std::string& error, uint64_t start, uint64_t length) {
    std::FILE* f = openRead(path);
    if (!f) { error = "Could not open the file."; return false; }
    std::fseek(f, 0, SEEK_END); const long long fileLen = (long long) visu_ftell(f);
    if (start + length > (uint64_t) fileLen) { std::fclose(f); error = "An instrument runs past the end of the library file."; return false; }
    const long long total = length ? (long long) (start + length) : fileLen;   // where this (inner) file ends
    visu_fseek(f, (long long) start);
    uint8_t head[16];
    if (total - (long long) start < 16 || std::fread(head, 1, 16, f) != 16) { std::fclose(f); error = "File is too short."; return false; }
    if (memcmp(head, kMagic, 5) != 0) { std::fclose(f); error = "Not a .vsamp file (wrong header)."; return false; }
    if (head[6] > 1) { std::fclose(f); error = "This file was made by a newer version."; return false; }
    const uint32_t ml = rd32(&head[8]), mc = rd32(&head[12]);
    if (start + 16 + ml > (uint64_t) total) { std::fclose(f); error = "Manifest runs past the end of the file."; return false; }
    std::string m(ml, '\0');
    if (ml && std::fread(&m[0], 1, ml, f) != ml) { std::fclose(f); error = "Could not read the file."; return false; }
    std::fclose(f);
    if (crc32((const uint8_t*) m.data(), ml) != mc) { error = "Manifest checksum does not match."; return false; }
    try { manifest_ = Json::parse(m.data(), ml); }
    catch (const std::exception& e) { error = std::string("Manifest is not valid: ") + e.what(); return false; }
    lazy_ = true; path_ = path; manifestStr_ = std::move(m); fileSize_ = (uint64_t) total; base_ = (size_t) (start + 16 + ml); bytes_.clear();
    return true;
}
bool VsampFile::readRaw(uint64_t off, uint64_t len, uint8_t* out) const {
    if (!lazy_) { if (base_ + off + len > bytes_.size()) return false; memcpy(out, &bytes_[base_ + off], (size_t) len); return true; }
    if (base_ + off + len > fileSize_) return false;
    std::FILE* f = openRead(path_); if (!f) return false;
    const bool ok = visu_fseek(f, (long long) (base_ + off)) == 0 && std::fread(out, 1, (size_t) len, f) == (size_t) len;
    std::fclose(f); return ok;
}
#else
bool VsampFile::openFileLazy(const std::string&, std::string& error) { error = "No file access in this build."; return false; }
bool VsampFile::readRaw(uint64_t off, uint64_t len, uint8_t* out) const { if (base_ + off + len > bytes_.size()) return false; memcpy(out, &bytes_[base_ + off], (size_t) len); return true; }
#endif

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
    std::vector<uint8_t> tmp; const uint8_t* d;
    if (lazy_) { tmp.resize((size_t) r.len); if (!readRaw(r.off, r.len, tmp.data())) { error = "A data block runs past the end of the file."; return false; } d = tmp.data(); }
    else { if (base_ + r.off + r.len > bytes_.size()) { error = "A data block runs past the end of the file."; return false; } d = &bytes_[base_ + r.off]; }
    if (!r.nocrc && crc32(d, (size_t) r.len) != r.crc) { error = "A data block failed its checksum."; return false; }
    if (!r.deflate) { out.assign(d, d + r.len); return true; }
    out.resize((size_t) r.raw);
    if (!inflateRaw(d, (size_t) r.len, out.data(), out.size())) { error = "A data block could not be unpacked."; return false; }
    return true;
}

bool VsampFile::check(const BlobRef& r, std::string& error) const {
    if (lazy_) { std::vector<uint8_t> tmp; return blob(r, tmp, error); }
    if (base_ + r.off + r.len > bytes_.size()) { error = "A data block runs past the end of the file."; return false; }
    if (!r.nocrc && crc32(&bytes_[base_ + r.off], (size_t) r.len) != r.crc) { error = "A data block failed its checksum."; return false; }
    return true;
}
const uint8_t* VsampFile::rawPtr(const BlobRef& r) const {
    if (lazy_ || r.deflate || base_ + r.off + r.len > bytes_.size()) return nullptr;
    return &bytes_[base_ + r.off];
}
size_t decodePCMInto(const uint8_t* d, size_t nbytes, int chn, int bits, std::vector<float>* out, size_t at) {
    const int bps = bits == 24 ? 3 : bits == 32 ? 4 : 2;
    const size_t n = nbytes / (size_t) (bps * chn), step = (size_t) (bps * chn);
    for (int k = 0; k < chn; ++k) {   // one channel at a time, one format per loop (same numbers as before, just faster)
        float* o = out[k].data() + at; const uint8_t* p = d + (size_t) k * (size_t) bps;
        if (bits == 16) for (size_t i = 0; i < n; ++i, p += step) o[i] = (float) (int16_t) (p[0] | (p[1] << 8)) / 32768.f;
        else if (bits == 24) for (size_t i = 0; i < n; ++i, p += step) { int32_t q = (int32_t) ((uint32_t) p[0] << 8 | (uint32_t) p[1] << 16 | (uint32_t) p[2] << 24) >> 8; o[i] = (float) q / 8388608.f; }
        else for (size_t i = 0; i < n; ++i, p += step) { uint32_t u = rd32(p); memcpy(&o[i], &u, 4); }
    }
    return n;
}
void decodePCM(const uint8_t* d, size_t nbytes, int chn, int bits, std::vector<float>* out) {
    const int bps = bits == 24 ? 3 : bits == 32 ? 4 : 2;
    const size_t n = nbytes / (size_t) (bps * chn);
    for (int k = 0; k < chn; ++k) out[k].assign(n, 0.f);
    decodePCMInto(d, nbytes, chn, bits, out, 0);
}

} // namespace visu
