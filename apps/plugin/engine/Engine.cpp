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
    stackSize_ = 0; monoNote_ = lastNote_ = -1;
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

void Engine::groupEnv(int group, float& a, float& d, float& s, float& r) const {
    const GroupCfg& g = lib_->groups[(size_t) group]; float* out[4] = { &a, &d, &s, &r }; const float base[4] = { g.envA, g.envD, g.envS, g.envR };
    for (int k = 0; k < 4; ++k) {
        float v = base[k];
        if (g.envTag[k] >= 0 && lib_->tagValues) { const float t = lib_->tagValues[(size_t) g.envTag[k]].load(); v = k == 2 ? t : t * t * 10000.f; }
        *out[k] = v;
    }
}

void Engine::kill(Voice& v, bool fast) {
    if (!v.on) return;
    if (!fast && v.adsr) {   // group envelope: fall from wherever it is to silence in R
        float a, d, s, r; groupEnv(v.group, a, d, s, r);
        v.releasing = true; v.relInc = std::max(v.env, 1e-4f) / (float) (std::max(1.f, r) / 1000.0 * sr_); return;
    }
    if (fast) { v.releasing = true; v.stolen = true; v.relInc = 1.f / (float) (0.03 * sr_); return; }   // short fade instead of a click
    v.releasing = true; float rel = std::max(.01f, v.zone->release / 1000.f); v.relInc = 1.f / (float) (rel * sr_);
}

void Engine::startZone(const Zone& z, int note, int vel, bool fromRelease, float glideFrom) {
    const Sample& s = lib_->samples[(size_t) z.sample]; const GroupCfg& g = lib_->groups[(size_t) z.group];
    const float jt = (rnd() * 2 - 1) * z.humTune, jv = (rnd() * 2 - 1) * z.humVol, js = rnd() * z.humStart;
    const double startMsBase = z.start + z.vstart * (vel / 127.0) + js;
    float amp = dbToGain(z.vol + g.vol + jv) * (float) std::pow(vel / 127.0, g.velcurve) * zoneGain(z, note, vel);
    for (const UnisonVoice& u : s.unison) {
        while (sounding() >= limit() && stealOne()) {}   // over the limit: fade one out (released notes first)
        Voice* v = nullptr; unsigned long oldest = ~0ul; Voice* ov = nullptr;
        for (auto& c : voices_) { if (!c.on) { v = &c; break; } if (c.age < oldest) { oldest = c.age; ov = &c; } }
        if (!v) v = ov;                                  // every slot busy (fading voices): reuse the oldest
        const double semis = (z.keytrack ? note - z.root : 0) + (z.tune + g.tune + u.tuneCents + jt) / 100.0;
        v->zone = &z; v->sample = &s; v->audio = &z.audio; v->interp = interpFor(z);
        v->ratio = std::pow(2.0, semis / 12.0) * s.sr / sr_;
        double st = z.rev ? 0.0 : std::min((double) (s.frames - 2), std::max(0.0, std::round((startMsBase + u.startMs) / 1000.0 * s.sr)));
        v->pos = st; v->stereoIn = s.chn > 1;
        v->keepSpeed = s.mode == "speedkeep";
        if (v->keepSpeed) {
            double speed = std::max(.05, s.skSpeed / 100.0);
            if (s.skSync && s.frames > 0) { const double barBeats = 4.0, origBpm = s.bars * barBeats * 60.0 / ((double) s.frames / s.sr); if (origBpm > 0) speed *= lib_->bpm / origBpm; }
            v->k = speed * s.sr / sr_; v->wsola = s.skWsola;
            v->grain = std::max(256, (int) std::lround(s.skGrainMs / 1000.0 * s.sr)) & ~1; v->grainCounter = 0; v->read0 = v->read1 = st;
        }
        v->gain = amp * u.gain;
        v->pan = std::min(1.f, std::max(-1.f, z.pan / 100.f + g.pan / 100.f + u.pan));
        if (!g.envOn) { v->attackInc = z.attack > 0 ? 1.f / (float) (z.attack / 1000.0 * sr_) : 0; v->env = z.attack > 0 ? 0.f : 1.f; }
        v->releasing = false; v->relInc = 0; v->on = true; v->note = note; v->group = z.group; v->choke = g.choke;
        v->oneshot = z.oneshot && !z.audio.loop; v->fromRelease = fromRelease; v->held = false; v->age = ++clock_;
        v->maxLife = fromRelease ? (long) (4 * sr_) : -1;
        v->adsr = g.envOn; v->stage = 0;
        if (v->adsr) { v->attackInc = 0; v->env = 0; }
        v->kind = s.mode == "granular" ? 2 : s.mode == "wavetable" ? 3 : 0;
        if (v->kind == 3) v->stereoIn = false;   // wavetables read the first channel, like the JS core
        if (v->kind) {
            v->pitch = std::pow(2.0, semis / 12.0);
            if (v->kind == 2) { const double gl = std::max(64.0, std::round(s.grSize / 1000.0 * s.sr)); v->ngr = 0; v->gk = 0; v->gt = 0; v->nextSpawn = -gl; v->seed = (z.root * 31 + note) | 0; }
            else { v->wph = 0; v->wms = 0; v->wfade = 0; v->wf = 440.0 * std::pow(2.0, (z.root - 69) / 12.0) * v->pitch; }
        }
        v->stolen = false; v->vel = vel; v->glide = z.keytrack ? glideFrom : 0.f; v->glideStep = glideStepFor(v->glide);
    }
}

