#include "PluginProcessor.h"
#include "PluginEditor.h"

VisuProcessor::VisuProcessor()
    : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
    addParameter(volume_ = new juce::AudioParameterFloat({ "volume", 1 }, "Volume", 0.0f, 1.0f, 0.8f));
    for (int i = 0; i < kMacros; ++i)
    {
        slotTagIndex_[i] = -1; slotValue_[i] = 0; slotDirty_[i] = false; slotUiDirty_[i] = false; slotFromUi_[i] = false;
        addParameter(macros_[i] = new MacroParam(i));
        macros_[i]->addListener(this);
    }
    for (auto& c : ccSlot_) c = -1;
    libraryFolder().createDirectory();
    rescan();
}

VisuProcessor::MacroParam::MacroParam(int i)
    : juce::AudioParameterFloat({ "macro" + juce::String(i + 1), 1 }, "Macro " + juce::String(i + 1), 0.0f, 1.0f, 0.0f), slot(i), label_("Macro " + juce::String(i + 1)) {}
juce::String VisuProcessor::MacroParam::getName(int n) const { const juce::SpinLock::ScopedLockType l(lock_); return label_.substring(0, n); }

VisuProcessor::~VisuProcessor()
{
    for (auto* m : macros_) if (m) m->removeListener(this);
    *alive_ = false;
    engine_.setLibrary(nullptr);
}

juce::File VisuProcessor::libraryFolder()
{
    return juce::File::getSpecialLocation(juce::File::userDocumentsDirectory).getChildFile("VisuSampler").getChildFile("Libraries");
}

void VisuProcessor::rescan()
{
    auto alive = alive_;
    juce::Thread::launch([this, alive] {
        std::vector<Entry> found;
        for (auto& f : libraryFolder().findChildFiles(juce::File::findFiles, true, "*.vsamp"))
        {
            Entry e; e.file = f; e.size = f.getSize(); std::string err;
            if (!visu::Library::readInfo(f.getFullPathName().toStdString(), e.info, err)) continue;
            e.id = juce::String(e.info.id.empty() ? f.getFileNameWithoutExtension().toStdString() : e.info.id);
            // two copies of the same library (e.g. two versions): keep both, make the id unique
            for (auto& o : found) if (o.id == e.id) e.id += "~" + f.getFileNameWithoutExtension();
            found.push_back(std::move(e));
        }
        std::sort(found.begin(), found.end(), [](const Entry& a, const Entry& b) { return a.info.name < b.info.name; });
        juce::MessageManager::callAsync([this, alive, found = std::move(found)]() mutable {
            if (!*alive) return;
            catalog_ = std::move(found);
            if (pendingId_.isNotEmpty()) { auto p = pendingId_; pendingId_.clear(); loadLibrary(p, pendingKeep_); }
            sendChangeMessage();
        });
    });
}

const VisuProcessor::Entry* VisuProcessor::entryById(const juce::String& id) const
{
    for (auto& e : catalog_) if (e.id == id) return &e;
    return nullptr;
}

void VisuProcessor::loadLibrary(const juce::String& id, bool keepTags)
{
    if (!keepTags && id != currentId_) { const juce::ScopedLock l(tagLock_); tagState_.clear(); ccOfTag_.clear(); currentPreset_.clear(); }   // another library: start from its own knob values
    const auto* e = entryById(id);
    if (!e) { pendingId_ = id; pendingKeep_ = true; return; }   // the scan has not finished yet
    auto alive = alive_; const int ticket = ++loadTicket_; const juce::File file = e->file;
    loading_ = true; currentId_ = id; status_ = "Loading…"; sendChangeMessage();
    const double sr = sampleRate_ > 0 ? sampleRate_ : 48000.0;
    juce::Thread::launch([this, alive, file, ticket, id, sr] {
        std::string err;
        std::shared_ptr<const visu::Library> lib = visu::Library::load(file.getFullPathName().toStdString(), err, sr);
        juce::MessageManager::callAsync([this, alive, file, ticket, lib, err, id] {
            if (!*alive || ticket != loadTicket_.load()) return;
            loading_ = false;
            if (!lib) { status_ = "Could not load: " + juce::String(err); sendChangeMessage(); return; }
            { const juce::ScopedLock l(tagLock_); for (auto& t : tagState_) lib->setTag(t.first.toStdString(), t.second); }
            current_ = lib; currentFile_ = file; currentId_ = id;
            assignSlots();
            engine_.setList(list_); engine_.setLibrary(lib);
            status_ = juce::String((int) lib->zones.size()) + " zones ready · " + juce::String(lib->memoryBytes() / 1048576.0, 1) + " MB in memory";
            if (lib->streamedSamples() > 0) status_ << " · " << lib->streamedSamples() << " samples stream from disk";
            if (lib->unsupportedZones) status_ << " · " << lib->unsupportedZones << " zones use sample modes this version does not play yet";
            sendChangeMessage();
        });
    });
}

