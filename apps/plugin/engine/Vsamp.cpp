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
bool VsampFile::openFileLazy(const std::string& path, std::string& error) {
    std::FILE* f = openRead(path);
    if (!f) { error = "Could not open the file."; return false; }
    std::fseek(f, 0, SEEK_END); const long long total = (long long) visu_ftell(f); std::fseek(f, 0, SEEK_SET);
    uint8_t head[16];
    if (total < 16 || std::fread(head, 1, 16, f) != 16) { std::fclose(f); error = "File is too short."; return false; }
    if (memcmp(head, kMagic, 5) != 0) { std::fclose(f); error = "Not a .vsamp file (wrong header)."; return false; }
    if (head[6] > 1) { std::fclose(f); error = "This file was made by a newer version."; return false; }
    const uint32_t ml = rd32(&head[8]), mc = rd32(&head[12]);
    if ((uint64_t) 16 + ml > (uint64_t) total) { std::fclose(f); error = "Manifest runs past the end of the file."; return false; }
    std::string m(ml, '\0');
    if (ml && std::fread(&m[0], 1, ml, f) != ml) { std::fclose(f); error = "Could not read the file."; return false; }
    std::fclose(f);
    if (crc32((const uint8_t*) m.data(), ml) != mc) { error = "Manifest checksum does not match."; return false; }
    try { manifest_ = Json::parse(m.data(), ml); }
    catch (const std::exception& e) { error = std::string("Manifest is not valid: ") + e.what(); return false; }
    lazy_ = true; path_ = path; manifestStr_ = std::move(m); fileSize_ = (uint64_t) total; base_ = 16 + ml; bytes_.clear();
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