bool Engine::groupAllowed(int g) const {
    if (lib_->lists.empty()) return true;
    int l = list_.load(); if (l == -2) l = lib_->defaultList;
    if (l < 0 || l >= (int) lib_->lists.size()) return true;
    const auto& gs = lib_->lists[(size_t) l].groups;
    return std::find(gs.begin(), gs.end(), g) != gs.end();
}

float Engine::glideStepFor(float semis) const { const float t = lib_ ? lib_->play.glideMs : 0.f; return t > 0 ? std::fabs(semis) / (float) (t / 1000.0 * sr_) : 0.f; }
int Engine::limit() const { int l = lib_ && lib_->play.maxVoices > 0 ? std::min(kMaxVoices, lib_->play.maxVoices) : kMaxVoices; return std::max(1, std::min(l, guard_.load())); }
int Engine::sounding() const { int n = 0; for (auto& v : voices_) if (v.on && !v.stolen) ++n; return n; }
bool Engine::stealOne() {
    // released notes go first, then the oldest (or quietest) sounding voice (from EmulonX)
    Voice* victim = nullptr;
    for (auto& v : voices_) if (v.on && !v.stolen && v.releasing && (!victim || v.age < victim->age)) victim = &v;
    if (!victim) for (auto& v : voices_) if (v.on && !v.stolen) {
        if (!victim) { victim = &v; continue; }
        if (lib_ && lib_->play.quietest ? v.gain * v.env < victim->gain * victim->env : v.age < victim->age) victim = &v;
    }
    if (!victim) return false;
    kill(*victim, true); return true;
}
void Engine::reportLoad(float f) {
    int g = guard_.load();
    if (f > .9f) { int s = 0; for (auto& v : voices_) if (v.on && !v.stolen) ++s; g = std::max(8, std::min(g, (int) (s * .8f))); }
    else if (f < .6f && g < kMaxVoices) g += 1;
    guard_.store(g);
}

void Engine::noteOn(int note, int vel) {
    adopt();
    if (!lib_ || note < 0 || note > 127) return;
    vel = std::min(127, std::max(1, vel));
    heldNotes_[note] = true;
    ctl_.vel = (float) vel; ctl_.key = (float) note; ctl_.gate = true; ctl_.tOn = ctl_.time;
    if (!lib_->play.mono) { startNote(note, vel, 0, nullptr, 0); return; }
    // mono: remember the order of held keys, so letting go returns to the previous one
    int k = 0; for (int i = 0; i < stackSize_; ++i) if (stack_[i] != note) stack_[k++] = stack_[i];
    stackSize_ = k; if (stackSize_ < 128) stack_[stackSize_++] = note;
    const int previous = monoNote_ >= 0 ? monoNote_ : lastNote_;
    monoNote_ = note; monoVel_ = vel;
    monoNoteOn(note, vel, previous);
}

