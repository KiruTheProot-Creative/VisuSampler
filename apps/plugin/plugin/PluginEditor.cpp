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
    startTimerHz(8);
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
            auto* o = new juce::DynamicObject(); o->setProperty("volume", proc_.volume()); o->setProperty("status", proc_.statusVar()); reply(done, juce::var(o)); })
        .withNativeFunction("loadLibrary", [this, reply](const juce::Array<juce::var>& a, auto done) {
            const auto id = a.isEmpty() ? juce::String() : a[0].toString();
            if (!proc_.entryById(id)) { auto* o = new juce::DynamicObject(); o->setProperty("error", "library not found"); reply(done, juce::var(o)); return; }
            proc_.loadLibrary(id); reply(done, juce::var(true)); })
        .withNativeFunction("unload", [this, reply](const juce::Array<juce::var>&, auto done) { proc_.unloadLibrary(); reply(done, juce::var(true)); })
        .withNativeFunction("setList", [this, reply](const juce::Array<juce::var>& a, auto done) { if (!a.isEmpty()) proc_.setList((int) a[0]); reply(done, juce::var(true)); })
        .withNativeFunction("setVolume", [this, reply](const juce::Array<juce::var>& a, auto done) { if (!a.isEmpty()) proc_.setVolume((float) (double) a[0]); reply(done, juce::var(true)); })
        .withNativeFunction("noteOn", [this, reply](const juce::Array<juce::var>& a, auto done) {
            if (a.size() >= 2) proc_.keyboardState.noteOn(1, juce::jlimit(0, 127, (int) a[0]), juce::jlimit(1, 127, (int) a[1]) / 127.0f); reply(done, juce::var(true)); })
        .withNativeFunction("noteOff", [this, reply](const juce::Array<juce::var>& a, auto done) {
            if (!a.isEmpty()) proc_.keyboardState.noteOff(1, juce::jlimit(0, 127, (int) a[0]), 0.0f); reply(done, juce::var(true)); })
        .withNativeFunction("panic", [this, reply](const juce::Array<juce::var>&, auto done) { proc_.keyboardState.allNotesOff(1); proc_.panic(); reply(done, juce::var(true)); })
        .withNativeFunction("openFolder", [reply](const juce::Array<juce::var>&, auto done) { VisuProcessor::libraryFolder().startAsProcess(); reply(done, juce::var(true)); })
        .withNativeFunction("addLibrary", [this](const juce::Array<juce::var>&, juce::WebBrowserComponent::NativeFunctionCompletion done) {
            chooser_ = std::make_unique<juce::FileChooser>("Add libraries", juce::File(), "*.vsamp;*.zip");
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
            const std::string& b = kind.startsWith("wide") ? e->info.bannerWide : kind.startsWith("icon") ? e->info.bannerIcon : e->info.bannerTile;
            if (!b.empty()) return juce::WebBrowserComponent::Resource{ bytesOf(b.data(), b.size()), "image/png" };
        }
        return std::nullopt;
    }
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
    const float vol = proc_.volume();
    if (std::abs(vol - lastVol_) > 1e-4f) { lastVol_ = vol; browser_.emitEventIfBrowserIsVisible("volume", vol); }
}

void VisuEditor::paint(juce::Graphics& g) { g.fillAll(juce::Colour(0xff1c1c1e)); }
void VisuEditor::resized() { browser_.setBounds(getLocalBounds()); }