void VisuProcessor::unloadLibrary()
{
    { const juce::ScopedLock l(tagLock_); tagState_.clear(); }
    ccOfTag_.clear();
    ++loadTicket_; loading_ = false; engine_.setLibrary(nullptr); current_.reset(); currentId_.clear(); currentFile_ = juce::File();
    list_ = -2; status_ = "No library loaded"; sendChangeMessage();
}

void VisuProcessor::setList(int index)
{
    list_ = index; engine_.setList(index); sendChangeMessage();
}

int VisuProcessor::addLibraryFiles(const juce::Array<juce::File>& files)
{
    int n = 0;
    for (auto& file : files)
    {
        if (!file.hasFileExtension("vsamp") && !file.hasFileExtension("zip")) continue;
        auto dest = libraryFolder().getChildFile(file.getFileNameWithoutExtension().upToLastOccurrenceOf(".vsamp", false, true)
                                                      .replace(".vsamp", "") + ".vsamp");
        if (file != dest && file.copyFileTo(dest)) ++n;
    }
    rescan();
    return n;
}

juce::var VisuProcessor::librariesVar() const
{
    juce::Array<juce::var> libs;
    for (auto& e : catalog_)
    {
        auto* o = new juce::DynamicObject();
        const auto& i = e.info;
        o->setProperty("id", e.id); o->setProperty("name", juce::String(i.name)); o->setProperty("author", juce::String(i.author));
        o->setProperty("version", juce::String(i.version)); o->setProperty("category", juce::String(i.category)); o->setProperty("tags", juce::String(i.tags));
        o->setProperty("desc", juce::String(i.desc)); o->setProperty("web", juce::String(i.web)); o->setProperty("licence", juce::String(i.licence));
        o->setProperty("changelog", juce::String(i.changelog)); o->setProperty("accent", juce::String(i.accent));
        o->setProperty("hasTile", !i.bannerTile.empty()); o->setProperty("hasWide", !i.bannerWide.empty()); o->setProperty("size", (double) e.size);
        libs.add(juce::var(o));
    }
    auto* r = new juce::DynamicObject();
    r->setProperty("folder", libraryFolder().getFullPathName()); r->setProperty("libs", libs);
    return juce::var(r);
}

juce::var VisuProcessor::statusVar() const
{
    auto* o = new juce::DynamicObject();
    o->setProperty("text", status_); o->setProperty("loading", loading_.load()); o->setProperty("currentId", currentId_);
    if (current_)
    {
        juce::Array<juce::var> lists, bad;
        for (auto& l : current_->lists) { auto* x = new juce::DynamicObject(); x->setProperty("name", juce::String(l.name)); x->setProperty("bank", l.bank); if (l.ks >= 0) x->setProperty("ks", l.ks); lists.add(juce::var(x)); }
        for (auto& u : current_->unsupported) bad.add(juce::String(u));
        o->setProperty("lists", lists); o->setProperty("unsupported", bad);
        o->setProperty("list", list_ == -2 ? current_->defaultList : list_);
        o->setProperty("zones", (int) current_->zones.size()); o->setProperty("groups", (int) current_->groups.size());
    }
    return juce::var(o);
}

void VisuProcessor::prepareToPlay(double sampleRate, int)
{
    engine_.prepare(sampleRate);
    const bool changed = std::abs(sampleRate - sampleRate_) > 1;
    sampleRate_ = sampleRate;
    // the effects are built for one sample rate: reload the library if the host changed it
    if (changed && current_ && currentId_.isNotEmpty()) { const auto id = currentId_; juce::MessageManager::callAsync([this, id, alive = alive_] { if (*alive) loadLibrary(id); }); }
}

void VisuProcessor::setTag(const juce::String& name, float value)
{
    { const juce::ScopedLock l(tagLock_); tagState_[name] = value; }
    if (current_) current_->setTag(name.toStdString(), value);
    /* the DAW records the move: one gesture per drag, ended when the knob rests */
    const int s = slotOf(name);
    if (s >= 0)
    {
        if (!gesture_[s]) { macros_[s]->beginChangeGesture(); gesture_[s] = true; }
        gestureTime_[s] = juce::Time::getMillisecondCounterHiRes();
        slotFromUi_[s] = true; macros_[s]->setValueNotifyingHost(value); slotFromUi_[s] = false;
    }
}

