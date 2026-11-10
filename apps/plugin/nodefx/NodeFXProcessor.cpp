#include "NodeFXProcessor.h"
#include "NodeFXEditor.h"
#include "NodeFXData.h"

#ifndef VISU_VERSION
#define VISU_VERSION "0.0.1"
#endif
#ifndef VISU_BUILD_ID
#define VISU_BUILD_ID "dev"
#endif

juce::String NodeFXProcessor::versionText() { return juce::String(VISU_VERSION) + " (build " + VISU_BUILD_ID + ")"; }

NodeFXProcessor::MacroParam::MacroParam(int i)
    : juce::AudioParameterFloat({ "macro" + juce::String(i + 1), 1 }, "Macro " + juce::String(i + 1), 0.0f, 1.0f, 0.0f), label_("Macro " + juce::String(i + 1)) {}
juce::String NodeFXProcessor::MacroParam::getName(int n) const { const juce::SpinLock::ScopedLockType l(lock_); return label_.substring(0, n); }

NodeFXProcessor::NodeFXProcessor()
    : AudioProcessor(BusesProperties().withInput("Input", juce::AudioChannelSet::stereo(), true).withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
    for (int i = 0; i < kMacros; ++i) { macros_[(size_t) i] = new MacroParam(i); addParameter(macros_[(size_t) i]); macros_[(size_t) i]->addListener(this); }
    mix_ = new juce::AudioParameterFloat({ "mix", 1 }, "Mix", 0.0f, 1.0f, 1.0f);
    out_ = new juce::AudioParameterFloat({ "output", 1 }, "Output", juce::NormalisableRange<float>(-24.0f, 12.0f, 0.1f), 0.0f);
    addParameter(mix_); addParameter(out_);
    startTimerHz(10);
}

NodeFXProcessor::~NodeFXProcessor() { for (auto* m : macros_) if (m) m->removeListener(this); stopTimer(); }

bool NodeFXProcessor::isBusesLayoutSupported(const BusesLayout& l) const
{
    const auto in = l.getMainInputChannelSet(), out = l.getMainOutputChannelSet();
    if (out != juce::AudioChannelSet::stereo() && out != juce::AudioChannelSet::mono()) return false;
    return in == out || (in == juce::AudioChannelSet::mono() && out == juce::AudioChannelSet::stereo());
}

void NodeFXProcessor::prepareToPlay(double sr, int maxBlock)
{
    const bool changed = std::abs(sr - sampleRate_) > 1 || !current_;
    sampleRate_ = sr;
    dry_.setSize(2, std::max(1, maxBlock), false, false, true);
    dryLine_.setSize(2, kDryLine, false, true, false); dryW_ = 0;
    mixS_.reset(sr, .03); gainS_.reset(sr, .03);
    mixS_.setCurrentAndTargetValue(mix_->get()); gainS_.setCurrentAndTargetValue(juce::Decibels::decibelsToGain(out_->get()));
    if (changed) rebuild();
}

void NodeFXProcessor::rebuild()
{
    juce::String json; { const juce::ScopedLock l(stateLock_); json = rackJson_; }
    if (json.isEmpty()) return;
    std::string err;
    auto r = visu::FxRack::build(json.toStdString(), sampleRate_, err);
    { const juce::ScopedLock l(stateLock_); error_ = juce::String(err); }
    if (!r) return;
    for (int i = 0; i < kMacros; ++i) r->setTag(r->macro[i], macros_[(size_t) i]->get());
    { const juce::SpinLock::ScopedLockType l(swapLock_); pending_ = std::move(r); hasPending_ = true; }
}

void NodeFXProcessor::setRack(const juce::String& json, bool rebuildNow)
{
    { const juce::ScopedLock l(stateLock_); rackJson_ = json; }
    macroNamesFrom(json);
    if (rebuildNow) rebuild();
}

