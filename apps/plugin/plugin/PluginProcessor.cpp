#include "PluginProcessor.h"
#include "PluginEditor.h"

VisuProcessor::VisuProcessor()
    : AudioProcessor(BusesProperties().withOutput("Output", juce::AudioChannelSet::stereo(), true))
{
    addParameter(volume_ = new juce::AudioParameterFloat({ "volume", 1 }, "Volume", 0.0f, 1.0f, 0.8f));
    libraryFolder().createDirectory();
    rescan();
}

VisuProcessor::~VisuProcessor()
{
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
            if (pendingId_.isNotEmpty()) { auto p = pendingId_; pendingId_.clear(); loadLibrary(p); }
            sendChangeMessage();
        });
    });
}

const VisuProcessor::Entry* VisuProcessor::entryById(const juce::String& id) const
{
    for (auto& e : catalog_) if (e.id == id) return &e;
    return nullptr;
}

void VisuProcessor::loadLibrary(const juce::String& id)
{
    const auto* e = entryById(id);
    if (!e) { pendingId_ = id; return; }   // the scan has not finished yet
    auto alive = alive_; const int ticket = ++loadTicket_; const juce::File file = e->file;
    loading_ = true; currentId_ = id; status_ = "Loading…"; sendChangeMessage();
    juce::Thread::launch([this, alive, file, ticket, id] {
        std::string err;
        std::shared_ptr<const visu::Library> lib = visu::Library::load(file.getFullPathName().toStdString(), err);
        juce::MessageManager::callAsync([this, alive, file, ticket, lib, err, id] {
            if (!*alive || ticket != loadTicket_.load()) return;
            loading_ = false;
            if (!lib) { status_ = "Could not load: " + juce::String(err); sendChangeMessage(); return; }
            current_ = lib; currentFile_ = file; currentId_ = id;
            engine_.setList(list_); engine_.setLibrary(lib);
            status_ = juce::String((int) lib->zones.size()) + " zones ready";
            if (lib->unsupportedZones) status_ << " · " << lib->unsupportedZones << " zones use sample modes this version does not play yet";
            sendChangeMessage();
        });
    });
}

void VisuProcessor::unloadLibrary()
{
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
        for (auto& l : current_->lists) { auto* x = new juce::DynamicObject(); x->setProperty("name", juce::String(l.name)); x->setProperty("bank", l.bank); lists.add(juce::var(x)); }
        for (auto& u : current_->unsupported) bad.add(juce::String(u));
        o->setProperty("lists", lists); o->setProperty("unsupported", bad);
        o->setProperty("list", list_ == -2 ? current_->defaultList : list_);
        o->setProperty("zones", (int) current_->zones.size()); o->setProperty("groups", (int) current_->groups.size());
    }
    return juce::var(o);
}

void VisuProcessor::prepareToPlay(double sampleRate, int) { engine_.prepare(sampleRate); }

bool VisuProcessor::isBusesLayoutSupported(const BusesLayout& l) const
{
    return l.getMainOutputChannelSet() == juce::AudioChannelSet::stereo();
}

void VisuProcessor::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midi)
{
    juce::ScopedNoDenormals noDenormals;
    const int n = buffer.getNumSamples();
    buffer.clear();
    engine_.setMasterGain(volume_->get());
    if (panicRequest_.exchange(false)) engine_.allNotesOff();
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
        else if (m.isController() && m.getControllerNumber() == 64) engine_.sustain(m.getControllerValue() >= 64);
        else if (m.isAllNotesOff() || m.isAllSoundOff()) engine_.allNotesOff();
    }
    if (pos < n) engine_.render(L + pos, R + pos, n - pos);
    midi.clear();
}

juce::AudioProcessorEditor* VisuProcessor::createEditor() { return new VisuEditor(*this); }

void VisuProcessor::getStateInformation(juce::MemoryBlock& dest)
{
    juce::XmlElement xml("VisuPlayerState");
    xml.setAttribute("libraryId", currentId_);
    xml.setAttribute("libraryPath", currentFile_.getFullPathName());
    xml.setAttribute("list", list_);
    xml.setAttribute("volume", (double) volume_->get());
    copyXmlToBinary(xml, dest);
}

void VisuProcessor::setStateInformation(const void* data, int size)
{
    if (auto xml = getXmlFromBinary(data, size))
    {
        if (!xml->hasTagName("VisuPlayerState")) return;
        volume_->setValueNotifyingHost(volume_->convertTo0to1((float) xml->getDoubleAttribute("volume", 0.8)));
        list_ = xml->getIntAttribute("list", -2);
        const auto id = xml->getStringAttribute("libraryId");
        if (id.isNotEmpty()) loadLibrary(id);
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new VisuProcessor(); }
