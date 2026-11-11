#include "HyperSynthProcessor.h"
#include "HyperSynthEditor.h"
#include "HyperSynthData.h"

#ifndef VISU_VERSION
#define VISU_VERSION "0.0.1"
#endif
#ifndef VISU_BUILD_ID
#define VISU_BUILD_ID "dev"
#endif

juce::String HyperSynthProcessor::versionText() { return juce::String(VISU_VERSION) + " (build " + VISU_BUILD_ID + ")"; }

static bool isWhole(const std::string& id)   // counted things: voices, octaves, partials, root keys
{
    auto ends = [&](const char* s) { const std::string t(s); return id.size() >= t.size() && id.compare(id.size() - t.size(), t.size(), t) == 0; };
    return id == "voices" || ends(".voices") || ends(".oct") || ends(".parts") || ends(".root");
}

HyperSynthProcessor::HyperSynthProcessor()
    : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
    for (const auto& d : visu::hs::params()) {
        juce::RangedAudioParameter* p = nullptr;
        if (!d.opts.empty()) {
            juce::StringArray o; for (const auto& s : d.opts) o.add(juce::String::fromUTF8(s.c_str()));
            p = new juce::AudioParameterChoice({ d.id, 1 }, d.name, o, (int) d.def);
        } else {
            juce::NormalisableRange<float> r(d.min, d.max, isWhole(d.id) ? 1.0f : 0.0f);
            if (d.log && d.min > 0) r.setSkewForCentre(std::sqrt(d.min * d.max));
            p = new juce::AudioParameterFloat({ d.id, 1 }, d.name, r, d.def, juce::AudioParameterFloatAttributes().withLabel(d.unit));
        }
        params_.push_back(p); addParameter(p);
    }
    sent_.assign(params_.size(), std::numeric_limits<float>::quiet_NaN());
    for (int m = 0; m < 4; ++m) macroIdx_[m] = indexOf("macro" + juce::String(m + 1));
    startTimerHz(10);
}

/* ---------- the FX tab: a NodeFX chain after the synth ---------- */
void HyperSynthProcessor::setFx(const juce::String& json, bool rebuild)
{
    { const juce::ScopedLock l(fxLock_); fxJson_ = json; }
    if (rebuild) rebuildFx();
}

void HyperSynthProcessor::rebuildFx()
{
    juce::String json; { const juce::ScopedLock l(fxLock_); json = fxJson_; }
    std::shared_ptr<visu::FxRack> r; std::string err;
    if (json.isNotEmpty()) r = visu::FxRack::build(json.toStdString(), sampleRate_, err);
    { const juce::ScopedLock l(fxLock_); fxError_ = juce::String(err); }
    if (json.isNotEmpty() && !r) return;   // a broken chain: keep playing the last good one
    if (r && r->empty()) r.reset();       // input straight to output: nothing to run
    const juce::SpinLock::ScopedLockType l(swapLock_); fxPending_ = std::move(r); fxHasPending_ = true;
}

void HyperSynthProcessor::queueFxParam(const juce::String& node, const juce::String& key, float value)
{
    const juce::SpinLock::ScopedLockType l(fxPushLock_);
    int s1, n1, s2, n2; fxFifo_.prepareToWrite(1, s1, n1, s2, n2);
    if (n1 + n2 < 1) return;
    auto& m = fxMsgs_[(size_t) (n1 ? s1 : s2)];
    node.copyToUTF8(m.node, sizeof m.node); key.copyToUTF8(m.key, sizeof m.key); m.value = value;
    fxFifo_.finishedWrite(1);
}

void HyperSynthProcessor::timerCallback()
{
    std::shared_ptr<visu::FxRack> old;
    { const juce::SpinLock::ScopedLockType l(swapLock_); old = std::move(fxRetired_); }   // freed here, not on the audio thread
    const int lat = fxLatency_.load();
    if (lat != getLatencySamples()) setLatencySamples(lat);
}

float HyperSynthProcessor::value(int i) const
{
    if (i < 0 || i >= (int) params_.size()) return 0;
    const auto* p = params_[(size_t) i];
    if (auto* c = dynamic_cast<const juce::AudioParameterChoice*>(p)) return (float) c->getIndex();
    return p->convertFrom0to1(p->getValue());
}