void Engine::monoNoteOn(int note, int vel, int previous) {
    const bool glide = lib_->play.glideMs > 0;
    float from = (float) previous; bool overlapping = false;
    for (auto& v : voices_) if (v.on && !v.stolen && !v.releasing && !v.fromRelease && previous >= 0 && v.note == previous) { overlapping = true; from = (float) v.note + v.glide; break; }
    if (lib_->play.legato && overlapping) {
        // legato: voices whose zone also plays the new note just change pitch, no restart
        const Zone* handled[64]; int nh = 0;
        for (auto& v : voices_) {
            if (!v.on || v.stolen || v.releasing || v.fromRelease || v.note != previous) continue;
            const Zone& z = *v.zone;
            if (note >= z.lo && note <= z.hi && vel >= z.vlo && vel <= z.vhi) {
                const float cur = (float) v.note + v.glide;
                if (z.keytrack) v.ratio *= std::pow(2.0, (note - v.note) / 12.0);
                v.note = note; v.glide = glide && z.keytrack ? cur - (float) note : 0.f; v.glideStep = glideStepFor(v.glide);
                bool seen = false; for (int i = 0; i < nh; ++i) if (handled[i] == &z) seen = true;
                if (!seen && nh < 64) handled[nh++] = &z;
            } else kill(v, true);   // a different zone takes over
        }
        startNote(note, vel, glide ? from - (float) note : 0.f, handled, nh);
        return;
    }
    // retrigger: fade what is sounding and start the new note (gliding from the old pitch)
    for (auto& v : voices_) if (v.on && !v.stolen && !v.fromRelease) kill(v, true);
    startNote(note, vel, glide && previous >= 0 ? from - (float) note : 0.f, nullptr, 0);
}

void Engine::startNote(int note, int vel, float glideFrom, const Zone* const* skip, int nskip) {
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
        bool skipIt = false; for (int k = 0; k < nskip; ++k) if (skip[k] == &z) skipIt = true;
        if (skipIt) continue;
        if (g.voices > 0) { int cnt = 0; unsigned long oldest = ~0ul; Voice* ov = nullptr; for (auto& v : voices_) if (v.on && !v.releasing && v.group == z.group) { cnt++; if (v.age < oldest) { oldest = v.age; ov = &v; } } if (cnt >= g.voices && ov) kill(*ov, true); }
        startZone(z, note, vel, false, glideFrom);
    }
}