void NodeFXProcessor::macroNamesFrom(const juce::String& json)
{
    const auto v = juce::JSON::parse(json);
    if (auto* tags = v["tags"].getArray()) {
        for (const auto& t : *tags) {
            const auto id = t["id"].toString();
            if (id.startsWith("m")) { const int i = id.substring(1).getIntValue() - 1; if (i >= 0 && i < kMacros) macros_[(size_t) i]->setLabel(t["name"].toString()); }
        }
        updateHostDisplay(juce::AudioProcessorListener::ChangeDetails().withParameterInfoChanged(true));
    }
}

void NodeFXProcessor::queueParam(const juce::String& node, const juce::String& key, float value, bool sync)
{
    const juce::SpinLock::ScopedLockType l(pushLock_);
    int s1, n1, s2, n2; fifo_.prepareToWrite(1, s1, n1, s2, n2);
    if (n1 + n2 < 1) return;   // the audio thread is far behind: the next chain rebuild carries the value anyway
    auto& m = msgs_[(size_t) (n1 ? s1 : s2)];
    node.copyToUTF8(m.node, sizeof m.node); key.copyToUTF8(m.key, sizeof m.key); m.value = value; m.sync = sync;
    fifo_.finishedWrite(1);
}

void NodeFXProcessor::setMacroFromUi(int i, float v) { if (i >= 0 && i < kMacros) macros_[(size_t) i]->setValueNotifyingHost(juce::jlimit(0.f, 1.f, v)); }
void NodeFXProcessor::setMacroName(int i, const juce::String& name)
{
    if (i < 0 || i >= kMacros) return;
    macros_[(size_t) i]->setLabel(name);
    updateHostDisplay(juce::AudioProcessorListener::ChangeDetails().withParameterInfoChanged(true));
}
void NodeFXProcessor::setGlobalFromUi(const juce::String& w, float v)
{
    if (w == "mix") mix_->setValueNotifyingHost(juce::jlimit(0.f, 1.f, v));
    else if (w == "out") out_->setValueNotifyingHost(out_->convertTo0to1(juce::jlimit(-24.f, 12.f, v)));
}

void NodeFXProcessor::parameterValueChanged(int index, float value)
{
    if (index < 0 || index >= kMacros) return;
    // a macro moved (by the host or the window): the chain reads it from the atomic tag value, safe on any thread
    const juce::SpinLock::ScopedTryLockType l(swapLock_);
    if (l.isLocked() && current_) current_->setTag(current_->macro[index], value);
}

void NodeFXProcessor::timerCallback()
{
    std::shared_ptr<visu::FxRack> old;
    { const juce::SpinLock::ScopedLockType l(swapLock_); old = std::move(retired_); }
    // `old` is freed here, on the message thread
    const int lat = latNow_.load();
    if (lat != getLatencySamples()) setLatencySamples(lat);   // the DAW moves the track earlier to make up for lookahead
}

