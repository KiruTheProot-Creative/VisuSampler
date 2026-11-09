#include "PluginEditor.h"
#include "BinaryData.h"

namespace
{
juce::String mimeFor(const juce::String& path)
{
    if (path.endsWithIgnoreCase(".html")) return "text/html";
    if (path.endsWithIgnoreCase(".js")) return "text/javascript";
    if (path.endsWithIgnoreCase(".css")) return "text/css";
    if (path.endsWithIgnoreCase(".png")) return "image/png";
    if (path.endsWithIgnoreCase(".ttf")) return "font/ttf";
    if (path.endsWithIgnoreCase(".svg")) return "image/svg+xml";
    return "application/octet-stream";
}
std::vector<std::byte> bytesOf(const void* d, size_t n)
{
    std::vector<std::byte> v(n);
    if (n) std::memcpy(v.data(), d, n);
    return v;
}
} // namespace

VisuEditor::VisuEditor(VisuProcessor& p)
    : AudioProcessorEditor(&p), proc_(p), browser_(makeOptions())
{
    addAndMakeVisible(browser_);
    setResizable(true, true); setResizeLimits(640, 440, 2400, 1600); setSize(1000, 660);
    browser_.goToURL(juce::WebBrowserComponent::getResourceProviderRoot());
    proc_.addChangeListener(this);
    startTimerHz(30);
}

VisuEditor::~VisuEditor() { proc_.removeChangeListener(this); }