void HyperSynthProcessor::setFromUi(int i, float v)
{
    if (i < 0 || i >= (int) params_.size()) return;
    auto* p = params_[(size_t) i]; p->setValueNotifyingHost(p->convertTo0to1(v));
}
void HyperSynthProcessor::gesture(int i, bool begin)
{
    if (i < 0 || i >= (int) params_.size()) return;
    if (begin) params_[(size_t) i]->beginChangeGesture(); else params_[(size_t) i]->endChangeGesture();
}
void HyperSynthProcessor::uiNote(int key, float velocity, bool on)
{
    const auto w = fifo_.write(1);
    if (w.blockSize1 > 0) events_[(size_t) w.startIndex1] = { on ? 0 : 1, key, velocity };
}
void HyperSynthProcessor::uiBend(float v) { const auto w = fifo_.write(1); if (w.blockSize1 > 0) events_[(size_t) w.startIndex1] = { 2, 0, v }; }
void HyperSynthProcessor::uiMod(float v) { const auto w = fifo_.write(1); if (w.blockSize1 > 0) events_[(size_t) w.startIndex1] = { 3, 0, v }; }

bool HyperSynthProcessor::isBusesLayoutSupported(const BusesLayout& l) const
{
    const auto out = l.getMainOutputChannelSet();
    return out == juce::AudioChannelSet::stereo() || out == juce::AudioChannelSet::mono();
}

void HyperSynthProcessor::prepareToPlay(double sr, int)
{
    const bool changed = std::abs(sr - sampleRate_) > 1; sampleRate_ = sr;
    if (changed) rebuildFx();
    synth_.prepare(sr);
    std::fill(sent_.begin(), sent_.end(), std::numeric_limits<float>::quiet_NaN());
    for (auto& k : keysDown) k = false;
}

void HyperSynthProcessor::fxNote(int key, float velocity, bool on)
{
    auto& d = fxDown_[(size_t) (key & 127)];
    if (on) { if (!d) { d = true; ++fxHeld_; } if (fxCurrent_) fxCurrent_->noteOn(key, velocity * 127.f); }
    else if (d) { d = false; if (--fxHeld_ <= 0) { fxHeld_ = 0; if (fxCurrent_) fxCurrent_->noteOff(); } }
}

void HyperSynthProcessor::handle(const juce::MidiMessage& m)
{
    if (m.isNoteOn()) { synth_.noteOn(m.getNoteNumber(), m.getFloatVelocity()); keysDown[(size_t) m.getNoteNumber()] = true; fxNote(m.getNoteNumber(), m.getFloatVelocity(), true); }
    else if (m.isNoteOff()) { synth_.noteOff(m.getNoteNumber()); keysDown[(size_t) m.getNoteNumber()] = false; fxNote(m.getNoteNumber(), 0, false); }
    else if (m.isPitchWheel()) { const float b = (float) (m.getPitchWheelValue() - 8192) / 8192.0f; synth_.setBend(b); bendNow = b; }
    else if (m.isControllerOfType(1)) { const float v = (float) m.getControllerValue() / 127.0f; synth_.setModWheel(v); modNow = v; }
    else if (m.isChannelPressure()) { const float v = (float) m.getChannelPressureValue() / 127.0f; synth_.setAftertouch(v); atNow = v; }
    else if (m.isSustainPedalOn()) synth_.setSustain(true);
    else if (m.isSustainPedalOff()) synth_.setSustain(false);
    else if (m.isAllNotesOff() || m.isAllSoundOff()) { synth_.allNotesOff(m.isAllSoundOff()); for (auto& k : keysDown) k = false;
        fxDown_.fill(false); fxHeld_ = 0; if (fxCurrent_) fxCurrent_->noteOff(); }
}

void HyperSynthProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    if (fxHasPending_.load()) {   // a new effect chain from the FX tab or a preset
        const juce::SpinLock::ScopedTryLockType l(swapLock_);
        if (l.isLocked() && !fxRetired_) { fxRetired_ = std::move(fxCurrent_); fxCurrent_ = std::move(fxPending_); fxHasPending_ = false; }
    }
    double hostBpm = 120;
    if (auto* ph = getPlayHead()) if (auto pos = ph->getPosition()) if (auto b = pos->getBpm()) hostBpm = *b;
    synth_.setTempo(hostBpm);   // synced LFOs
    if (auto* rack = fxCurrent_.get()) {   // knobs moved on the FX tab
        int s1, n1, s2, n2; fxFifo_.prepareToRead(fxFifo_.getNumReady(), s1, n1, s2, n2);
        for (int k = 0; k < n1 + n2; ++k) { const auto& m = fxMsgs_[(size_t) (k < n1 ? s1 + k : s2 + k - n1)]; rack->setParam(m.node, m.key, m.value, false); }
        fxFifo_.finishedRead(n1 + n2);
        for (int m = 0; m < 4; ++m) rack->setTag(rack->macro[m], value(macroIdx_[m]));   // the FX tab's Macro modules follow HyperSynth's macros
        rack->setControllers(modNow.load(), atNow.load(), 1.f, bendNow.load());
        if (auto* ph = getPlayHead()) if (auto pos = ph->getPosition()) {
            double bpm = 120; int sn = 4, sd = 4;
            if (auto b = pos->getBpm()) bpm = *b;
            if (auto ts = pos->getTimeSignature()) { sn = ts->numerator; sd = ts->denominator; }
            rack->setTempo(bpm, sn, sd);
        }
    } else { int s1, n1, s2, n2; fxFifo_.prepareToRead(fxFifo_.getNumReady(), s1, n1, s2, n2); fxFifo_.finishedRead(n1 + n2); }
    for (size_t i = 0; i < params_.size(); ++i) {   // the knobs, automation and presets reach the engine here
        const float v = value((int) i);
        if (!(v == sent_[i])) { synth_.setParam((int) i, v); sent_[i] = v; }
    }
    {   // the panel's keyboard, wheels and ribbon
        const auto r = fifo_.read(fifo_.getNumReady());
        auto run = [&](int start, int size) { for (int k = 0; k < size; ++k) { const auto& e = events_[(size_t) (start + k)];
            if (e.type == 0) { synth_.noteOn(e.key, e.value); keysDown[(size_t) (e.key & 127)] = true; fxNote(e.key, e.value, true); }
            else if (e.type == 1) { synth_.noteOff(e.key); keysDown[(size_t) (e.key & 127)] = false; fxNote(e.key, 0, false); }
            else if (e.type == 2) { synth_.setBend(e.value); bendNow = e.value; }
            else { synth_.setModWheel(e.value); modNow = e.value; } } };
        run(r.startIndex1, r.blockSize1); run(r.startIndex2, r.blockSize2);
    }
    const int n = buffer.getNumSamples(); const int chans = buffer.getNumChannels();
    float* l = buffer.getWritePointer(0); float* r = chans > 1 ? buffer.getWritePointer(1) : nullptr;
    std::vector<float> tmp; float* rr = r;
    if (!rr) { tmp.resize((size_t) n); rr = tmp.data(); }
    int at = 0;
    for (const auto meta : midi) {   // sample-accurate: play up to each event, then apply it
        const int pos = juce::jlimit(0, n, meta.samplePosition);
        if (pos > at) { synth_.process(l + at, rr + at, pos - at); at = pos; }
        handle(meta.getMessage());
    }
    if (n > at) synth_.process(l + at, rr + at, n - at);
    if (auto* rack = fxCurrent_.get()) { rack->process(l, rr, n); fxLatency_ = rack->latency(); } else fxLatency_ = 0;
    if (!r) for (int i = 0; i < n; ++i) l[i] = .5f * (l[i] + rr[i]);
    for (int c = 2; c < chans; ++c) buffer.clear(c, 0, n);
    activeVoices = synth_.activeVoices();
}

/* ---------- state and presets: the same .hsyn text ---------- */
void HyperSynthProcessor::copyTables(const visu::hs::Synth& from, visu::hs::Synth& to) const
{
    for (int L = 0; L < 2; ++L) for (int k = 0; k < 3; ++k) {
        std::vector<float> fr; std::string nm;
        if (from.customTable(L, k, &fr, &nm)) to.setCustomTable(L, k, fr, nm); else to.clearCustomTable(L, k);
    }
    for (int L = 0; L < 2; ++L) for (int k = 0; k < 3; ++k) {
        std::vector<float> l, r; double rate = 0; std::string nm;
        if (from.sample(L, k, &l, &r, &rate, &nm)) to.setSample(L, k, l, r, rate, nm); else to.clearSample(L, k);
    }
    to.setMods(from.mods());
    for (int l = 0; l < visu::hs::Synth::kLfos; ++l) to.setLfoShape(l, from.lfoShape(l));
    for (int m = 0; m < visu::hs::Synth::kMacros; ++m) to.setMacroName(m, from.macroName(m));
}

