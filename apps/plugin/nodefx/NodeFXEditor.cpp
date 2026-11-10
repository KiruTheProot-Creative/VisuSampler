#include "NodeFXEditor.h"
#include "BinaryData.h"

namespace
{
juce::String mimeFor(const juce::String& p)
{
    if (p.endsWithIgnoreCase(".html")) return "text/html";
    if (p.endsWithIgnoreCase(".js")) return "text/javascript";
    if (p.endsWithIgnoreCase(".css")) return "text/css";
    if (p.endsWithIgnoreCase(".ttf")) return "font/ttf";
    return "application/octet-stream";
}
}

NodeFXEditor::NodeFXEditor(NodeFXProcessor& p) : AudioProcessorEditor(&p), proc_(p), browser_(makeOptions())
{
    addAndMakeVisible(browser_);
    setResizable(true, true); setResizeLimits(900, 560, 2600, 1700); setSize(1280, 780);
    browser_.goToURL(juce::WebBrowserComponent::getResourceProviderRoot() + "apps/maker/nodefx.html");
    for (int i = 0; i < NodeFXProcessor::kMacros; ++i) lastMacro_[i] = proc_.macro(i);
    startTimerHz(30);
}

/* the page and what it loads, built in. JUCE hands over just the path ("/apps/maker/nodefx.html",
   "/packages/core/src/index.js", "/assets/fonts/Figtree.ttf"); every file is found by its own name. */
std::optional<juce::WebBrowserComponent::Resource> NodeFXEditor::resource(const juce::String& url)
{
    auto file = url.upToFirstOccurrenceOf("?", false, false).upToFirstOccurrenceOf("#", false, false).fromLastOccurrenceOf("/", false, false);
    if (file.isEmpty()) file = "nodefx.html";
    for (int i = 0; i < BinaryData::namedResourceListSize; ++i)
    {
        if (file != BinaryData::originalFilenames[i]) continue;
        int size = 0;
        if (const char* d = BinaryData::getNamedResource(BinaryData::namedResourceList[i], size)) {
            std::vector<std::byte> v((size_t) size); std::memcpy(v.data(), d, (size_t) size);
            return juce::WebBrowserComponent::Resource { std::move(v), mimeFor(file) };
        }
    }
    DBG("NodeFX: no built-in file for " << url);
    return std::nullopt;
}

juce::WebBrowserComponent::Options NodeFXEditor::makeOptions()
{
    using O = juce::WebBrowserComponent::Options;
    auto reply = [](juce::WebBrowserComponent::NativeFunctionCompletion& done, juce::var v) { done(std::move(v)); };
    return O{}
        .withBackend(O::Backend::webview2)
        .withWinWebView2Options(O::WinWebView2{}.withUserDataFolder(juce::File::getSpecialLocation(juce::File::tempDirectory).getChildFile("NodeFXWebView")))
        .withKeepPageLoadedWhenBrowserIsHidden()
        .withNativeIntegrationEnabled()
        .withResourceProvider([this](const juce::String& url) { return resource(url); })
        .withNativeFunction("getRack", [this, reply](const juce::Array<juce::var>&, auto done) {
            const auto j = proc_.rackJson(); reply(done, j.isEmpty() ? juce::var() : juce::var(j)); })
        .withNativeFunction("setRack", [this, reply](const juce::Array<juce::var>& a, auto done) {
            if (!a.isEmpty()) proc_.setRack(a[0].toString(), a.size() < 2 || (bool) a[1]);
            reply(done, proc_.lastError().isEmpty() ? juce::var(true) : juce::var(proc_.lastError())); })
        .withNativeFunction("setParam", [this, reply](const juce::Array<juce::var>& a, auto done) {
            if (a.size() >= 3) proc_.queueParam(a[0].toString(), a[1].toString(), (float) (double) a[2], a.size() > 3 && (bool) a[3]);
            reply(done, juce::var(true)); })
        .withNativeFunction("setMacro", [this, reply](const juce::Array<juce::var>& a, auto done) {
            if (a.size() >= 2) { const int i = (int) a[0]; proc_.setMacroFromUi(i, (float) (double) a[1]); if (i >= 0 && i < NodeFXProcessor::kMacros) lastMacro_[i] = proc_.macro(i); }
            reply(done, juce::var(true)); })
        .withNativeFunction("setMacroName", [this, reply](const juce::Array<juce::var>& a, auto done) {
            if (a.size() >= 2) proc_.setMacroName((int) a[0], a[1].toString()); reply(done, juce::var(true)); })
        .withNativeFunction("setGlobal", [this, reply](const juce::Array<juce::var>& a, auto done) {
            if (a.size() >= 2) { proc_.setGlobalFromUi(a[0].toString(), (float) (double) a[1]); lastMix_ = proc_.mix(); lastOut_ = proc_.outDb(); }
            reply(done, juce::var(true)); })
        .withNativeFunction("listPresets", [this, reply](const juce::Array<juce::var>&, auto done) { reply(done, proc_.listPresets()); })
        .withNativeFunction("loadPreset", [this, reply](const juce::Array<juce::var>& a, auto done) {
            const auto j = a.isEmpty() ? juce::String() : proc_.loadPreset(a[0].toString()); reply(done, j.isEmpty() ? juce::var() : juce::var(j)); })
        .withNativeFunction("savePreset", [this, reply](const juce::Array<juce::var>& a, auto done) {
            if (a.size() < 3) { reply(done, juce::var()); return; }
            reply(done, proc_.savePreset(a[0].toString(), a[1].toString(), a[2].toString())); })
        .withNativeFunction("deletePreset", [this, reply](const juce::Array<juce::var>& a, auto done) {
            reply(done, juce::var(!a.isEmpty() && proc_.deletePreset(a[0].toString()))); })
        .withNativeFunction("openPresetFolder", [reply](const juce::Array<juce::var>&, auto done) {
            NodeFXProcessor::presetFolder().createDirectory(); NodeFXProcessor::presetFolder().startAsProcess(); reply(done, juce::var(true)); })
        .withNativeFunction("openCommunity", [reply](const juce::Array<juce::var>&, auto done) {
            juce::URL(NodeFXProcessor::communityUrl()).launchInDefaultBrowser(); reply(done, juce::var(true)); })
        .withNativeFunction("getVersion", [reply](const juce::Array<juce::var>&, auto done) { reply(done, juce::var(NodeFXProcessor::versionText())); });
}

/* the host moved macros, Mix or Output (automation, a preset of the DAW): show it */
void NodeFXEditor::timerCallback()
{
    bool moved = false; juce::Array<juce::var> v;
    for (int i = 0; i < NodeFXProcessor::kMacros; ++i) { const float m = proc_.macro(i); if (std::abs(m - lastMacro_[i]) > 1e-4f) moved = true; lastMacro_[i] = m; v.add(m); }
    if (moved) { auto* o = new juce::DynamicObject(); o->setProperty("v", v); browser_.emitEventIfBrowserIsVisible("macros", juce::var(o)); }
    if (std::abs(proc_.mix() - lastMix_) > 1e-4f || std::abs(proc_.outDb() - lastOut_) > 1e-3f) {
        lastMix_ = proc_.mix(); lastOut_ = proc_.outDb();
        auto* o = new juce::DynamicObject(); o->setProperty("mix", lastMix_); o->setProperty("out", lastOut_); browser_.emitEventIfBrowserIsVisible("globals", juce::var(o));
    }
}
