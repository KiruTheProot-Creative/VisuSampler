// Raw DEFLATE (RFC 1951) decoder, based on the public-domain "puff" design. Keeps the engine free of zlib.
#pragma once
#include <cstddef>
#include <cstdint>
namespace visu {
// Returns true when `in` unpacks to exactly `outLen` bytes.
bool inflateRaw(const uint8_t* in, size_t inLen, uint8_t* out, size_t outLen);
}
