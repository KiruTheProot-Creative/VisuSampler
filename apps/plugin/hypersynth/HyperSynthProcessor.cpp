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

static bool isWhole(const std::string& id)   // counted things: voices, octaves
{
    auto ends = [&](const char* s) { const std::string t(s); return id.size() >= t.size() && id.compare(id.size() - t.size(), t.size(), t) == 0; };
    return id == "voices" || ends(".voices") || ends(".oct");
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
    synth_.prepare(sr);
    std::fill(sent_.begin(), sent_.end(), std::numeric_limits<float>::quiet_NaN());
    for (auto& k : keysDown) k = false;
}

void HyperSynthProcessor::handle(const juce::MidiMessage& m)
{
    if (m.isNoteOn()) { synth_.noteOn(m.getNoteNumber(), m.getFloatVelocity()); keysDown[(size_t) m.getNoteNumber()] = true; }
    else if (m.isNoteOff()) { synth_.noteOff(m.getNoteNumber()); keysDown[(size_t) m.getNoteNumber()] = false; }
    else if (m.isPitchWheel()) { const float b = (float) (m.getPitchWheelValue() - 8192) / 8192.0f; synth_.setBend(b); bendNow = b; }
    else if (m.isControllerOfType(1)) { const float v = (float) m.getControllerValue() / 127.0f; synth_.setModWheel(v); modNow = v; }
    else if (m.isSustainPedalOn()) synth_.setSustain(true);
    else if (m.isSustainPedalOff()) synth_.setSustain(false);
    else if (m.isAllNotesOff() || m.isAllSoundOff()) { synth_.allNotesOff(m.isAllSoundOff()); for (auto& k : keysDown) k = false; }
}

void HyperSynthProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    for (size_t i = 0; i < params_.size(); ++i) {   // the knobs, automation and presets reach the engine here
        const float v = value((int) i);
        if (!(v == sent_[i])) { synth_.setParam((int) i, v); sent_[i] = v; }
    }
    {   // the panel's keyboard, wheels and ribbon
        const auto r = fifo_.read(fifo_.getNumReady());
        auto run = [&](int start, int size) { for (int k = 0; k < size; ++k) { const auto& e = events_[(size_t) (start + k)];
            if (e.type == 0) { synth_.noteOn(e.key, e.value); keysDown[(size_t) (e.key & 127)] = true; }
            else if (e.type == 1) { synth_.noteOff(e.key); keysDown[(size_t) (e.key & 127)] = false; }
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
    if (!r) for (int i = 0; i < n; ++i) l[i] = .5f * (l[i] + rr[i]);
    for (int c = 2; c < chans; ++c) buffer.clear(c, 0, n);
    activeVoices = synth_.activeVoices();
}

/* ---------- state and presets: the same .hsyn text ---------- */
juce::String HyperSynthProcessor::stateJson(const juce::String& name, const juce::String& category) const
{
    visu::hs::Synth s;
    for (int i = 0; i < (int) params_.size(); ++i) s.setParam(i, value(i));
    return juce::String::fromUTF8(s.presetJson(name.toStdString(), category.toStdString()).c_str());
}

bool HyperSynthProcessor::applyJson(const juce::String& json, juce::String* error)
{
    visu::hs::Synth s; std::string err, name, cat;
    if (!s.loadPreset(json.toStdString(), &err, &name, &cat)) { if (error) *error = juce::String(err); return false; }
    for (int i = 0; i < (int) params_.size(); ++i) setFromUi(i, s.param(i));
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

juce::AudioProcessorEditor* HyperSynthProcessor::createEditor() { return new HyperSynthEditor(*this); }

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new HyperSynthProcessor(); }