void NodeFXProcessor::processBlock(juce::AudioBuffer<float>& buf, juce::MidiBuffer&)
{
    juce::ScopedNoDenormals nd;
    const int n = buf.getNumSamples(), inCh = getTotalNumInputChannels(), outCh = getTotalNumOutputChannels();
    if (hasPending_.load()) {
        const juce::SpinLock::ScopedTryLockType l(swapLock_);
        if (l.isLocked() && pending_ && !retired_) { retired_ = std::move(current_); current_ = std::move(pending_); hasPending_ = false; }
    }
    auto* rack = current_.get();
    if (rack) {   // parameter moves from the editor
        int s1, n1, s2, n2; fifo_.prepareToRead(fifo_.getNumReady(), s1, n1, s2, n2);
        for (int k = 0; k < n1 + n2; ++k) { const auto& m = msgs_[(size_t) (k < n1 ? s1 + k : s2 + k - n1)]; rack->setParam(m.node, m.key, m.value, m.sync); }
        fifo_.finishedRead(n1 + n2);
        for (int i = 0; i < kMacros; ++i) rack->setTag(rack->macro[i], macros_[(size_t) i]->get());
        if (auto* ph = getPlayHead()) if (auto pos = ph->getPosition()) {
            double bpm = 120; int sn = 4, sd = 4;
            if (auto b = pos->getBpm()) bpm = *b;
            if (auto ts = pos->getTimeSignature()) { sn = ts->numerator; sd = ts->denominator; }
            rack->setTempo(bpm, sn, sd);
        }
    }
    if (inCh == 1 && outCh == 2) buf.copyFrom(1, 0, buf, 0, 0, n);   // mono in: both sides hear it
    float* l = buf.getWritePointer(0);
    float* r = buf.getWritePointer(outCh > 1 ? 1 : 0);
    mixS_.setTargetValue(mix_->get()); gainS_.setTargetValue(juce::Decibels::decibelsToGain(out_->get()));
    const int lat = rack ? std::min(rack->latency(), kDryLine - 1) : 0; latNow_.store(lat);
    for (int at = 0; at < n; ) {   // in pieces as big as the dry buffer (hosts may send more than they announced)
        const int m = std::min(n - at, dry_.getNumSamples());
        {   // the dry signal, as late as the chain's output
            float* ll = dryLine_.getWritePointer(0); float* lr = dryLine_.getWritePointer(1); float* d0 = dry_.getWritePointer(0); float* d1 = dry_.getWritePointer(1);
            for (int i = 0; i < m; ++i) { ll[dryW_] = l[at + i]; lr[dryW_] = r[at + i]; const int rd = (dryW_ - lat + kDryLine) % kDryLine; d0[i] = ll[rd]; d1[i] = lr[rd]; dryW_ = (dryW_ + 1) % kDryLine; }
        }
        if (rack) {
            if (outCh > 1) rack->process(l + at, r + at, m);
            else { float* tmp = dry_.getWritePointer(1); juce::FloatVectorOperations::copy(tmp, l + at, m); rack->process(l + at, tmp, m); }
        }
        const float* dl = dry_.getReadPointer(0); const float* dr = dry_.getReadPointer(outCh > 1 ? 1 : 0);
        for (int i = 0; i < m; ++i) {
            const float w = mixS_.getNextValue(), g = gainS_.getNextValue();
            l[at + i] = (dl[i] + (l[at + i] - dl[i]) * w) * g;
            if (outCh > 1) r[at + i] = (dr[i] + (r[at + i] - dr[i]) * w) * g;
        }
        at += m;
    }
    for (int c = std::max(outCh, 2); c < buf.getNumChannels(); ++c) buf.clear(c, 0, n);
}

void NodeFXProcessor::getStateInformation(juce::MemoryBlock& dest)
{
    juce::XmlElement x("NodeFXState");
    x.setAttribute("version", 1);
    { const juce::ScopedLock l(stateLock_); x.setAttribute("rack", rackJson_); }
    for (int i = 0; i < kMacros; ++i) x.setAttribute("macro" + juce::String(i + 1), (double) macros_[(size_t) i]->get());
    x.setAttribute("mix", (double) mix_->get()); x.setAttribute("out", (double) out_->get());
    copyXmlToBinary(x, dest);
}

void NodeFXProcessor::setStateInformation(const void* data, int size)
{
    auto x = getXmlFromBinary(data, size);
    if (!x || !x->hasTagName("NodeFXState")) return;
    for (int i = 0; i < kMacros; ++i) *static_cast<juce::AudioParameterFloat*>(macros_[(size_t) i]) = (float) x->getDoubleAttribute("macro" + juce::String(i + 1), 0);
    *mix_ = (float) x->getDoubleAttribute("mix", 1); *out_ = (float) x->getDoubleAttribute("out", 0);
    setRack(x->getStringAttribute("rack"), true);
}

