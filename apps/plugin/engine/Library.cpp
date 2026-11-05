#include "Library.h"
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
        "voicelimit", "crossfade", "velstart", "humanize", "lists", "mute-solo", "interp", "ui" };
    return s;
}

#ifndef VISU_NO_FILES
std::shared_ptr<Library> Library::load(const std::string& path, std::string& error, double sampleRate) {
    VsampFile f; if (!f.openFile(path, error)) return nullptr;
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
    std::map<std::string, int> sidx;
    for (size_t i = 0; i < m["samples"].size(); ++i) {
        const Json& sj = m["samples"][i]; Sample s;
        s.id = sj["id"].str(); s.name = sj["name"].str(); s.sr = sj["sr"].integer(44100); s.chn = std::min(2, std::max(1, sj["chn"].integer(1)));
        s.mode = sj["sm"]["mode"].str("sampler"); s.unison = unisonVoices(sj["sm"]["uni"]);
        std::vector<uint8_t> raw; if (!f.blob(VsampFile::ref(sj["data"]), raw, error)) return nullptr;
        std::vector<float> tmp[2]; int fch = std::max(1, sj["chn"].integer(1));
        std::vector<float> all[8]; if (fch > 8) { error = "Too many channels."; return nullptr; }
        decodePCM(raw.data(), raw.size(), fch, sj["bits"].integer(16), all);
        s.frames = all[0].size(); s.ch[0] = std::move(all[0]); if (s.chn > 1) s.ch[1] = std::move(all[1]);
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
        else prepareAudio(z, s, zj);
        int idx = (int) L->zones.size(); L->zones.push_back(std::move(z));
        const Zone& zz = L->zones.back();
        if (s.supported()) for (int n = std::max(0, zz.lo); n <= std::min(127, zz.hi); ++n) L->byNote[(size_t) n].push_back(idx);
    }
    /* lists: which groups each one plays */
    const Json& lj = m["project"]["lists"];
    for (size_t i = 0; i < lj.size(); ++i) {
        ListDef d; d.name = lj[i]["name"].str(); d.bank = lj[i]["bank"].integer(0);
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