juce::WebBrowserComponent::Options VisuEditor::makeOptions()
{
    using O = juce::WebBrowserComponent::Options;
    auto reply = [](juce::WebBrowserComponent::NativeFunctionCompletion& done, juce::var v) { done(std::move(v)); };
    return O{}
        .withBackend(O::Backend::webview2)
        .withWinWebView2Options(O::WinWebView2{}.withUserDataFolder(juce::File::getSpecialLocation(juce::File::tempDirectory).getChildFile("VisuPlayerWebView")))
        .withKeepPageLoadedWhenBrowserIsHidden()
        .withNativeIntegrationEnabled()
        .withResourceProvider([this](const juce::String& url) { return resource(url); })
        .withNativeFunction("getLibraries", [this, reply](const juce::Array<juce::var>&, auto done) { reply(done, proc_.librariesVar()); })
        .withNativeFunction("getState", [this, reply](const juce::Array<juce::var>&, auto done) {
            auto* o = new juce::DynamicObject(); o->setProperty("volume", proc_.volume()); o->setProperty("status", proc_.statusVar()); o->setProperty("version", VisuProcessor::versionText()); reply(done, juce::var(o)); })
        .withNativeFunction("loadLibrary", [this, reply](const juce::Array<juce::var>& a, auto done) {
            const auto id = a.isEmpty() ? juce::String() : a[0].toString();
            if (!proc_.entryById(id)) { auto* o = new juce::DynamicObject(); o->setProperty("error", "library not found"); reply(done, juce::var(o)); return; }
            proc_.loadLibrary(id); reply(done, juce::var(true)); })
        .withNativeFunction("getInterface", [this, reply](const juce::Array<juce::var>&, auto done) {
            /* the library's own interface: the page passes it to runtime.html, which draws it with the Designer's code */
            auto lib = proc_.currentLibrary();
            if (!lib) { reply(done, juce::var()); return; }
            auto* o = new juce::DynamicObject();
            o->setProperty("manifest", juce::String::fromUTF8(lib->manifestText.data(), (int) lib->manifestText.size()));
            o->setProperty("id", proc_.currentId()); o->setProperty("list", proc_.currentList()); o->setProperty("listB", proc_.currentListB()); o->setProperty("patch", proc_.currentPatch(0)); o->setProperty("patchB", proc_.currentPatch(1)); o->setProperty("tags", proc_.tagsVar());
            reply(done, juce::var(o)); })
        .withNativeFunction("setTag", [this, reply](const juce::Array<juce::var>& a, auto done) { if (a.size() >= 2) proc_.setTag(a[0].toString(), (float) (double) a[1]); reply(done, juce::var(true)); })
        .withNativeFunction("getMappings", [this, reply](const juce::Array<juce::var>&, auto done) { reply(done, proc_.mappingsVar()); })
        .withNativeFunction("midiLearn", [this, reply](const juce::Array<juce::var>& a, auto done) { if (!a.isEmpty()) proc_.startLearn(a[0].toString()); reply(done, proc_.mappingsVar()); })
        .withNativeFunction("midiCancel", [this, reply](const juce::Array<juce::var>&, auto done) { proc_.cancelLearn(); reply(done, proc_.mappingsVar()); })
        .withNativeFunction("midiForget", [this, reply](const juce::Array<juce::var>& a, auto done) { if (!a.isEmpty()) proc_.forgetMidi(a[0].toString()); reply(done, proc_.mappingsVar()); })
        .withNativeFunction("getPresets", [this, reply](const juce::Array<juce::var>&, auto done) { reply(done, proc_.presetsVar()); })
        .withNativeFunction("savePreset", [this, reply](const juce::Array<juce::var>& a, auto done) { const bool ok = !a.isEmpty() && proc_.savePreset(a[0].toString()); auto r = proc_.presetsVar(); if (auto* o = r.getDynamicObject()) o->setProperty("ok", ok); reply(done, r); })
        .withNativeFunction("loadPreset", [this, reply](const juce::Array<juce::var>& a, auto done) { reply(done, proc_.loadPreset(a.isEmpty() ? juce::String() : a[0].toString())); })
        .withNativeFunction("deletePreset", [this, reply](const juce::Array<juce::var>& a, auto done) { if (!a.isEmpty()) proc_.deletePreset(a[0].toString()); reply(done, proc_.presetsVar()); })
        .withNativeFunction("unload", [this, reply](const juce::Array<juce::var>&, auto done) { proc_.unloadLibrary(); reply(done, juce::var(true)); })
        .withNativeFunction("scopeOn", [this, reply](const juce::Array<juce::var>& a, auto done) { proc_.setScope(!a.isEmpty() && (bool) a[0]); reply(done, juce::var(true)); })
        .withNativeFunction("setPatch", [this, reply](const juce::Array<juce::var>& a, auto done) { if (a.size() >= 2) proc_.setPatch((int) a[0], (int) a[1]); reply(done, juce::var(true)); })
        .withNativeFunction("setListB", [this, reply](const juce::Array<juce::var>& a, auto done) { if (!a.isEmpty()) proc_.setListB((int) a[0]); reply(done, juce::var(true)); })
        .withNativeFunction("setList", [this, reply](const juce::Array<juce::var>& a, auto done) { if (!a.isEmpty()) proc_.setList((int) a[0]); reply(done, juce::var(true)); })
        .withNativeFunction("setVolume", [this, reply](const juce::Array<juce::var>& a, auto done) { if (!a.isEmpty()) proc_.setVolume((float) (double) a[0]); reply(done, juce::var(true)); })
        .withNativeFunction("noteOn", [this, reply](const juce::Array<juce::var>& a, auto done) {
            if (a.size() >= 2) proc_.keyboardState.noteOn(1, juce::jlimit(0, 127, (int) a[0]), juce::jlimit(1, 127, (int) a[1]) / 127.0f); reply(done, juce::var(true)); })
        .withNativeFunction("noteOff", [this, reply](const juce::Array<juce::var>& a, auto done) {
            if (!a.isEmpty()) proc_.keyboardState.noteOff(1, juce::jlimit(0, 127, (int) a[0]), 0.0f); reply(done, juce::var(true)); })
        .withNativeFunction("pitchBend", [this, reply](const juce::Array<juce::var>& a, auto done) { if (!a.isEmpty()) proc_.setUiBend((float) (double) a[0]); reply(done, juce::var(true)); })
        .withNativeFunction("modWheel", [this, reply](const juce::Array<juce::var>& a, auto done) { if (!a.isEmpty()) proc_.setUiMod((float) (double) a[0]); reply(done, juce::var(true)); })
        .withNativeFunction("panic", [this, reply](const juce::Array<juce::var>&, auto done) { proc_.keyboardState.allNotesOff(1); proc_.panic(); reply(done, juce::var(true)); })
        .withNativeFunction("openFolder", [reply](const juce::Array<juce::var>&, auto done) { VisuProcessor::libraryFolder().startAsProcess(); reply(done, juce::var(true)); })
        .withNativeFunction("openCommunity", [reply](const juce::Array<juce::var>&, auto done) { juce::URL(VisuProcessor::communityUrl()).launchInDefaultBrowser(); reply(done, juce::var(true)); })   // only this one fixed address
        .withNativeFunction("openLogs", [reply](const juce::Array<juce::var>&, auto done) { VisuProcessor::logFolder().createDirectory(); VisuProcessor::logFolder().startAsProcess(); reply(done, juce::var(true)); })
        .withNativeFunction("addLibrary", [this](const juce::Array<juce::var>&, juce::WebBrowserComponent::NativeFunctionCompletion done) {
            chooser_ = std::make_unique<juce::FileChooser>("Add libraries and instruments", juce::File(), "*.vslib;*.vsins;*.vsamp;*.zip");
            chooser_->launchAsync(juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles | juce::FileBrowserComponent::canSelectMultipleItems,
                                  [this, done](const juce::FileChooser& fc) {
                                      const int n = proc_.addLibraryFiles(fc.getResults());
                                      auto* o = new juce::DynamicObject(); o->setProperty("added", n); done(juce::var(o));
                                  });
        });
}