void VisuProcessor::endIdleGestures()
{
    const double now = juce::Time::getMillisecondCounterHiRes();
    for (int i = 0; i < kMacros; ++i) if (gesture_[i] && now - gestureTime_[i] > 300) { macros_[i]->endChangeGesture(); gesture_[i] = false; }
}

void VisuProcessor::parameterValueChanged(int parameterIndex, float v)
{
    // macro parameters only (any thread): the audio thread applies the value, the interface follows unless it moved it
    const int i = parameterIndex - 1;   // the volume is parameter 0
    if (i < 0 || i >= kMacros) return;
    slotValue_[i] = v; slotDirty_[i] = true;
    if (!slotFromUi_[i]) slotUiDirty_[i] = true;
}

void VisuProcessor::assignSlots()
{
    for (int i = 0; i < kMacros; ++i) { slotTag_[i].clear(); slotTagIndex_[i] = -1; macros_[i]->setLabel("Macro " + juce::String(i + 1)); }
    if (current_)
    {
        int s = 0;
        for (size_t t = 0; t < current_->tags.size() && s < kMacros; ++t)
        {
            const auto& td = current_->tags[t];
            if (td.kind == "bank" || td.kind == "list" || td.name == "page" || td.name.empty()) continue;   // built in: not knobs
            slotTag_[s] = juce::String(td.name); slotTagIndex_[s] = (int) t; macros_[s]->setLabel(juce::String(td.name));
            float v = td.def; { const juce::ScopedLock l(tagLock_); auto it = tagState_.find(slotTag_[s]); if (it != tagState_.end()) v = it->second; }
            slotFromUi_[s] = true; macros_[s]->setValueNotifyingHost(v); slotFromUi_[s] = false;
            ++s;
        }
    }
    for (auto& c : ccSlot_) c = -1;
    for (auto& kv : ccOfTag_) { const int s = slotOf(kv.first); if (s >= 0 && kv.second >= 0 && kv.second < 128) ccSlot_[kv.second] = s; }
    updateHostDisplay(juce::AudioProcessorListener::ChangeDetails().withParameterInfoChanged(true));
}

