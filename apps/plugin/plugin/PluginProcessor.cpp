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

static juce::Image decodeImage(const std::string& bytes)
{
    if (bytes.empty()) return {};
    return juce::ImageFileFormat::loadFrom(bytes.data(), bytes.size());
}

void VisuProcessor::rescan()
{
    auto alive = alive_;
    juce::Thread::launch([this, alive] {
        std::vector<Entry> found;
        auto files = libraryFolder().findChildFiles(juce::File::findFiles, true, "*.vsamp");
        for (auto& f : files)
        {
            Entry e; e.file = f; std::string err;
            if (!visu::Library::readInfo(f.getFullPathName().toStdString(), e.info, err)) continue;
            e.tile = decodeImage(e.info.bannerTile); e.wide = decodeImage(e.info.bannerWide);
            e.info.bannerTile.clear(); e.info.bannerWide.clear(); e.info.bannerIcon.clear();
            found.push_back(std::move(e));
        }
        std::sort(found.begin(), found.end(), [](const Entry& a, const Entry& b) { return a.info.name < b.info.name; });
        juce::MessageManager::callAsync([this, alive, found = std::move(found)]() mutable {
            if (!*alive) return;
            catalog_ = std::move(found);
            sendChangeMessage();
        });
    });
}

const VisuProcessor::Entry* VisuProcessor::currentEntry() const
{
    for (auto& e : catalog_) if (e.file == current_) return &e;
    return nullptr;
}

void VisuProcessor::loadLibrary(const juce::File& file)
{
    auto alive = alive_; const int ticket = ++loadTicket_;
    loading_ = true; status_ = "Loading " + file.getFileNameWithoutExtension() + "…"; sendChangeMessage();
    juce::Thread::launch([this, alive, file, ticket] {
        std::string err;
        auto lib = visu::Library::load(file.getFullPathName().toStdString(), err);
        juce::MessageManager::callAsync([this, alive, file, ticket, lib, err] {
            if (!*alive || ticket != loadTicket_.load()) return;
            loading_ = false;
            if (!lib) { status_ = "Could not load: " + juce::String(err); sendChangeMessage(); return; }
            engine_.setLibrary(lib); current_ = file;
            status_ = juce::String(lib->info.name) + " · " + juce::String((int) lib->zones.size()) + " zones"
                      + (lib->unsupportedZones ? " · " + juce::String(lib->unsupportedZones) + " zones use modes this version does not play yet" : juce::String());
            sendChangeMessage();
        });
    });
}

void VisuProcessor::unloadLibrary()
{
    ++loadTicket_; loading_ = false; engine_.setLibrary(nullptr); current_ = juce::File(); status_ = "No library loaded"; sendChangeMessage();
}

void VisuProcessor::addLibraryFile(const juce::File& file)
{
    auto dest = libraryFolder().getChildFile(file.getFileName());
    if (file != dest) file.copyFileTo(dest);
    rescan();
}

void VisuProcessor::prepareToPlay(double sampleRate, int)
{
    engine_.prepare(sampleRate);
}

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
    xml.setAttribute("libraryPath", current_.getFullPathName());
    xml.setAttribute("volume", (double) volume_->get());
    copyXmlToBinary(xml, dest);
}

void VisuProcessor::setStateInformation(const void* data, int size)
{
    if (auto xml = getXmlFromBinary(data, size))
    {
        if (xml->hasTagName("VisuPlayerState"))
        {
            volume_->setValueNotifyingHost(volume_->convertTo0to1((float) xml->getDoubleAttribute("volume", 0.8)));
            juce::File f(xml->getStringAttribute("libraryPath"));
            if (f.existsAsFile()) loadLibrary(f);
        }
    }
}

juce::AudioProcessor* JUCE_CALLTYPE createPluginFilter() { return new VisuProcessor(); }
