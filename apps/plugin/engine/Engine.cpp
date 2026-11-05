#include "Engine.h"
#include <algorithm>
#include <cmath>
#include <mutex>

namespace visu {

static inline float dbToGain(float db) { return std::pow(10.f, db / 20.f); }
static const double kPi = 3.14159265358979323846;

Engine::Engine() {}
void Engine::prepare(double sr) { sr_ = sr; }

void Engine::setLibrary(std::shared_ptr<const Library> lib) {
    std::lock_guard<std::mutex> g(ownersMutex_);
    const Library* raw = lib.get();
    if (lib) owners_.push_back(std::move(lib));
    pending_.store(raw);
    // free libraries the audio thread can no longer be using (never frees on the audio thread)
    const Library* use = inUse_.load();
    owners_.erase(std::remove_if(owners_.begin(), owners_.end(), [&](const std::shared_ptr<const Library>& o) { return o.get() != raw && o.get() != use; }), owners_.end());
}

void Engine::adopt() {
    const Library* p;
    do { p = pending_.load(); inUse_.store(p); } while (p != pending_.load());
    if (p == lib_) return;
    for (auto& v : voices_) v.on = false;
    lib_ = p;
    for (auto& r : rr_) r = 0;
    active_.store(0);
}

Interp Engine::interpFor(const Zone& z) const {
    if (z.hasInterp) return z.interp;
    const GroupCfg& g = lib_->groups[(size_t) z.group];
    return g.inheritInterp ? lib_->projectInterp : g.interp;
}

static double fadeCurve(double t, const std::string& c) { t = std::min(1.0, std::max(0.0, t)); return c == "linear" ? t : c == "s" ? t * t * (3 - 2 * t) : std::sin(t * kPi / 2); }
float Engine::zoneGain(const Zone& z, int note, int vel) const {
    double g = 1;
    if (z.fadeLo > 0 && note < z.lo + z.fadeLo) g *= fadeCurve((note - z.lo + .5) / z.fadeLo, z.curve);
    if (z.fadeHi > 0 && note > z.hi - z.fadeHi) g *= fadeCurve((z.hi - note + .5) / z.fadeHi, z.curve);
    if (z.vfadeLo > 0 && vel < z.vlo + z.vfadeLo) g *= fadeCurve((vel - z.vlo + .5) / z.vfadeLo, z.curve);
    if (z.vfadeHi > 0 && vel > z.vhi - z.vfadeHi) g *= fadeCurve((z.vhi - vel + .5) / z.vfadeHi, z.curve);
    return (float) g;
}

void Engine::kill(Voice& v, bool fast) {
    if (!v.on) return;
    if (fast) { v.releasing = true; v.relInc = 1.f / (float) (0.03 * sr_); return; }
    v.releasing = true; float rel = std::max(.01f, v.zone->release / 1000.f); v.relInc = 1.f / (float) (rel * sr_);
}

void Engine::startZone(const Zone& z, int note, int vel, bool fromRelease) {
    const Sample& s = lib_->samples[(size_t) z.sample]; const GroupCfg& g = lib_->groups[(size_t) z.group];
    const float jt = (rnd() * 2 - 1) * z.humTune, jv = (rnd() * 2 - 1) * z.humVol, js = rnd() * z.humStart;
    const double startMsBase = z.start + z.vstart * (vel / 127.0) + js;
    float amp = dbToGain(z.vol + g.vol + jv) * (float) std::pow(vel / 127.0, g.velcurve) * zoneGain(z, note, vel);
    for (const UnisonVoice& u : s.unison) {
        Voice* v = nullptr; unsigned long oldest = ~0ul; Voice* ov = nullptr;
        for (auto& c : voices_) { if (!c.on) { v = &c; break; } if (c.age < oldest) { oldest = c.age; ov = &c; } }
        if (!v) v = ov;                                  // steal the oldest
        const double semis = (z.keytrack ? note - z.root : 0) + (z.tune + g.tune + u.tuneCents + jt) / 100.0;
        v->zone = &z; v->sample = &s; v->audio = &z.audio; v->interp = interpFor(z);
        v->ratio = std::pow(2.0, semis / 12.0) * s.sr / sr_;
        double st = z.rev ? 0.0 : std::min((double) (s.frames - 2), std::max(0.0, std::round((startMsBase + u.startMs) / 1000.0 * s.sr)));
        v->pos = st; v->stereoIn = s.chn > 1;
        v->gain = amp * u.gain;
        v->pan = std::min(1.f, std::max(-1.f, z.pan / 100.f + g.pan / 100.f + u.pan));
        v->attackInc = z.attack > 0 ? 1.f / (float) (z.attack / 1000.0 * sr_) : 0; v->env = z.attack > 0 ? 0.f : 1.f;
        v->releasing = false; v->relInc = 0; v->on = true; v->note = note; v->group = z.group; v->choke = g.choke;
        v->oneshot = z.oneshot && !z.audio.loop; v->fromRelease = fromRelease; v->held = false; v->age = ++clock_;
        v->maxLife = fromRelease ? (long) (4 * sr_) : -1;
    }
}

bool Engine::groupAllowed(int g) const {
    if (lib_->lists.empty()) return true;
    int l = list_.load(); if (l == -2) l = lib_->defaultList;
    if (l < 0 || l >= (int) lib_->lists.size()) return true;
    const auto& gs = lib_->lists[(size_t) l].groups;
    return std::find(gs.begin(), gs.end(), g) != gs.end();
}

void Engine::noteOn(int note, int vel) {
    adopt();
    if (!lib_ || note < 0 || note > 127) return;
    vel = std::min(127, std::max(1, vel));
    const std::vector<int>& list = lib_->byNote[(size_t) note];
    int hits[64]; int nh = 0;
    for (int zi : list) {
        const Zone& z = lib_->zones[(size_t) zi]; const GroupCfg& g = lib_->groups[(size_t) z.group];
        if (z.mute || g.mute || g.mode == GroupMode::Release || vel < z.vlo || vel > z.vhi || (lib_->anySolo && !g.solo) || (lib_->anyZoneSolo && !z.solo) || !groupAllowed(z.group)) continue;
        if (nh < 64) hits[nh++] = zi;
    }
    // round robin: one sequence per group per hit
    int chosen[64]; int nc = 0;
    for (int i = 0; i < nh; ++i) {
        const Zone& z = lib_->zones[(size_t) hits[i]]; const GroupCfg& g = lib_->groups[(size_t) z.group];
        if (g.mode == GroupMode::Normal) { chosen[nc++] = hits[i]; continue; }
        // collect the sequences of this group among the hits
        int seqs[32]; int ns = 0;
        for (int k = 0; k < nh; ++k) { const Zone& zk = lib_->zones[(size_t) hits[k]]; if (zk.group != z.group) continue; bool f = false; for (int q = 0; q < ns; ++q) if (seqs[q] == zk.seq) f = true; if (!f && ns < 32) seqs[ns++] = zk.seq; }
        std::sort(seqs, seqs + ns);
        int& state = rr_[std::min(255, z.group)]; int pick;
        if (g.mode == GroupMode::RRCycle) { pick = seqs[(unsigned) state % (unsigned) ns]; state++; }
        else {
            int cand[32]; int nc2 = 0; for (int q = 0; q < ns; ++q) if (seqs[q] != state - 1000 || ns == 1) cand[nc2++] = seqs[q];
            rng_ = rng_ * 1664525u + 1013904223u; pick = cand[(rng_ >> 8) % (unsigned) nc2]; state = pick + 1000;
        }
        if (z.seq == pick) chosen[nc++] = hits[i];
    }
    for (int i = 0; i < nc; ++i) {
        const Zone& z = lib_->zones[(size_t) chosen[i]]; const GroupCfg& g = lib_->groups[(size_t) z.group];
        if (g.choke) for (auto& v : voices_) if (v.on && !v.releasing && v.group == z.group && v.choke) kill(v, true);
        if (g.voices > 0) { int cnt = 0; unsigned long oldest = ~0ul; Voice* ov = nullptr; for (auto& v : voices_) if (v.on && !v.releasing && v.group == z.group) { cnt++; if (v.age < oldest) { oldest = v.age; ov = &v; } } if (cnt >= g.voices && ov) kill(*ov, true); }
        startZone(z, note, vel, false);
    }
    heldNotes_[note] = true;
    ctl_.vel = (float) vel; ctl_.key = (float) note; ctl_.gate = true; ctl_.tOn = ctl_.time;
}

void Engine::noteOff(int note) {
    adopt();
    if (ctl_.gate) { ctl_.gate = false; ctl_.tOff = ctl_.time; }
    if (!lib_ || note < 0 || note > 127) return;
    heldNotes_[note] = false;
    if (sustain_) { for (auto& v : voices_) if (v.on && !v.fromRelease && v.note == note) v.held = true; return; }
    for (auto& v : voices_) if (v.on && !v.releasing && !v.fromRelease && v.note == note && !v.oneshot) kill(v, false);
    for (int zi : lib_->byNote[(size_t) note]) {
        const Zone& z = lib_->zones[(size_t) zi];
        if (lib_->groups[(size_t) z.group].mode == GroupMode::Release && !z.mute && 100 >= z.vlo && 100 <= z.vhi && !lib_->groups[(size_t) z.group].mute && groupAllowed(z.group)) startZone(z, note, 100, true);
    }
}

void Engine::sustain(bool down) {
    adopt();
    sustain_ = down;
    if (!down) for (auto& v : voices_) if (v.on && v.held) { v.held = false; if (!heldNotes_[v.note] && !v.oneshot) kill(v, false); }
}
void Engine::allNotesOff() { adopt(); for (auto& v : voices_) if (v.on) kill(v, true); for (auto& h : heldNotes_) h = false; sustain_ = false; }

// ---- interpolation, same formulas as the JS core ----
static inline double lanczos(double x, double a) { if (x == 0) return 1; if (x <= -a || x >= a) return 0; double px = kPi * x; return a * std::sin(px) * std::sin(px / a) / (px * px); }

struct Reader {
    const float* d; long n; bool loop; long ls, le;
    inline float at(long i) const {
        if (loop && i >= le) i = ls + (i - ls) % (le - ls);
        return (i < 0 || i >= n) ? 0.f : d[i];
    }
    float read(double p, Interp m, double ratio) const {
        long i = (long) std::floor(p); double f = p - (double) i;
        switch (m) {
            case Interp::Nearest: return at((long) std::floor(p + .5));
            case Interp::Linear: return (float) (at(i) * (1 - f) + at(i + 1) * f);
            case Interp::Cubic: { double a = at(i - 1), b = at(i), c = at(i + 1), dd = at(i + 2);
                return (float) (b + .5 * f * (c - a + f * (2 * a - 5 * b + 4 * c - dd + f * (3 * (b - c) + dd - a)))); }
            case Interp::Sinc: default: {
                const double KA = 4, fc = ratio > 1 ? 1 / ratio : 1; long A = (long) std::min(32.0, std::ceil(KA * std::max(1.0, ratio)));
                double s = 0; for (long k = i - A + 1; k <= i + A; ++k) { double w = lanczos(((p) - (double) k) * fc, KA); if (w != 0) s += at(k) * w * fc; }
                return (float) s; }
        }
    }
};

int Engine::renderVoices(float* L, float* R, int n, float gainScale) {
    fx::System* fx = (lib_->fx && lib_->fx->hasAny()) ? lib_->fx.get() : nullptr;
    int active = 0;
    for (auto& v : voices_) {
        if (!v.on) continue;
        float* dL = L; float* dR = R;
        if (fx) { fx::Stereo& s = fx->groupIn(v.group); dL = s.l; dR = s.r; }
        const ZoneAudio& a = *v.audio;
        Reader r0{ a.ch[0], a.len, a.loop, a.loopS, a.loopE }, r1{ a.ch[1] ? a.ch[1] : a.ch[0], a.len, a.loop, a.loopS, a.loopE };
        const float x = v.pan <= 0 ? v.pan + 1 : v.pan, gL = std::cos(x * (float) kPi / 2), gR = std::sin(x * (float) kPi / 2), g = v.gain * gainScale;
        for (int i = 0; i < n; ++i) {
            if (!a.loop && v.pos >= (double) a.len) { v.on = false; break; }
            if (v.maxLife >= 0 && --v.maxLife < 0) kill(v, false);
            if (v.attackInc > 0 && v.env < 1.f && !v.releasing) { v.env += v.attackInc; if (v.env > 1.f) v.env = 1.f; }
            if (v.releasing) { v.env -= v.relInc; if (v.env <= 0) { v.on = false; break; } }
            float l = r0.read(v.pos, v.interp, v.ratio), rr = v.stereoIn ? r1.read(v.pos, v.interp, v.ratio) : l, oL, oR;
            if (!v.stereoIn) { const float m = std::cos((v.pan + 1) * (float) kPi / 4), m2 = std::sin((v.pan + 1) * (float) kPi / 4); oL = l * m; oR = l * m2; }
            else if (v.pan <= 0) { oL = l + rr * gL; oR = rr * gR; } else { oL = l * gL; oR = rr + l * gR; }
            const float e = g * v.env; dL[i] += oL * e; dR[i] += oR * e;
            v.pos += v.ratio;
            if (a.loop && v.pos >= (double) a.loopE) v.pos -= (double) (a.loopE - a.loopS);
        }
        if (v.on) ++active;
    }
    return active;
}

void Engine::render(float* L, float* R, int n) {
    adopt();
    if (!lib_) { active_.store(0); return; }
    const float master = master_.load();
    fx::System* fx = (lib_->fx && lib_->fx->hasAny()) ? lib_->fx.get() : nullptr;
    ctl_.bpm = lib_->bpm; ctl_.tags = lib_->tagValues.get(); ctl_.numTags = (int) lib_->tags.size(); ctl_.sampleRate = sr_;
    if (!fx) { active_.store(renderVoices(L, R, n, master)); ctl_.time += n / sr_; return; }
    int done = 0, active = 0;
    while (done < n) {
        const int m = std::min(fx::kBlock, n - done);
        active = renderVoices(nullptr, nullptr, m, 1.f);
        fx->process(m, ctl_);
        const fx::Stereo& o = fx->out();
        for (int i = 0; i < m; ++i) { L[done + i] += o.l[i] * master; R[done + i] += o.r[i] * master; }
        ctl_.time += m / sr_; done += m;
    }
    active_.store(active);
}

void Engine::controller(int cc, int value) {
    if (cc == 1) ctl_.mod = value / 127.f; else if (cc == 11) ctl_.expr = value / 127.f; else if (cc == 64) sustain(value >= 64);
}
void Engine::pitchBend(float v01) { ctl_.bend = v01; }
void Engine::aftertouch(float v01) { ctl_.at = v01; }

} // namespace visu