juce::var VisuProcessor::mappingsVar() const
{
    auto* o = new juce::DynamicObject();
    for (int i = 0; i < kMacros; ++i)
    {
        if (slotTag_[i].isEmpty()) continue;
        auto* m = new juce::DynamicObject(); m->setProperty("slot", i + 1);
        auto it = ccOfTag_.find(slotTag_[i]); m->setProperty("cc", it != ccOfTag_.end() ? juce::var(it->second) : juce::var());
        o->setProperty(juce::Identifier(slotTag_[i]), juce::var(m));
    }
    if (learnTag_.isNotEmpty()) o->setProperty("__learning", learnTag_);
    return juce::var(o);
}
void VisuProcessor::startLearn(const juce::String& tag) { if (slotOf(tag) < 0) return; learnTag_ = tag; learnedCc_ = -1; learning_ = true; }
void VisuProcessor::forgetMidi(const juce::String& tag)
{
    auto it = ccOfTag_.find(tag); if (it == ccOfTag_.end()) return;
    if (it->second >= 0 && it->second < 128) ccSlot_[it->second] = -1;
    ccOfTag_.erase(it);
}
bool VisuProcessor::pollLearned()
{
    const int cc = learnedCc_.exchange(-1);
    if (cc < 0 || learnTag_.isEmpty()) return false;
    for (auto it = ccOfTag_.begin(); it != ccOfTag_.end();) { if (it->second == cc) { ccSlot_[cc] = -1; it = ccOfTag_.erase(it); } else ++it; }   // one knob per controller
    forgetMidi(learnTag_);
    ccOfTag_[learnTag_] = cc; const int s = slotOf(learnTag_); if (s >= 0) ccSlot_[cc] = s;
    learnTag_.clear();
    return true;
}
/* ---- user presets ---- */
static juce::String safeName(juce::String s) { s = s.removeCharacters("\\/:*?\"<>|").trim(); return s.isEmpty() ? juce::String("Preset") : s.substring(0, 80); }
juce::File VisuProcessor::presetFolder() const
{
    const juce::String lib = current_ ? juce::String(current_->info.name.empty() ? current_->info.id : current_->info.name) : juce::String("Library");
    return libraryFolder().getParentDirectory().getChildFile("Presets").getChildFile(safeName(lib));
}
juce::var VisuProcessor::presetsVar() const
{
    juce::Array<juce::var> names;
    if (current_) for (auto& f : presetFolder().findChildFiles(juce::File::findFiles, false, "*.vpreset")) names.add(f.getFileNameWithoutExtension());
    names.sort();
    auto* o = new juce::DynamicObject(); o->setProperty("names", names); o->setProperty("current", currentPreset_); return juce::var(o);
}
bool VisuProcessor::savePreset(const juce::String& rawName)
{
    if (!current_) return false;
    const juce::String name = safeName(rawName);
    auto* vals = new juce::DynamicObject();
    for (size_t t = 0; t < current_->tags.size(); ++t)
    {
        const auto& td = current_->tags[t];
        if (td.kind == "bank" || td.kind == "list" || td.name == "page" || td.name.empty()) continue;
        vals->setProperty(juce::Identifier(juce::String(td.name)), (double) current_->tagValues[t].load());
    }
    auto* o = new juce::DynamicObject();
    o->setProperty("format", "visuplayer-preset"); o->setProperty("library", juce::String(current_->info.id)); o->setProperty("name", name);
    o->setProperty("list", currentList()); o->setProperty("values", juce::var(vals));
    auto dir = presetFolder(); dir.createDirectory();
    const bool ok = dir.getChildFile(name + ".vpreset").replaceWithText(juce::JSON::toString(juce::var(o)));
    if (ok) currentPreset_ = name;
    return ok;
}
void VisuProcessor::applyValue(const juce::String& tag, float v)
{
    { const juce::ScopedLock l(tagLock_); tagState_[tag] = v; }
    if (current_) current_->setTag(tag.toStdString(), v);
    const int s = slotOf(tag);
    if (s >= 0) { slotFromUi_[s] = true; macros_[s]->setValueNotifyingHost(v); slotFromUi_[s] = false; }
}
juce::var VisuProcessor::loadPreset(const juce::String& name)
{
    if (!current_) return {};
    auto* vals = new juce::DynamicObject(); int list = -2;
    if (name.isEmpty())   // the library's own values
    {
        for (auto& td : current_->tags) if (!(td.kind == "bank" || td.kind == "list" || td.name == "page" || td.name.empty())) vals->setProperty(juce::Identifier(juce::String(td.name)), (double) td.def);
        list = current_->defaultList;
    }
    else
    {
        const auto j = juce::JSON::parse(presetFolder().getChildFile(safeName(name) + ".vpreset"));
        if (!j.isObject()) return {};
        if (auto* v = j["values"].getDynamicObject()) for (auto& p : v->getProperties()) vals->setProperty(p.name, p.value);
        list = j.hasProperty("list") ? (int) j["list"] : -2;
    }
    for (auto& p : vals->getProperties()) applyValue(p.name.toString(), (float) (double) p.value);
    if (list >= -1) setList(list);
    currentPreset_ = name;
    auto* o = new juce::DynamicObject(); o->setProperty("values", juce::var(vals)); o->setProperty("list", list); o->setProperty("name", name);
    return juce::var(o);
}
bool VisuProcessor::deletePreset(const juce::String& name)
{
    const auto f = presetFolder().getChildFile(safeName(name) + ".vpreset");
    if (name == currentPreset_) currentPreset_.clear();
    return f.existsAsFile() && f.deleteFile();
}

juce::var VisuProcessor::takeUiChanges()
{
    juce::DynamicObject::Ptr o;
    for (int i = 0; i < kMacros; ++i)
        if (slotUiDirty_[i].exchange(false) && slotTag_[i].isNotEmpty())
        {
            if (!o) o = new juce::DynamicObject();
            const float v = slotValue_[i].load(); o->setProperty(juce::Identifier(slotTag_[i]), v);
            const juce::ScopedLock l(tagLock_); tagState_[slotTag_[i]] = v;
        }
    return o ? juce::var(o.get()) : juce::var();
}

juce::var VisuProcessor::tagsVar() const
{
    auto* o = new juce::DynamicObject();
    const juce::ScopedLock l(tagLock_);
    for (auto& t : tagState_) o->setProperty(juce::Identifier(t.first), (double) t.second);
    return juce::var(o);
}

bool VisuProcessor::isBusesLayoutSupported(const BusesLayout& l) const
{
    return l.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
}

void VisuProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    const double t0 = juce::Time::getMillisecondCounterHiRes();
    const int n = buffer.getNumSamples();
    buffer.clear();
    engine_.setMasterGain(volume_->get());
    if (panicRequest_.exchange(false)) engine_.allNotesOff();
    for (int i = 0; i < kMacros; ++i) if (slotDirty_[i].exchange(false)) engine_.setTagIndex(slotTagIndex_[i].load(), slotValue_[i].load());
    keyboardState.processNextMidiBuffer(midi, 0, n, true);
    float* L = buffer.getWritePointer(0);
    float* R = buffer.getNumChannels() > 1 ? buffer.getWritePointer(1) : L;
    int pos = 0;
    for (const auto meta : midi)
    {
        const int t = juce::jlimit(0, n, meta.samplePosition);
        if (t > pos) { engine_.render(L + pos, R + pos, t - pos); pos = t; }
        const auto m = meta.getMessage();
        if (m.isNoteOn()) engine_.noteOn(m.getNoteNumber(), m.getVelocity());
        else if (m.isNoteOff()) engine_.noteOff(m.getNoteNumber());
        else if (m.isController())
        {
            const int cc = m.getControllerNumber(), val = m.getControllerValue();
            if (learning_.load() && cc != 64 && cc != 120 && cc != 121 && cc != 123) { learnedCc_ = cc; learning_ = false; }
            else if (const int s = ccSlot_[juce::jlimit(0, 127, cc)].load(); s >= 0) macros_[s]->setValueNotifyingHost(val / 127.0f);   // a learned controller moves its knob
            engine_.controller(cc, val);
        }
        else if (m.isPitchWheel()) engine_.pitchBend(m.getPitchWheelValue() / 16383.0f);
        else if (m.isChannelPressure()) engine_.aftertouch(m.getChannelPressureValue() / 127.0f);
        else if (m.isAftertouch()) engine_.aftertouch(m.getAfterTouchValue() / 127.0f);
        else if (m.isAllNotesOff() || m.isAllSoundOff()) engine_.allNotesOff();
    }
    if (pos < n) engine_.render(L + pos, R + pos, n - pos);
    midi.clear();
    // CPU guard: tell the engine how much of the block's time this took, so it can drop voices before the audio breaks up
    if (n > 0 && getSampleRate() > 0) engine_.reportLoad((float) ((juce::Time::getMillisecondCounterHiRes() - t0) / (1000.0 * n / getSampleRate())));
}

juce::AudioProcessorEditor* VisuProcessor::createEditor() { return new VisuEditor(*this); }

void VisuProcessor::getStateInformation(juce::MemoryBlock& dest)
{
    juce::XmlElement xml("VisuPlayerState");
    xml.setAttribute("libraryId", currentId_);
    xml.setAttribute("libraryPath", currentFile_.getFullPathName());
    xml.setAttribute("list", list_);
    xml.setAttribute("volume", (double) volume_->get());
    xml.setAttribute("preset", currentPreset_);
    {   // knob and page positions
        const juce::ScopedLock l(tagLock_);
        for (int i = 0; i < kMacros; ++i) if (slotTag_[i].isNotEmpty()) tagState_[slotTag_[i]] = macros_[i]->get();   // automated values too
        auto* tags = xml.createNewChildElement("Tags");
        for (auto& t : tagState_) { auto* x = tags->createNewChildElement("Tag"); x->setAttribute("name", t.first); x->setAttribute("value", (double) t.second); }
    }
    auto* midiMap = xml.createNewChildElement("MidiMap");
    for (auto& kv : ccOfTag_) { auto* x = midiMap->createNewChildElement("Cc"); x->setAttribute("tag", kv.first); x->setAttribute("cc", kv.second); }
    copyXmlToBinary(xml, dest);
}

void VisuProcessor::setStateInformation(const void* data, int size)
{
    if (auto xml = getXmlFromBinary(data, size))
    {
        if (!xml->hasTagName("VisuPlayerState")) return;
        volume_->setValueNotifyingHost(volume_->convertTo0to1((float) xml->getDoubleAttribute("volume", 0.8)));
        list_ = xml->getIntAttribute("list", -2);
        currentPreset_ = xml->getStringAttribute("preset");
        {
            const juce::ScopedLock l(tagLock_); tagState_.clear();
            if (auto* tags = xml->getChildByName("Tags"))
                for (auto* x : tags->getChildIterator()) tagState_[x->getStringAttribute("name")] = (float) x->getDoubleAttribute("value");
        }
        ccOfTag_.clear();
        if (auto* mm = xml->getChildByName("MidiMap"))
            for (auto* x : mm->getChildIterator()) ccOfTag_[x->getStringAttribute("tag")] = x->getIntAttribute("cc", -1);
        const auto id = xml->getStringAttribute("libraryId");
        if (id.isNotEmpty()) loadLibrary(id, true);
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new VisuProcessor(); }