juce::String HyperSynthProcessor::stateJson(const juce::String& name, const juce::String& category) const
{
    visu::hs::Synth s;
    for (int i = 0; i < (int) params_.size(); ++i) s.setParam(i, value(i));
    copyTables(synth_, s);   // imported wavetables travel with the preset and the project
    auto j = juce::String::fromUTF8(s.presetJson(name.toStdString(), category.toStdString()).c_str()).trimEnd();
    const auto fx = fxJson();   // the effects ride along as "fx" (the engine ignores keys it doesn't know)
    if (fx.isNotEmpty() && j.endsWithChar('}')) j = j.dropLastCharacters(1).trimEnd() + ",\n  \"fx\": " + fx + "\n}";
    return j;
}

bool HyperSynthProcessor::applyJson(const juce::String& json, juce::String* error)
{
    visu::hs::Synth s; std::string err, name, cat;
    if (!s.loadPreset(json.toStdString(), &err, &name, &cat)) { if (error) *error = juce::String(err); return false; }
    for (int i = 0; i < (int) params_.size(); ++i) setFromUi(i, s.param(i));
    copyTables(s, synth_);
    {   // a preset from before the FX tab (no "fx") plays with no effects, as it did
        const auto v = juce::JSON::parse(json); const auto fx = v.getProperty("fx", juce::var());
        setFx(fx.isObject() ? juce::JSON::toString(fx, true) : juce::String(), true);
    }
    setNames(juce::String::fromUTF8(name.c_str()), juce::String::fromUTF8(cat.c_str()));
    return true;
}

void HyperSynthProcessor::getStateInformation(juce::MemoryBlock& dest)
{
    const auto j = stateJson(presetName(), presetCategory());
    dest.replaceAll(j.toRawUTF8(), j.getNumBytesAsUTF8());
}
void HyperSynthProcessor::setStateInformation(const void* data, int size)
{
    applyJson(juce::String::fromUTF8(static_cast<const char*>(data), size), nullptr);
}

juce::var HyperSynthProcessor::paramDefs() const
{
    juce::Array<juce::var> out;
    for (const auto& d : visu::hs::params()) {
        auto* o = new juce::DynamicObject();
        o->setProperty("id", juce::String(d.id)); o->setProperty("name", juce::String(d.name)); o->setProperty("unit", juce::String(d.unit));
        o->setProperty("min", d.min); o->setProperty("max", d.max); o->setProperty("def", d.def); o->setProperty("log", d.log); o->setProperty("whole", isWhole(d.id));
        juce::Array<juce::var> opts; for (const auto& s : d.opts) opts.add(juce::String::fromUTF8(s.c_str())); o->setProperty("opts", opts);
        out.add(juce::var(o));
    }
    return out;
}
juce::var HyperSynthProcessor::values() const { juce::Array<juce::var> v; for (int i = 0; i < (int) params_.size(); ++i) v.add(value(i)); return v; }

juce::File HyperSynthProcessor::presetFolder()
{
    return juce::File::getSpecialLocation(juce::File::userDocumentsDirectory).getChildFile("VisuSampler").getChildFile("HyperSynth Presets");
}
static juce::String safeName(juce::String s) { s = s.removeCharacters("<>:\"/\\|?*").trim(); return s.isEmpty() ? juce::String("Untitled") : s.substring(0, 80); }
static juce::var factory() { return juce::JSON::parse(juce::String::fromUTF8(hypersynth::factoryPresets_json, hypersynth::factoryPresets_jsonSize)); }

juce::var HyperSynthProcessor::listPresets() const
{
    juce::Array<juce::var> out;
    if (auto* a = factory().getArray()) for (const auto& p : *a) {
        auto* o = new juce::DynamicObject(); o->setProperty("id", "f:" + p["category"].toString() + "/" + p["name"].toString());
        o->setProperty("name", p["name"]); o->setProperty("category", p["category"]); o->setProperty("factory", true); out.add(juce::var(o));
    }
    const auto root = presetFolder();
    auto files = root.findChildFiles(juce::File::findFiles, true, "*.hsyn"); files.sort();
    for (const auto& f : files) {
        auto* o = new juce::DynamicObject(); o->setProperty("id", "u:" + f.getRelativePathFrom(root).replaceCharacter('\\', '/'));
        o->setProperty("name", f.getFileNameWithoutExtension());
        o->setProperty("category", f.getParentDirectory() == root ? juce::String("User") : f.getParentDirectory().getFileName());
        o->setProperty("factory", false); out.add(juce::var(o));
    }
    return out;
}

