#include "Inflate.h"
#include <cstring>

namespace visu {
namespace {
constexpr int MAXBITS = 15, MAXLCODES = 286, MAXDCODES = 30, FIXLCODES = 288;
struct S { const uint8_t* in; size_t inLen, inPos; uint8_t* out; size_t outLen, outPos; int bitBuf, bitCnt; bool err; };
struct Huff { short count[MAXBITS + 1]; short symbol[FIXLCODES]; };

int bits(S& s, int need) {
    long val = s.bitBuf;
    while (s.bitCnt < need) {
        if (s.inPos >= s.inLen) { s.err = true; return 0; }
        val |= (long) s.in[s.inPos++] << s.bitCnt; s.bitCnt += 8;
    }
    s.bitBuf = (int) (val >> need); s.bitCnt -= need;
    return (int) (val & ((1L << need) - 1));
}
int decode(S& s, const Huff& h) {
    int code = 0, first = 0, index = 0;
    for (int len = 1; len <= MAXBITS; ++len) {
        code |= bits(s, 1); if (s.err) return -1;
        int count = h.count[len];
        if (code - count < first) return h.symbol[index + (code - first)];
        index += count; first += count; first <<= 1; code <<= 1;
    }
    return -1;
}
int construct(Huff& h, const short* length, int n) {
    for (int l = 0; l <= MAXBITS; ++l) h.count[l] = 0;
    for (int i = 0; i < n; ++i) h.count[length[i]]++;
    if (h.count[0] == n) return 0;
    int left = 1;
    for (int l = 1; l <= MAXBITS; ++l) { left <<= 1; left -= h.count[l]; if (left < 0) return left; }
    short offs[MAXBITS + 1]; offs[1] = 0;
    for (int l = 1; l < MAXBITS; ++l) offs[l + 1] = (short) (offs[l] + h.count[l]);
    for (int i = 0; i < n; ++i) if (length[i] != 0) h.symbol[offs[length[i]]++] = (short) i;
    return left;
}
bool codes(S& s, const Huff& lencode, const Huff& distcode) {
    static const short lens[29] = { 3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258 };
    static const short lext[29] = { 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0 };
    static const short dists[30] = { 1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577 };
    static const short dext[30] = { 0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13 };
    int symbol;
    do {
        symbol = decode(s, lencode); if (symbol < 0) return false;
        if (symbol < 256) { if (s.outPos >= s.outLen) return false; s.out[s.outPos++] = (uint8_t) symbol; }
        else if (symbol > 256) {
            symbol -= 257; if (symbol >= 29) return false;
            int len = lens[symbol] + bits(s, lext[symbol]); int ds = decode(s, distcode); if (ds < 0) return false;
            size_t dist = (size_t) dists[ds] + (size_t) bits(s, dext[ds]); if (s.err) return false;
            if (dist > s.outPos || s.outPos + (size_t) len > s.outLen) return false;
            while (len--) { s.out[s.outPos] = s.out[s.outPos - dist]; ++s.outPos; }
        }
    } while (symbol != 256);
    return true;
}
bool fixed(S& s) {
    static bool built = false; static Huff lc, dc;
    if (!built) {
        short lengths[FIXLCODES]; int sy = 0;
        for (; sy < 144; ++sy) lengths[sy] = 8;
        for (; sy < 256; ++sy) lengths[sy] = 9;
        for (; sy < 280; ++sy) lengths[sy] = 7;
        for (; sy < FIXLCODES; ++sy) lengths[sy] = 8;
        construct(lc, lengths, FIXLCODES);
        for (sy = 0; sy < MAXDCODES; ++sy) lengths[sy] = 5;
        construct(dc, lengths, MAXDCODES);
        built = true;
    }
    return codes(s, lc, dc);
}
bool dynamic(S& s) {
    static const short order[19] = { 16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15 };
    int nlen = bits(s, 5) + 257, ndist = bits(s, 5) + 1, ncode = bits(s, 4) + 4; if (s.err || nlen > MAXLCODES || ndist > MAXDCODES) return false;
    short lengths[MAXLCODES + MAXDCODES]; int idx;
    for (idx = 0; idx < ncode; ++idx) lengths[order[idx]] = (short) bits(s, 3);
    for (; idx < 19; ++idx) lengths[order[idx]] = 0;
    Huff lencode, distcode;
    if (construct(lencode, lengths, 19) != 0) return false;
    idx = 0;
    while (idx < nlen + ndist) {
        int symbol = decode(s, lencode); if (symbol < 0) return false;
        if (symbol < 16) lengths[idx++] = (short) symbol;
        else {
            int len = 0, rep;
            if (symbol == 16) { if (idx == 0) return false; len = lengths[idx - 1]; rep = 3 + bits(s, 2); }
            else if (symbol == 17) rep = 3 + bits(s, 3); else rep = 11 + bits(s, 7);
            if (idx + rep > nlen + ndist) return false;
            while (rep--) lengths[idx++] = (short) len;
        }
    }
    if (lengths[256] == 0) return false;
    int err = construct(lencode, lengths, nlen); if (err && (err < 0 || nlen != lencode.count[0] + lencode.count[1])) return false;
    err = construct(distcode, lengths + nlen, ndist); if (err && (err < 0 || ndist != distcode.count[0] + distcode.count[1])) return false;
    return codes(s, lencode, distcode);
}
} // namespace

bool inflateRaw(const uint8_t* in, size_t inLen, uint8_t* out, size_t outLen) {
    S s{ in, inLen, 0, out, outLen, 0, 0, 0, false };
    int last;
    do {
        last = bits(s, 1); int type = bits(s, 2); if (s.err) return false;
        if (type == 0) {
            s.bitBuf = 0; s.bitCnt = 0;
            if (s.inPos + 4 > s.inLen) return false;
            unsigned len = s.in[s.inPos] | (s.in[s.inPos + 1] << 8), nlen = s.in[s.inPos + 2] | (s.in[s.inPos + 3] << 8); s.inPos += 4;
            if (len != (~nlen & 0xFFFF) || s.inPos + len > s.inLen || s.outPos + len > s.outLen) return false;
            memcpy(s.out + s.outPos, s.in + s.inPos, len); s.inPos += len; s.outPos += len;
        } else if (type == 1) { if (!fixed(s)) return false; }
        else if (type == 2) { if (!dynamic(s)) return false; }
        else return false;
    } while (!last);
    return s.outPos == outLen;
}
} // namespace visu