/* ---------- presets ---------- */
juce::File NodeFXProcessor::presetFolder()
{
    return juce::File::getSpecialLocation(juce::File::userDocumentsDirectory).getChildFile("VisuSampler").getChildFile("NodeFX Presets");
}
static juce::String safeName(juce::String s) { s = s.removeCharacters("<>:\"/\\|?*").trim(); return s.isEmpty() ? juce::String("Untitled") : s.substring(0, 80); }

juce::var NodeFXProcessor::listPresets() const
{
    juce::Array<juce::var> out;
    const auto fac = juce::JSON::parse(juce::String::fromUTF8(nodefx::factoryPresets_json, nodefx::factoryPresets_jsonSize));
    if (auto* a = fac.getArray()) for (const auto& p : *a) {
        auto* o = new juce::DynamicObject(); o->setProperty("id", "f:" + p["bank"].toString() + "/" + p["name"].toString());
        o->setProperty("name", p["name"]); o->setProperty("bank", p["bank"]); o->setProperty("factory", true); out.add(juce::var(o));
    }
    const auto root = presetFolder();
    juce::Array<juce::File> files = root.findChildFiles(juce::File::findFiles, true, "*.nfx");
    files.sort();
    for (const auto& f : files) {
        const auto rel = f.getRelativePathFrom(root).replaceCharacter('\\', '/');
        auto* o = new juce::DynamicObject(); o->setProperty("id", "u:" + rel);
        o->setProperty("name", f.getFileNameWithoutExtension());
        o->setProperty("bank", f.getParentDirectory() == root ? juce::String() : f.getParentDirectory().getFileName());
        o->setProperty("factory", false); out.add(juce::var(o));
    }
    return out;
}

juce::String NodeFXProcessor::loadPreset(const juce::String& id) const
{
    if (id.startsWith("f:")) {
        const auto fac = juce::JSON::parse(juce::String::fromUTF8(nodefx::factoryPresets_json, nodefx::factoryPresets_jsonSize));
        if (auto* a = fac.getArray()) for (const auto& p : *a)
            if ("f:" + p["bank"].toString() + "/" + p["name"].toString() == id) return juce::JSON::toString(p["state"], true);
        return {};
    }
    if (id.startsWith("u:")) {
        const auto rel = id.substring(2);
        if (rel.contains("..")) return {};
        const auto f = presetFolder().getChildFile(rel);
        return f.existsAsFile() && f.isAChildOf(presetFolder()) ? f.loadFileAsString() : juce::String();
    }
    return {};
}

juce::var NodeFXProcessor::savePreset(const juce::String& name, const juce::String& bank, const juce::String& json)
{
    auto* o = new juce::DynamicObject();
    if (!juce::JSON::parse(json).isObject()) { o->setProperty("error", "not a chain"); return juce::var(o); }
    auto dir = presetFolder(); if (bank.trim().isNotEmpty()) dir = dir.getChildFile(safeName(bank));
    if (!dir.createDirectory()) { o->setProperty("error", "could not make the folder " + dir.getFullPathName()); return juce::var(o); }
    const auto f = dir.getChildFile(safeName(name) + ".nfx");
    if (!f.replaceWithText(json)) { o->setProperty("error", "could not write " + f.getFullPathName()); return juce::var(o); }
    o->setProperty("id", "u:" + f.getRelativePathFrom(presetFolder()).replaceCharacter('\\', '/'));
    return juce::var(o);
}

bool NodeFXProcessor::deletePreset(const juce::String& id)
{
    if (!id.startsWith("u:") || id.contains("..")) return false;
    const auto f = presetFolder().getChildFile(id.substring(2));
    return f.isAChildOf(presetFolder()) && f.hasFileExtension("nfx") && f.deleteFile();
}

juce::AudioProcessorEditor* NodeFXProcessor::createEditor() { return new NodeFXEditor(*this); }

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new NodeFXProcessor(); }