juce::var HyperSynthProcessor::loadPreset(const juce::String& id)
{
    juce::String json, err;
    if (id.startsWith("f:")) {
        if (auto* a = factory().getArray()) for (const auto& p : *a)
            if ("f:" + p["category"].toString() + "/" + p["name"].toString() == id) {
                auto* o = new juce::DynamicObject(); o->setProperty("format", "hsyn"); o->setProperty("v", 1);
                o->setProperty("name", p["name"]); o->setProperty("category", p["category"]); o->setProperty("params", p["params"]);
                for (auto* k : { "mods", "lfoShapes", "macroNames", "fx" }) if (p.hasProperty(k)) o->setProperty(k, p[k]);   // modulation and effects
                json = juce::JSON::toString(juce::var(o), true);
            }
    } else if (id.startsWith("u:") && !id.contains("..")) {
        const auto f = presetFolder().getChildFile(id.substring(2));
        if (f.existsAsFile() && f.isAChildOf(presetFolder())) json = f.loadFileAsString();
    }
    auto* o = new juce::DynamicObject();
    if (json.isEmpty()) { o->setProperty("error", "preset not found"); return juce::var(o); }
    if (!applyJson(json, &err)) { o->setProperty("error", err); return juce::var(o); }
    o->setProperty("name", presetName()); o->setProperty("category", presetCategory()); o->setProperty("values", values());
    return juce::var(o);
}

juce::var HyperSynthProcessor::savePreset(const juce::String& name, const juce::String& category)
{
    auto* o = new juce::DynamicObject();
    auto dir = presetFolder().getChildFile(safeName(category.trim().isEmpty() ? juce::String("User") : category));
    if (!dir.createDirectory()) { o->setProperty("error", "could not make the folder " + dir.getFullPathName()); return juce::var(o); }
    const auto f = dir.getChildFile(safeName(name) + ".hsyn");
    setNames(safeName(name), dir.getFileName());
    if (!f.replaceWithText(stateJson(presetName(), presetCategory()))) { o->setProperty("error", "could not write " + f.getFullPathName()); return juce::var(o); }
    o->setProperty("id", "u:" + f.getRelativePathFrom(presetFolder()).replaceCharacter('\\', '/'));
    return juce::var(o);
}

bool HyperSynthProcessor::deletePreset(const juce::String& id)
{
    if (!id.startsWith("u:") || id.contains("..")) return false;
    const auto f = presetFolder().getChildFile(id.substring(2));
    return f.isAChildOf(presetFolder()) && f.hasFileExtension("hsyn") && f.deleteFile();
}

/* ---------- wavetable import ---------- */
static int clmFrameSize(const juce::File& f)   // Serum / Vital wavetable .wav files say their frame size in a "clm " chunk ("<!>2048 ...")
{
    juce::FileInputStream in(f); if (!in.openedOk()) return 0;
    char hdr[12]; if (in.read(hdr, 12) != 12 || std::memcmp(hdr, "RIFF", 4) != 0 || std::memcmp(hdr + 8, "WAVE", 4) != 0) return 0;
    for (int guard = 0; guard < 64 && !in.isExhausted(); ++guard) {
        char id[4]; if (in.read(id, 4) != 4) break; const auto size = (juce::uint32) in.readInt();
        if (std::memcmp(id, "clm ", 4) == 0) { juce::MemoryBlock mb; in.readIntoMemoryBlock(mb, (int) juce::jmin<juce::uint32>(size, 256));
            const auto txt = mb.toString(); const int at = txt.indexOf("<!>"); return at >= 0 ? txt.substring(at + 3).getIntValue() : 0; }
        if (!in.setPosition(in.getPosition() + size + (size & 1))) break;
    }
    return 0;
}