std::optional<juce::WebBrowserComponent::Resource> VisuEditor::resource(const juce::String& url)
{
    auto path = url.upToFirstOccurrenceOf("?", false, false).fromFirstOccurrenceOf("/", false, false);
    if (path.isEmpty()) path = "index.html";
    if (path.startsWith("lib/"))   // banner images straight from the library files
    {
        const auto id = juce::URL::removeEscapeChars(path.fromFirstOccurrenceOf("lib/", false, false).upToLastOccurrenceOf("/", false, false));
        const auto kind = path.fromLastOccurrenceOf("/", false, false);
        if (const auto* e = proc_.entryById(id))
        {
            const std::string& b = proc_.banner(*e, kind);
            if (!b.empty()) return juce::WebBrowserComponent::Resource{ bytesOf(b.data(), b.size()), "image/png" };
        }
        return std::nullopt;
    }
    if (path.startsWith("cur/"))   // images and fonts of the loaded library's interface: cur/asset/<id>, cur/font/<family>
    {
        auto lib = proc_.currentLibrary();
        if (!lib) return std::nullopt;
        const auto kind = path.fromFirstOccurrenceOf("cur/", false, false).upToFirstOccurrenceOf("/", false, false);
        const auto key = juce::URL::removeEscapeChars(path.fromLastOccurrenceOf("/", false, false)).toStdString();
        for (auto& kv : (kind == "font" ? lib->fonts : lib->assets))
            if (kv.first == key) return juce::WebBrowserComponent::Resource{ bytesOf(kv.second.data.data(), kv.second.data.size()), kind == "font" ? juce::String("font/ttf") : juce::String(kv.second.mime) };
        return std::nullopt;
    }
    if (path.startsWith("fonts/")) path = path.fromFirstOccurrenceOf("fonts/", false, false);
    for (int i = 0; i < BinaryData::namedResourceListSize; ++i)
    {
        if (path == BinaryData::originalFilenames[i])
        {
            int size = 0;
            if (const char* d = BinaryData::getNamedResource(BinaryData::namedResourceList[i], size))
                return juce::WebBrowserComponent::Resource{ bytesOf(d, (size_t) size), mimeFor(path) };
        }
    }
    return std::nullopt;
}

void VisuEditor::changeListenerCallback(juce::ChangeBroadcaster*)
{
    browser_.emitEventIfBrowserIsVisible("libraries", proc_.librariesVar());
    browser_.emitEventIfBrowserIsVisible("status", proc_.statusVar());
}

void VisuEditor::timerCallback()
{
    const int v = proc_.activeVoices();
    if (v != lastVoices_) { lastVoices_ = v; auto* o = new juce::DynamicObject(); o->setProperty("voices", v); browser_.emitEventIfBrowserIsVisible("meter", juce::var(o)); }
    proc_.endIdleGestures();
    proc_.pollKeyswitch();   // a keyswitch note changed the list: the status event updates the interface
    if (proc_.pollLearned()) browser_.emitEventIfBrowserIsVisible("mappings", proc_.mappingsVar());
    { const auto ch = proc_.takeUiChanges(); if (!ch.isVoid()) browser_.emitEventIfBrowserIsVisible("tags", ch); }
    if (proc_.scopeOn()) browser_.emitEventIfBrowserIsVisible("scope", proc_.scopeVar());
    {   const double b = proc_.hostBpm(); const int s = proc_.hostSig();   // the DAW's tempo, for texts like {bpm} and synced readouts
        if (b > 0 && (std::abs(b - lastBpm_) > 1e-3 || s != lastSig_)) { lastBpm_ = b; lastSig_ = s;
            auto* o = new juce::DynamicObject(); o->setProperty("bpm", b); o->setProperty("n", s / 100); o->setProperty("d", s % 100); browser_.emitEventIfBrowserIsVisible("tempo", juce::var(o)); } }
    {   const int b = proc_.wheelBend(), m = proc_.wheelMod();   // a MIDI keyboard's wheels move the ones on screen
        if (b != lastBend_ || m != lastMod_) { lastBend_ = b; lastMod_ = m;
            auto* o = new juce::DynamicObject(); o->setProperty("bend", b / 16383.0); o->setProperty("mod", m / 127.0); browser_.emitEventIfBrowserIsVisible("wheels", juce::var(o)); } }
    const float vol = proc_.volume();
    if (std::abs(vol - lastVol_) > 1e-4f) { lastVol_ = vol; browser_.emitEventIfBrowserIsVisible("volume", vol); }
}

void VisuEditor::paint(juce::Graphics& g) { g.fillAll(juce::Colour(0xff1c1c1e)); }
void VisuEditor::resized() { browser_.setBounds(getLocalBounds()); }
