#include "Library.h"
#ifndef VISU_NO_FILES
#include "Stream.h"
#else
namespace visu { struct StreamSource { std::string path; uint64_t base = 0; std::vector<BlobRef> chunks; int chunkFrames = 32768; int chn = 1, bits = 16; uint64_t frames = 0; }; }
#endif
#include <algorithm>
#include <cmath>
#include <map>

namespace visu {

static double hash01(double n) { double x = std::sin(n * 127.1 + 311.7) * 43758.5453; return x - std::floor(x); }
static Interp parseInterp(const std::string& s, bool& known) {
    known = true;
    if (s == "nearest") return Interp::Nearest;
    if (s == "linear") return Interp::Linear;
    if (s == "cubic") return Interp::Cubic;
    if (s == "sinc") return Interp::Sinc;
    known = false; return Interp::Linear;
}

std::vector<UnisonVoice> unisonVoices(const Json& u) {
    std::vector<UnisonVoice> out;
    if (!u.boolean() && !u["on"].boolean()) return { { 0, 0, 1, 0 } };
    std::string mode = u["mode"].str("detune"), curve = u["curve"].str("super");
    double detune = u["detune"].num(30), spread = u["spread"].num(70), blend = u["blend"].num(60), startRand = u["startRand"].num(14);
    if (mode == "detune") {
        int n = std::max(1, (int) std::lround(u["voices"].num(5)));
        for (int i = 0; i < n; ++i) {
            double t = n == 1 ? 0 : ((double) i / (n - 1)) * 2 - 1, a = std::fabs(t);
            double d = curve == "linear" ? t * detune / 2 : (t < 0 ? -1.0 : t > 0 ? 1.0 : 0.0) * std::pow(a, 1.7) * detune / 2;
            double cw = (1 - a) * (blend / 100) + a * (1 - blend / 100) + .12;
            out.push_back({ (float) d, (float) ((i % 2 ? 1 : -1) * a * spread / 100), (float) cw, (float) (hash01(i + 3) * startRand) });
        }
    } else {
        std::vector<double> semis;
        if (mode == "octave") semis = { 0, 12, -12, 24, -24, 7 };
        else if (mode == "fifth") semis = { 0, 7, 12, 19, -12 };
        else { std::string c = u["chord"].str("0,7,12"), cur; for (char ch : c + ",") { if (ch == ',') { if (!cur.empty()) semis.push_back(atof(cur.c_str())); cur.clear(); } else cur += ch; } }
        if (semis.empty()) semis = { 0 };
        int n = std::max(1, mode == "chord" ? (int) semis.size() : (int) std::lround(u["voices"].num(5)));
        for (int i = 0; i < n; ++i) {
            double s = semis[(size_t) i % semis.size()], w = (i % 2 ? 1 : -1) * (n > 1 ? (double) i / (n - 1) : 0.0);
            out.push_back({ (float) (s * 100 + (i % 2 ? 1 : -1) * detune * .12), (float) (w * spread / 100), 1.f, (float) (hash01(i + 9) * startRand) });
        }
    }
    double sum = 0; for (auto& v : out) sum += (double) v.gain * v.gain;
    double norm = 1 / std::sqrt(sum);
    for (auto& v : out) v.gain = (float) (v.gain * norm * (out.size() > 1 ? 1.15 : 1.0));
    return out;
}

static double fadeCurve(double t, const std::string& c) { t = std::min(1.0, std::max(0.0, t)); return c == "linear" ? t : c == "s" ? t * t * (3 - 2 * t) : std::sin(t * 3.14159265358979323846 / 2); }

static void prepareAudio(Zone& z, const Sample& s, const Json& zj) {
    if (s.streamSrc >= 0) {   // streamed: the head is in memory, the rest comes from disk
        ZoneAudio& a = z.audio; const long total = (long) s.frames;
        a.len = zj["end"].num() > 0 ? std::min(total, std::max(64L, (long) std::lround(zj["end"].num() / 1000.0 * s.sr))) : total;
        a.ch[0] = s.ch[0].data(); a.ch[1] = s.chn > 1 ? s.ch[1].data() : nullptr; a.streamSrc = s.streamSrc; a.head = (long) s.headFrames; return;
    }
    long total = (long) s.frames; ZoneAudio& a = z.audio;
    long endAbs = zj["end"].num() > 0 ? std::min(total, std::max(64L, (long) std::lround(zj["end"].num() / 1000.0 * s.sr))) : total;
    const Json& L = zj["loop"];
    bool loopOn = L["on"].boolean() && !z.rev;
    long ls = (long) L["s"].num(), le = (long) L["e"].num(), xf = (long) L["xf"].num();
    if (z.rev) {                                    // reversed copy of [start, end)
        long st = std::min(total - 2, std::max(0L, (long) std::lround(z.start / 1000.0 * s.sr))); long n = std::max(2L, endAbs - st);
        for (int c = 0; c < s.chn; ++c) { a.own[c].resize((size_t) n); for (long i = 0; i < n; ++i) a.own[c][(size_t) i] = s.ch[c][(size_t) (st + n - 1 - i)]; a.ch[c] = a.own[c].data(); }
        a.len = n; return;
    }
    if (loopOn && le - ls > 64 && le <= endAbs) {
        long pp = L["pp"].boolean() ? 1 : 0, len = le - ls; long x = std::min(xf, std::min(ls, len >> 1)); std::string curve = L["xcurve"].str("power");
        long outLen = pp ? le + len : le;
        for (int c = 0; c < s.chn; ++c) {
            auto& o = a.own[c]; o.assign(s.ch[c].begin(), s.ch[c].begin() + le); o.resize((size_t) outLen);
            for (long i = 0; i < x; ++i) { double t = (i + .5) / x; o[(size_t) (le - x + i)] = (float) (s.ch[c][(size_t) (le - x + i)] * fadeCurve(1 - t, curve) + s.ch[c][(size_t) (ls - x + i)] * fadeCurve(t, curve)); }
            if (pp) for (long i = 0; i < len; ++i) o[(size_t) (le + i)] = o[(size_t) (le - 1 - i)];
            a.ch[c] = o.data();
        }
        a.len = outLen; a.loop = true; a.loopS = ls; a.loopE = outLen; return;
    }
    for (int c = 0; c < s.chn; ++c) a.ch[c] = s.ch[c].data();
    a.len = endAbs;
}

static void fillInfo(const Json& lib, LibraryInfo& i) {
    i.id = lib["id"].str(); i.name = lib["name"].str("Untitled"); i.author = lib["author"].str(); i.version = lib["version"].str("1.0.0");
    i.desc = lib["desc"].str(); i.tags = lib["tags"].str(); i.category = lib["category"].str(); i.web = lib["web"].str();
    i.licence = lib["licence"].str(); i.changelog = lib["changelog"].str(); i.accent = lib["accent"].str("#4f7db8");
}

#ifndef VISU_NO_FILES
bool Library::readInfo(const std::string& path, LibraryInfo& info, std::string& error) {
    VsampFile f; if (!f.openFile(path, error)) return false;
    const Json& m = f.manifest();
    if (m["format"].str() != "vsamp") { error = m["format"].str() == "visumaker-project" ? "This is a VisuMaker project, not a finished library." : "Not a library file."; return false; }
    fillInfo(m["lib"], info);
    auto img = [&](const char* k, std::string& dst) { const Json& r = m["banner"]["images"][k]; if (r.isNull()) return; std::vector<uint8_t> b; std::string e; if (f.blob(VsampFile::ref(r), b, e)) dst.assign(b.begin(), b.end()); };
    img("wide", info.bannerWide); img("tile", info.bannerTile); img("icon", info.bannerIcon);
    return true;
}
#endif

const std::vector<std::string>& supportedFeatures() {
    static const std::vector<std::string> s = { "sampler", "slicer", "loop", "pingpong", "reverse", "unison", "rr", "release", "choke",
        "voicelimit", "crossfade", "velstart", "humanize", "lists", "mute-solo", "interp", "ui", "speedkeep", "granular", "wavetable", "envelope", "grouplinks" };
    return s;
}

#ifndef VISU_NO_FILES
std::shared_ptr<Library> Library::load(const std::string& path, std::string& error, double sampleRate) {
    VsampFile f; if (!f.openFileLazy(path, error)) return nullptr;   // audio is read as needed, long samples stream
    return fromFile(f, error, sampleRate);
}
#endif

std::shared_ptr<Library> Library::loadBytes(std::vector<uint8_t> bytes, std::string& error, double sampleRate) {
    VsampFile f; if (!f.openBytes(std::move(bytes), error)) return nullptr;
    return fromFile(f, error, sampleRate);
}

std::shared_ptr<Library> Library::fromFile(const VsampFile& f, std::string& error, double sampleRate) {
    const Json& m = f.manifest();
    if (m["format"].str() != "vsamp") { error = "Not a library file."; return nullptr; }
    auto L = std::make_shared<Library>();
    fillInfo(m["lib"], L->info);
    L->bpm = m["project"]["bpm"].num(120);
    { const Json& pl = m["project"]["play"]; L->play.mono = pl["mono"].boolean(false); L->play.legato = pl["legato"].boolean(false);
      L->play.glideMs = (float) std::max(0.0, pl["glide"].num(0)); L->play.bend = (float) std::min(48.0, std::max(0.0, pl["bend"].num(2)));
      L->play.maxVoices = (int) std::max(0.0, pl["maxVoices"].num(0)); L->play.quietest = pl["steal"].str("oldest") == "quietest"; }
    { bool known; L->projectInterp = parseInterp(m["project"]["interp"].str("linear"), known); }
    L->manifestText = f.manifestText();
    auto blobs = [&](const Json& obj, std::vector<std::pair<std::string, Blob>>& out) {
        for (auto& kv : obj.o) {
            Blob b; b.mime = kv.second["mime"].str("application/octet-stream"); b.name = kv.second["name"].str(kv.first);
            b.w = kv.second["w"].integer(); b.h = kv.second["h"].integer();
            std::vector<uint8_t> d; std::string e;
            if (f.blob(VsampFile::ref(kv.second["data"]), d, e)) { b.data.assign(d.begin(), d.end()); out.emplace_back(kv.first, std::move(b)); }
        }
    };
    blobs(m["assets"], L->assets); blobs(m["fonts"], L->fonts);
    for (size_t i = 0; i < m["features"].size(); ++i) {
        std::string ft = m["features"][i].str(); L->features.push_back(ft);
        const bool fxOk = ft.rfind("fx:", 0) == 0 && std::find(fx::supportedModules().begin(), fx::supportedModules().end(), ft.substr(3)) != fx::supportedModules().end();
        if (!fxOk && std::find(supportedFeatures().begin(), supportedFeatures().end(), ft) == supportedFeatures().end()) L->unsupported.push_back(ft);
    }
    /* which samples can stream: played straight through (no loop, not reversed) in sampler or slicer mode,
       and long enough that keeping only the start in memory saves something */
    std::map<std::string, double> maxStartMs; std::map<std::string, bool> needAll;
    for (size_t i = 0; i < m["zones"].size(); ++i) {
        const Json& zj = m["zones"][i]; const std::string sid = zj["sample"].str();
        if (zj["loop"]["on"].boolean() || zj["rev"].boolean()) needAll[sid] = true;
        maxStartMs[sid] = std::max(maxStartMs[sid], zj["start"].num() + std::max(0.0, zj["vstart"].num()) + std::max(0.0, zj["hum"]["start"].num()));
    }
    std::map<std::string, int> sidx;
    for (size_t i = 0; i < m["samples"].size(); ++i) {
        const Json& sj = m["samples"][i]; Sample s;
        s.id = sj["id"].str(); s.name = sj["name"].str(); s.sr = sj["sr"].integer(44100); s.chn = std::min(2, std::max(1, sj["chn"].integer(1)));
        s.mode = sj["sm"]["mode"].str("sampler"); s.unison = unisonVoices(sj["sm"]["uni"]);
        { const Json& sk = sj["sm"]["sk"]; s.skSpeed = (float) sk["speed"].num(100); s.skGrainMs = (float) sk["grain"].num(50); s.skWsola = sk["quality"].str("wsola") != "ola"; s.skSync = sk["sync"].boolean(); s.bars = (float) sj["sm"]["bars"].num(2); }
        { const Json& g = sj["sm"]["gr"]; s.grSize = (float) g["size"].num(90); s.grDensity = (float) g["density"].num(28); s.grPos = (float) g["pos"].num(45); s.grSpread = (float) g["spread"].num(15);
          s.grJitter = (float) g["jitter"].num(0); const std::string sh = g["shape"].str("hann"); s.grShape = sh == "tri" ? 1 : sh == "rect" ? 2 : 0; }
        { const Json& w = sj["sm"]["wt"]; s.wtFrame = std::max(32, w["frame"].integer(2048)); s.wtPos = (float) w["pos"].num(0); s.wtPos2 = (float) w["pos2"].num(-1); s.wtSweep = (float) w["sweep"].num(2500); s.wtTagId = w["tag"].str(""); }
        const int fch = std::max(1, sj["chn"].integer(1)), bits = sj["bits"].integer(16);
        if (fch > 8) { error = "Too many channels."; return nullptr; }
        /* the audio: chunks (new exports) or one block; chunks can be read one by one */
        StreamSource src; src.path = f.path(); src.base = f.base(); src.chn = fch; src.bits = bits;
        const int bps = bits == 24 ? 3 : bits == 32 ? 4 : 2;
        if (sj.has("chunks")) { src.chunkFrames = std::max(1, sj["chunkFrames"].integer(32768)); for (size_t k = 0; k < sj["chunks"].size(); ++k) src.chunks.push_back(VsampFile::ref(sj["chunks"][k])); }
        else {
            const BlobRef d = VsampFile::ref(sj["data"]);
            if (!d.deflate) { const uint64_t cb = (uint64_t) src.chunkFrames * (uint64_t) (fch * bps);   // a raw block: virtual chunks
                for (uint64_t o = 0; o < d.len; o += cb) { BlobRef r; r.off = d.off + o; r.len = std::min(cb, d.len - o); r.raw = r.len; r.nocrc = true; src.chunks.push_back(r); }
                if (src.chunks.size() > 1 && !f.lazy()) { std::vector<uint8_t> all; if (!f.blob(d, all, error)) return nullptr; }   /* in memory: still check the whole block */ }
            else src.chunks.push_back(d);   // one packed block: cannot stream
        }
        src.frames = (uint64_t) sj["frames"].num(0);
        const bool canStream = f.lazy() && !src.chunks.empty() && src.frames > 0 && (src.chunks.size() > 1) && (s.mode == "sampler" || s.mode == "slicer") && !needAll[s.id];
        const size_t head = std::min<size_t>((size_t) src.frames, kPreloadFrames + (size_t) std::ceil(maxStartMs[s.id] / 1000.0 * s.sr));
        const bool stream = canStream && head + (size_t) src.chunkFrames < (size_t) src.frames;
        std::vector<float> all[8];
        for (size_t k = 0; k < src.chunks.size(); ++k) {   // decode all chunks, or only those covering the head
            if (stream && k * (size_t) src.chunkFrames >= head) break;
            std::vector<uint8_t> raw; if (!f.blob(src.chunks[k], raw, error)) return nullptr;
            std::vector<float> part[8]; decodePCM(raw.data(), raw.size(), fch, bits, part);
            for (int c = 0; c < fch; ++c) all[c].insert(all[c].end(), part[c].begin(), part[c].end());
        }
        s.ch[0] = std::move(all[0]); if (s.chn > 1) s.ch[1] = std::move(all[1]);
        if (stream) { s.headFrames = std::min(head, s.ch[0].size()); s.frames = (size_t) src.frames;
#ifndef VISU_NO_FILES
            s.streamSrc = registerStreamSource(src);
#endif
        } else s.frames = s.ch[0].size();
        if (s.streamSrc < 0 && stream) { error = "Streaming is not available in this build."; return nullptr; }
        if (s.mode == "wavetable") {   // level like the JS core: the loudest frame peaks at 0.8
            s.wtFrames = std::max(1, (int) (s.frames / (size_t) s.wtFrame)); float pk = 0;
            for (size_t i = 0; i < std::min(s.frames, (size_t) s.wtFrames * s.wtFrame); ++i) pk = std::max(pk, std::fabs(s.ch[0][i]));
            s.wtGain = pk > 0 ? .8f / pk : 1.f;
        }
        sidx[s.id] = (int) L->samples.size(); L->samples.push_back(std::move(s));
    }
    std::map<std::string, int> gidx; const Json& gset = m["project"]["gset"];
    auto groupOf = [&](const std::string& name) {
        auto it = gidx.find(name); if (it != gidx.end()) return it->second;
        GroupCfg g; g.name = name; const Json& j = gset[name.c_str()];
        std::string md = j["mode"].str("normal");
        g.mode = md == "rrcycle" ? GroupMode::RRCycle : md == "rrrandom" ? GroupMode::RRRandom : md == "rrunique" ? GroupMode::RRUnique : md == "release" ? GroupMode::Release : GroupMode::Normal;
        g.choke = j["choke"].integer(0); g.voices = j["voices"].integer(0); g.vol = (float) j["vol"].num(0); g.pan = (float) j["pan"].num(0); g.tune = (float) j["tune"].num(0);
        g.velcurve = (float) std::max(.1, j["velcurve"].num(1)); bool known; g.interp = parseInterp(j["interp"].str("inherit"), known); g.inheritInterp = !known;
        g.mute = j["mute"].boolean(); g.solo = j["solo"].boolean(); if (g.solo) L->anySolo = true;
        { const Json& e = j["env"]; g.envOn = e["on"].boolean(false); g.envA = (float) std::max(0.0, e["a"].num(5)); g.envD = (float) std::max(0.0, e["d"].num(300));
          g.envS = (float) std::min(1.0, std::max(0.0, e["s"].num(100) / 100.0)); g.envR = (float) std::max(0.0, e["r"].num(300));
          const char* K[4] = { "a", "d", "s", "r" }; for (int k = 0; k < 4; ++k) g.envTagId[k] = e["tags"][K[k]].str(""); }
        { const Json& lk = j["links"]; GroupCfg::Link* L4[4] = { &g.lVol, &g.lPan, &g.lTune, &g.lFine }; const char* K[4] = { "vol", "pan", "tune", "fine" };
          for (int k = 0; k < 4; ++k) { const Json& x = lk[K[k]]; L4[k]->tagId = x["tag"].str(""); L4[k]->from = (float) x["from"].num(0); L4[k]->to = (float) x["to"].num(0); } }
        int id = (int) L->groups.size(); gidx[name] = id; L->groups.push_back(g); return id;
    };
    for (size_t i = 0; i < m["zones"].size(); ++i) {
        const Json& zj = m["zones"][i]; Zone z;
        auto it = sidx.find(zj["sample"].str()); if (it == sidx.end()) continue;
        z.sample = it->second; z.group = groupOf(zj["group"].str());
        z.lo = zj["lo"].integer(0); z.hi = zj["hi"].integer(127); z.vlo = zj["vlo"].integer(1); z.vhi = zj["vhi"].integer(127); z.root = zj["root"].integer(60); z.seq = zj["seq"].integer(0);
        z.tune = (float) zj["tune"].num(); z.vol = (float) zj["vol"].num(); z.pan = (float) zj["pan"].num(); z.start = (float) zj["start"].num(); z.vstart = (float) zj["vstart"].num();
        z.attack = (float) zj["attack"].num(0); z.release = zj.has("release") ? (float) zj["release"].num(80) : 80.f;
        z.fadeLo = zj["fadeLo"].integer(); z.fadeHi = zj["fadeHi"].integer(); z.vfadeLo = zj["vfadeLo"].integer(); z.vfadeHi = zj["vfadeHi"].integer(); z.curve = zj["curve"].str("power");
        z.rev = zj["rev"].boolean(); z.keytrack = zj.has("keytrack") ? zj["keytrack"].boolean(true) : true; z.oneshot = zj["oneshot"].boolean(); z.mute = zj["mute"].boolean(); z.solo = zj["solo"].boolean(); if (z.solo) L->anyZoneSolo = true; z.id = zj["id"].str();
        z.humTune = (float) zj["hum"]["tune"].num(); z.humVol = (float) zj["hum"]["vol"].num(); z.humStart = (float) zj["hum"]["start"].num();
        z.interp = parseInterp(zj["interp"].str("inherit"), z.hasInterp);
        const Sample& s = L->samples[(size_t) z.sample];
        if (!s.supported()) L->unsupportedZones++;
        else if (s.mode == "granular" || s.mode == "wavetable") { z.audio.ch[0] = s.ch[0].data(); z.audio.ch[1] = s.chn > 1 ? s.ch[1].data() : nullptr; z.audio.len = (long) s.frames; z.audio.loop = true; z.audio.loopS = 0; z.audio.loopE = (long) s.frames; }   // played live, never runs out
        else prepareAudio(z, s, zj);
        int idx = (int) L->zones.size(); L->zones.push_back(std::move(z));
        const Zone& zz = L->zones.back();
        if (s.supported()) for (int n = std::max(0, zz.lo); n <= std::min(127, zz.hi); ++n) L->byNote[(size_t) n].push_back(idx);
    }
    /* lists: which groups each one plays */
    const Json& lj = m["project"]["lists"];
    for (size_t i = 0; i < lj.size(); ++i) {
        ListDef d; d.name = lj[i]["name"].str(); d.bank = lj[i]["bank"].integer(0); d.ks = lj[i].has("ks") && !lj[i]["ks"].isNull() ? lj[i]["ks"].integer(-1) : -1;
        for (size_t k = 0; k < lj[i]["groups"].size(); ++k) { auto it = gidx.find(lj[i]["groups"][k].str()); if (it != gidx.end()) d.groups.push_back(it->second); }
        L->lists.push_back(std::move(d));
    }
    if (!L->lists.empty()) L->defaultList = std::min((int) L->lists.size() - 1, std::max(0, m["project"]["currentList"].integer(0)));
    /* tags (knob values) and effect chains */
    const Json& tj = m["project"]["tags"];
    for (size_t i = 0; i < tj.size(); ++i) { fx::TagDef d; d.id = tj[i]["id"].str(); d.name = tj[i]["name"].str(); d.kind = tj[i]["kind"].str("number"); d.basis = tj[i]["basis"].str("note");
        d.steps = (int) tj[i]["steps"].size(); d.def = (float) tj[i]["value"].num(tj[i]["def"].num(0)); L->tags.push_back(d); }
    L->tagValues.reset(new std::atomic<float>[std::max<size_t>(1, L->tags.size())]);
    for (size_t i = 0; i < L->tags.size(); ++i) L->tagValues[i].store(L->tags[i].def);
    for (auto& g : L->groups) for (GroupCfg::Link* lk : { &g.lVol, &g.lPan, &g.lTune, &g.lFine }) if (!lk->tagId.empty()) for (size_t i = 0; i < L->tags.size(); ++i) if (L->tags[i].id == lk->tagId) lk->tag = (int) i;
    for (auto& g : L->groups) for (int k = 0; k < 4; ++k) if (!g.envTagId[k].empty()) for (size_t i = 0; i < L->tags.size(); ++i) if (L->tags[i].id == g.envTagId[k]) g.envTag[k] = (int) i;
    for (auto& s : L->samples) if (!s.wtTagId.empty()) for (size_t i = 0; i < L->tags.size(); ++i) if (L->tags[i].id == s.wtTagId) s.wtTag = (int) i;
    L->sampleRate = sampleRate;
    std::vector<std::string> gnames; for (auto& g : L->groups) gnames.push_back(g.name);
    std::vector<std::string> fxBad;
    L->fx = fx::System::build(m, *L, L->tags, gnames, fxBad);
    L->fx->prepare(sampleRate);
    for (auto& b : fxBad) if (std::find(L->unsupported.begin(), L->unsupported.end(), b) == L->unsupported.end()) L->unsupported.push_back(b);
    return L;
}

bool Library::setTag(const std::string& name, float value) const {
    for (size_t i = 0; i < tags.size(); ++i) if (tags[i].name == name) { tagValues[i].store(std::min(1.f, std::max(0.f, value))); return true; }
    return false;
}

} // namespace visu

namespace visu {
size_t Library::memoryBytes() const {
    size_t b = 0;
    for (auto& s : samples) for (auto& c : s.ch) b += c.size() * sizeof(float);
    for (auto& z : zones) for (auto& c : z.audio.own) b += c.size() * sizeof(float);
    return b;
}
int Library::streamedSamples() const { int n = 0; for (auto& s : samples) if (s.streamSrc >= 0) ++n; return n; }
}