void HyperSynthProcessor::importTable(int layer, int osc, std::function<void(juce::var)> done)
{
    chooser_ = std::make_unique<juce::FileChooser>("Import a wavetable or any sound", juce::File::getSpecialLocation(juce::File::userDocumentsDirectory), "*.wav;*.aif;*.aiff;*.flac;*.ogg;*.mp3");
    chooser_->launchAsync(juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles, [this, layer, osc, done](const juce::FileChooser& fc) {
        auto* o = new juce::DynamicObject(); const auto f = fc.getResult();
        if (!f.existsAsFile()) { o->setProperty("cancelled", true); done(juce::var(o)); return; }
        juce::AudioFormatManager fm; fm.registerBasicFormats();
        std::unique_ptr<juce::AudioFormatReader> r(fm.createReaderFor(f));
        if (!r) { o->setProperty("error", "HyperSynth can't read " + f.getFileName()); done(juce::var(o)); return; }
        const auto n = (int) juce::jmin<juce::int64>(r->lengthInSamples, (juce::int64) (r->sampleRate * 120));   // up to 2 minutes
        juce::AudioBuffer<float> buf((int) r->numChannels, n); r->read(&buf, 0, n, 0, true, true);
        std::vector<float> mono((size_t) n, 0.f);
        for (int c = 0; c < buf.getNumChannels(); ++c) { const float* d = buf.getReadPointer(c); for (int i = 0; i < n; ++i) mono[(size_t) i] += d[i] / (float) buf.getNumChannels(); }
        std::string how; const int clm = clmFrameSize(f);
        const auto frames = visu::hs::framesFromAudio(mono.data(), mono.size(), r->sampleRate, clm, &how, 128);
        const auto name = f.getFileNameWithoutExtension();
        if (frames.empty() || !synth_.setCustomTable(layer, osc, frames, name.toStdString())) { o->setProperty("error", juce::String(how.empty() ? "nothing usable in that file" : how)); done(juce::var(o)); return; }
        const juce::String p = "l" + juce::String(layer + 1) + ".o" + juce::String(osc + 1) + ".";
        setFromUi(indexOf(p + "mode"), 0); setFromUi(indexOf(p + "wtsrc"), 1);
        o->setProperty("name", name); o->setProperty("how", juce::String(how)); o->setProperty("preview", tablePreview(layer, osc)); o->setProperty("values", values());
        done(juce::var(o));
    });
}

void HyperSynthProcessor::importSample(int layer, int osc, std::function<void(juce::var)> done)
{
    chooser_ = std::make_unique<juce::FileChooser>("A sound for Sample mode", juce::File::getSpecialLocation(juce::File::userDocumentsDirectory), "*.wav;*.aif;*.aiff;*.flac;*.ogg;*.mp3");
    chooser_->launchAsync(juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles, [this, layer, osc, done](const juce::FileChooser& fc) {
        auto* o = new juce::DynamicObject(); const auto f = fc.getResult();
        if (!f.existsAsFile()) { o->setProperty("cancelled", true); done(juce::var(o)); return; }
        juce::AudioFormatManager fm; fm.registerBasicFormats();
        std::unique_ptr<juce::AudioFormatReader> r(fm.createReaderFor(f));
        if (!r) { o->setProperty("error", "HyperSynth can't read " + f.getFileName()); done(juce::var(o)); return; }
        const auto n = (int) juce::jmin<juce::int64>(r->lengthInSamples, (juce::int64) (r->sampleRate * 30));   // up to 30 s
        juce::AudioBuffer<float> buf((int) juce::jmin(2u, r->numChannels), n); r->read(&buf, 0, n, 0, true, buf.getNumChannels() > 1);
        std::vector<float> L(buf.getReadPointer(0), buf.getReadPointer(0) + n), R, mono(L);
        if (buf.getNumChannels() > 1) { R.assign(buf.getReadPointer(1), buf.getReadPointer(1) + n); for (int i = 0; i < n; ++i) mono[(size_t) i] = .5f * (L[(size_t) i] + R[(size_t) i]); }
        const auto name = f.getFileNameWithoutExtension();
        if (!synth_.setSample(layer, osc, L, R, r->sampleRate, name.toStdString())) { o->setProperty("error", "the sound is too short"); done(juce::var(o)); return; }
        const double key = visu::hs::detectKey(mono.data(), mono.size(), r->sampleRate);
        const juce::String p = "l" + juce::String(layer + 1) + ".o" + juce::String(osc + 1) + ".";
        setFromUi(indexOf(p + "mode"), 2); setFromUi(indexOf(p + "smp.start"), 0);
        if (key >= 0) setFromUi(indexOf(p + "smp.root"), (float) juce::jlimit(0, 127, (int) std::lround(key)));
        static const char* nn[] = { "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B" };
        o->setProperty("name", name);
        o->setProperty("how", key >= 0 ? juce::String("root ") + nn[(int) std::lround(key) % 12] + juce::String((int) std::lround(key) / 12 - 1) + " found" : juce::String("no clear pitch: root C4"));
        o->setProperty("preview", samplePreview(layer, osc)); o->setProperty("values", values());
        done(juce::var(o));
    });
}

