// Small JSON reader for the .vsamp manifest. No dependencies.
#pragma once
#include <string>
#include <vector>
#include <utility>
#include <cstdlib>
#include <cstring>
#include <stdexcept>

namespace visu {

struct Json {
    enum Type { Null, Bool, Num, Str, Arr, Obj } type = Null;
    double n = 0; bool b = false; std::string s;
    std::vector<Json> a; std::vector<std::pair<std::string, Json>> o;

    static const Json& null() { static const Json j; return j; }
    bool isNull() const { return type == Null; }
    bool has(const char* k) const { for (auto& p : o) if (p.first == k) return true; return false; }
    const Json& operator[](const char* k) const { for (auto& p : o) if (p.first == k) return p.second; return null(); }
    const Json& operator[](size_t i) const { return i < a.size() ? a[i] : null(); }
    size_t size() const { return type == Arr ? a.size() : o.size(); }
    double num(double def = 0) const { return type == Num ? n : (type == Bool ? (b ? 1 : 0) : def); }
    int integer(int def = 0) const { return type == Num ? (int) n : def; }
    bool boolean(bool def = false) const { return type == Bool ? b : (type == Num ? n != 0 : def); }
    std::string str(const std::string& def = "") const { return type == Str ? s : def; }

    static Json parse(const char* p, size_t len) {
        Parser ps{p, p + len};
        Json j = ps.value();
        ps.ws();
        if (ps.p != ps.e) throw std::runtime_error("trailing data in JSON");
        return j;
    }

private:
    struct Parser {
        const char* p; const char* e;
        void ws() { while (p < e && (*p == ' ' || *p == '\n' || *p == '\r' || *p == '\t')) ++p; }
        [[noreturn]] void fail(const char* m) { throw std::runtime_error(std::string("JSON: ") + m); }
        void expect(char c) { ws(); if (p >= e || *p != c) fail("unexpected character"); ++p; }
        static void utf8(std::string& out, unsigned cp) {
            if (cp < 0x80) out += (char) cp;
            else if (cp < 0x800) { out += (char) (0xC0 | (cp >> 6)); out += (char) (0x80 | (cp & 63)); }
            else if (cp < 0x10000) { out += (char) (0xE0 | (cp >> 12)); out += (char) (0x80 | ((cp >> 6) & 63)); out += (char) (0x80 | (cp & 63)); }
            else { out += (char) (0xF0 | (cp >> 18)); out += (char) (0x80 | ((cp >> 12) & 63)); out += (char) (0x80 | ((cp >> 6) & 63)); out += (char) (0x80 | (cp & 63)); }
        }
        unsigned hex4() {
            if (e - p < 4) fail("bad escape");
            unsigned v = 0;
            for (int i = 0; i < 4; ++i) {
                char c = *p++; v <<= 4;
                if (c >= '0' && c <= '9') v |= c - '0'; else if (c >= 'a' && c <= 'f') v |= c - 'a' + 10;
                else if (c >= 'A' && c <= 'F') v |= c - 'A' + 10; else fail("bad hex");
            }
            return v;
        }
        std::string str() {
            expect('"'); std::string out;
            while (true) {
                if (p >= e) fail("unterminated string");
                char c = *p++;
                if (c == '"') break;
                if (c != '\\') { out += c; continue; }
                if (p >= e) fail("bad escape");
                char x = *p++;
                switch (x) {
                    case 'n': out += '\n'; break; case 't': out += '\t'; break; case 'r': out += '\r'; break;
                    case 'b': out += '\b'; break; case 'f': out += '\f'; break;
                    case 'u': { unsigned cp = hex4();
                        if (cp >= 0xD800 && cp < 0xDC00 && e - p >= 6 && p[0] == '\\' && p[1] == 'u') { p += 2; unsigned lo = hex4(); cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00); }
                        utf8(out, cp); break; }
                    default: out += x;
                }
            }
            return out;
        }
        Json value() {
            ws(); if (p >= e) fail("unexpected end");
            Json j; char c = *p;
            if (c == '{') {
                ++p; j.type = Obj; ws();
                if (p < e && *p == '}') { ++p; return j; }
                while (true) { ws(); std::string k = str(); expect(':'); j.o.emplace_back(std::move(k), value()); ws();
                    if (p < e && *p == ',') { ++p; continue; } expect('}'); break; }
            } else if (c == '[') {
                ++p; j.type = Arr; ws();
                if (p < e && *p == ']') { ++p; return j; }
                while (true) { j.a.push_back(value()); ws(); if (p < e && *p == ',') { ++p; continue; } expect(']'); break; }
            } else if (c == '"') { j.type = Str; j.s = str(); }
            else if (!strncmp(p, "true", 4) && e - p >= 4) { p += 4; j.type = Bool; j.b = true; }
            else if (!strncmp(p, "false", 5) && e - p >= 5) { p += 5; j.type = Bool; }
            else if (!strncmp(p, "null", 4) && e - p >= 4) { p += 4; }
            else { char* endp = nullptr; j.n = std::strtod(p, &endp); if (endp == p) fail("bad value"); j.type = Num; p = endp; }
            return j;
        }
    };
};

} // namespace visu