void Engine::noteOff(int note) {
    adopt();
    if (ctl_.gate) { ctl_.gate = false; ctl_.tOff = ctl_.time; }
    if (!lib_ || note < 0 || note > 127) return;
    heldNotes_[note] = false;
    if (lib_->play.mono) {
        int k = 0; for (int i = 0; i < stackSize_; ++i) if (stack_[i] != note) stack_[k++] = stack_[i];
        stackSize_ = k;
        if (note == monoNote_ && !sustain_ && stackSize_ > 0) {   // return to the key still held
            const int back = stack_[stackSize_ - 1], prev = monoNote_; monoNote_ = back;
            ctl_.gate = true; ctl_.key = (float) back;
            monoNoteOn(back, monoVel_, prev); return;
        }
        if (note == monoNote_ && stackSize_ == 0) { lastNote_ = monoNote_; monoNote_ = -1; }
    }
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
void Engine::allNotesOff() { adopt(); for (auto& v : voices_) if (v.on) kill(v, true); for (auto& h : heldNotes_) h = false; sustain_ = false; stackSize_ = 0; monoNote_ = -1; }

static inline double hash01(double n) { const double x = std::sin(n * 127.1 + 311.7) * 43758.5453; return x - std::floor(x); }
static inline float cubicAt(const float* src, int base, int fl, double ph) {   // one cycle of a wavetable frame, wrapping
    const double x = ph * fl; const int i = (int) std::floor(x); const float t = (float) (x - i);
    auto g = [&](int k) { return src[base + (((i + k) % fl) + fl) % fl]; };
    const float a = g(-1), b = g(0), c = g(1), d = g(2);
    return b + .5f * t * (c - a + t * (2 * a - 5 * b + 4 * c - d + t * (3 * (b - c) + d - a)));
}

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
    const double bendSemis = (ctl_.bend - .5) * 2.0 * lib_->play.bend;
    { int over = sounding() - limit(); while (over-- > 0 && stealOne()) {} }   // CPU guard lowered the limit
    for (auto& v : voices_) {
        if (!v.on) continue;
        float* dL = L; float* dR = R;
        if (fx) { fx::Stereo& s = fx->groupIn(v.group); dL = s.l; dR = s.r; }
        const ZoneAudio& a = *v.audio;
        Reader r0{ a.ch[0], a.len, a.loop, a.loopS, a.loopE }, r1{ a.ch[1] ? a.ch[1] : a.ch[0], a.len, a.loop, a.loopS, a.loopE };
        // pitch on top of the note: glide still to go plus the pitch wheel
        const double pm = (v.glide != 0.f || bendSemis != 0.0) && v.zone->keytrack ? std::pow(2.0, (v.glide + bendSemis) / 12.0) : 1.0;
        if (v.glide != 0.f) { const float mv = v.glideStep * (float) n; v.glide = std::fabs(v.glide) <= mv ? 0.f : v.glide - (v.glide > 0 ? mv : -mv); }
        const double ratio = v.ratio * pm;
        float eAi = 0, eDi = 0, eS = 1;
        if (v.adsr) { float a, d, s, r; groupEnv(v.group, a, d, s, r); (void) r; eS = s; eAi = a < .5f ? 2.f : 1.f / (float) (a / 1000.0 * sr_); eDi = d < .5f ? 2.f : (1.f - s) / (float) (d / 1000.0 * sr_); }
        const float x = v.pan <= 0 ? v.pan + 1 : v.pan, gL = std::cos(x * (float) kPi / 2), gR = std::sin(x * (float) kPi / 2), g = v.gain * gainScale;
        for (int i = 0; i < n; ++i) {
            if (!a.loop && v.pos >= (double) a.len) { v.on = false; break; }
            if (v.maxLife >= 0 && --v.maxLife < 0) kill(v, false);
            if (v.adsr && !v.releasing) {
                if (v.stage == 0) { v.env += eAi; if (v.env >= 1.f) { v.env = 1.f; v.stage = 1; } }
                else if (v.stage == 1) { v.env -= eDi; if (v.env <= eS) { v.env = eS; v.stage = 2; } }
                else v.env += (eS - v.env) * .002f;   // sustain follows its knob live, smoothly
            }
            if (v.attackInc > 0 && v.env < 1.f && !v.releasing) { v.env += v.attackInc; if (v.env > 1.f) v.env = 1.f; }
            if (v.releasing) { v.env -= v.relInc; if (v.env <= 0) { v.on = false; break; } }
            float l, rr, oL, oR;
            if (v.kind == 2) {
                /* granular (same grains as the JS core's cloud, but played live, so it never loops) */
                const Sample& s = *v.sample; const long N = (long) s.frames;
                const double gl = std::max(64.0, std::round(s.grSize / 1000.0 * s.sr)), step = std::max(1.0, std::round((double) s.sr / std::max(1.0, (double) s.grDensity)));
                while (v.gt >= v.nextSpawn) {
                    const int k = v.gk++; const double r1 = hash01(v.seed * 977 + k), r2 = hash01(v.seed * 313 + k * 7);
                    if (v.ngr < Voice::kMaxGrains) {
                        const double jit = std::pow(2.0, ((r2 * 2 - 1) * s.grJitter) / 1200);
                        const double p0 = std::min((double) std::max(0L, N - 2), std::max(0.0, s.grPos / 100.0 * N + (r1 * 2 - 1) * s.grSpread / 100.0 * N));
                        v.grains[v.ngr++] = { v.nextSpawn, p0, jit };
                    }
                    v.nextSpawn += step;
                }
                const double rate = v.pitch * pm; float gsL = 0, gsR = 0;
                for (int q = 0; q < v.ngr;) {
                    Voice::Grain& gr = v.grains[q]; const double i0 = v.gt - gr.o;
                    if (i0 >= gl) { gr = v.grains[--v.ngr]; continue; }
                    const double p = gr.p0 + i0 * rate * gr.rate; const long ip = (long) p;
                    if (i0 >= 0 && ip < N - 1) {
                        const float f = (float) (p - ip), t = (float) (i0 / gl);
                        const float w = s.grShape == 1 ? 1 - std::fabs(2 * t - 1) : s.grShape == 2 ? (t < .1f ? t * 10 : t > .9f ? (1 - t) * 10 : 1.f) : (float) (.5 - .5 * std::cos(2 * kPi * t));
                        gsL += (a.ch[0][ip] * (1 - f) + a.ch[0][ip + 1] * f) * w;
                        if (v.stereoIn) gsR += (a.ch[1][ip] * (1 - f) + a.ch[1][ip + 1] * f) * w;
                    }
                    ++q;
                }
                const float norm = (float) (std::sqrt(step / gl) * 1.4);
                l = gsL * norm; rr = v.stereoIn ? gsR * norm : l;
                v.gt += (double) s.sr / sr_;
            } else if (v.kind == 3) {
                /* wavetable oscillator: the frame position follows its knob live */
                const Sample& s = *v.sample; const int fl = s.wtFrame, nf = s.wtFrames;
                const float tv = s.wtTag >= 0 && lib_->tagValues ? lib_->tagValues[(size_t) s.wtTag].load() : s.wtPos / 100.f;
                const bool sweep = s.wtPos2 >= 0 && s.wtSweep > 0;
                const float tt = sweep ? (float) std::min(1.0, v.wms / s.wtSweep) : 0.f, pp = std::min(1.f, std::max(0.f, tv + (s.wtPos2 / 100.f - tv) * tt));
                const float x = pp * (nf - 1); const int f0 = std::min(nf - 1, (int) x), f1 = std::min(nf - 1, f0 + 1); const float fr = x - (float) f0;
                const float val = (cubicAt(a.ch[0], f0 * fl, fl, v.wph) * (1 - fr) + cubicAt(a.ch[0], f1 * fl, fl, v.wph) * fr) * s.wtGain * (v.wfade < 64 ? v.wfade / 64.f : 1.f);
                if (v.wfade < 64) ++v.wfade;
                l = rr = val;
                v.wph += v.wf * pm / sr_; v.wph -= std::floor(v.wph); v.wms += 1000.0 / sr_;
            } else if (!v.keepSpeed) { l = r0.read(v.pos, v.interp, ratio); rr = v.stereoIn ? r1.read(v.pos, v.interp, ratio) : l; }
            else {
                /* keep-speed (port of EmulonX's grain reader): WSOLA picks each new grain start where the waveform lines up */
                const int G = v.grain, h = G >> 1; const double step = ratio, k = v.k;
                auto align = [&](double target, double otherX) {
                    if (!v.wsola || std::abs(step - k) < 1e-9) return target;
                    constexpr int M = 32; float ref[M];
                    for (int j = 0; j < M; ++j) ref[j] = r0.read(otherX + 3.0 * j * step, Interp::Linear, 1);
                    const int range = std::max(8, (int) std::lround(std::min(.012 * v.sample->sr, .25 * G * k)));
                    auto score = [&](int d) { float ab = 0, bb = 1e-9f; for (int j = 0; j < M; ++j) { const float cnd = r0.read(target + d + 3.0 * j * step, Interp::Linear, 1); ab += ref[j] * cnd; bb += cnd * cnd; } return ab / std::sqrt(bb); };
                    int best = 0; float bs = -1e30f;
                    for (int d = -range; d <= range; d += 6) { const float s = score(d); if (s > bs) { bs = s; best = d; } }
                    const int coarse = best; for (int d = coarse - 5; d <= coarse + 5; ++d) { const float s = score(d); if (s > bs) { bs = s; best = d; } }
                    return target + best;
                };
                if (v.grainCounter == 0) v.read0 = align(v.pos, v.read1); else if (v.grainCounter == h) v.read1 = align(v.pos, v.read0);
                const double p0 = (double) v.grainCounter / G; const float sn = (float) std::sin(kPi * p0), w0 = sn * sn, w1 = 1 - w0;
                l = w0 * r0.read(v.read0, v.interp, step) + w1 * r0.read(v.read1, v.interp, step);
                rr = v.stereoIn ? w0 * r1.read(v.read0, v.interp, step) + w1 * r1.read(v.read1, v.interp, step) : l;
                v.read0 += step; v.read1 += step; if (++v.grainCounter >= G) v.grainCounter = 0;
            }
            if (!v.stereoIn) { const float m = std::cos((v.pan + 1) * (float) kPi / 4), m2 = std::sin((v.pan + 1) * (float) kPi / 4); oL = l * m; oR = l * m2; }
            else if (v.pan <= 0) { oL = l + rr * gL; oR = rr * gR; } else { oL = l * gL; oR = rr + l * gR; }
            const float e = g * v.env; dL[i] += oL * e; dR[i] += oR * e;
            v.pos += v.keepSpeed ? v.k : ratio;
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