juce::var HyperSynthProcessor::samplePreview(int layer, int osc) const
{
    std::vector<float> l, r; double rate = 0; std::string nm;
    if (!synth_.sample(layer, osc, &l, &r, &rate, &nm) || l.empty()) return {};
    juce::Array<juce::var> peaks; const size_t W = 300;
    for (size_t b = 0; b < W; ++b) { const size_t a0 = l.size() * b / W, a1 = std::max(a0 + 1, l.size() * (b + 1) / W); float mx = -1, mn = 1;
        for (size_t i = a0; i < a1 && i < l.size(); ++i) { const float v = r.empty() ? l[i] : .5f * (l[i] + r[i]); mx = std::max(mx, v); mn = std::min(mn, v); }
        peaks.add(mx); peaks.add(mn); }
    auto* o = new juce::DynamicObject(); o->setProperty("name", juce::String::fromUTF8(nm.c_str())); o->setProperty("seconds", (double) l.size() / rate);
    o->setProperty("ch", r.empty() ? 1 : 2); o->setProperty("peaks", peaks);
    return juce::var(o);
}

juce::var HyperSynthProcessor::tablePreview(int layer, int osc) const
{
    std::vector<float> fr; std::string nm;
    if (!synth_.customTable(layer, osc, &fr, &nm)) return {};
    const int F = (int) (fr.size() / 2048), show = juce::jmin(F, 24);
    juce::Array<juce::var> frames;
    for (int s = 0; s < show; ++s) {
        const int f = show == 1 ? 0 : s * (F - 1) / (show - 1); juce::Array<juce::var> pts;
        for (int i = 0; i < 128; ++i) pts.add(fr[(size_t) f * 2048 + (size_t) i * 16]);
        frames.add(pts);
    }
    auto* o = new juce::DynamicObject(); o->setProperty("name", juce::String::fromUTF8(nm.c_str())); o->setProperty("count", F); o->setProperty("frames", frames);
    return juce::var(o);
}

/* ---------- modulation, for the panel ---------- */
juce::var HyperSynthProcessor::modState() const
{
    juce::Array<juce::var> routes, shapes, names;
    for (const auto& r : synth_.mods()) { auto* o = new juce::DynamicObject(); o->setProperty("src", juce::String(r.src)); o->setProperty("dst", juce::String(r.dst)); o->setProperty("amt", r.amt); routes.add(juce::var(o)); }
    for (int l = 0; l < visu::hs::Synth::kLfos; ++l) { juce::Array<juce::var> p; for (float x : synth_.lfoShape(l)) p.add(x); shapes.add(p); }
    for (int m = 0; m < visu::hs::Synth::kMacros; ++m) names.add(juce::String::fromUTF8(synth_.macroName(m).c_str()));
    auto* o = new juce::DynamicObject(); o->setProperty("routes", routes); o->setProperty("shapes", shapes); o->setProperty("names", names);
    return juce::var(o);
}
void HyperSynthProcessor::setMods(const juce::var& routes)
{
    std::vector<visu::hs::ModRoute> r;
    if (auto* a = routes.getArray()) for (const auto& x : *a) r.push_back({ x["src"].toString().toStdString(), x["dst"].toString().toStdString(), (float) (double) x["amt"] });
    synth_.setMods(r);
}
void HyperSynthProcessor::setLfoShape(int lfo, const juce::var& pts)
{
    std::vector<float> p; if (auto* a = pts.getArray()) for (const auto& x : *a) p.push_back((float) (double) x);
    synth_.setLfoShape(lfo, p);
}
void HyperSynthProcessor::setMacroName(int i, const juce::String& name) { synth_.setMacroName(i, name.toStdString()); }

juce::AudioProcessorEditor* HyperSynthProcessor::createEditor() { return new HyperSynthEditor(*this); }

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new HyperSynthProcessor(); }
