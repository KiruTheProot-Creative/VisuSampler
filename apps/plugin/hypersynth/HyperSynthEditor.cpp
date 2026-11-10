#include "HyperSynthEditor.h"
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

HyperSynthEditor::HyperSynthEditor(HyperSynthProcessor& p) : AudioProcessorEditor(&p), proc_(p), browser_(makeOptions())
{
    addAndMakeVisible(browser_);
    setResizable(true, true); setResizeLimits(960, 528, 3200, 1760);
    if (auto* c = getConstrainer()) c->setFixedAspectRatio(1600.0 / 880.0);
    setSize(1440, 792);
    browser_.goToURL(juce::WebBrowserComponent::getResourceProviderRoot() + "hypersynth.html");
    shown_.resize((size_t) proc_.numParams()); for (int i = 0; i < proc_.numParams(); ++i) shown_[(size_t) i] = proc_.value(i);
    startTimerHz(30);
}

/* JUCE hands over just the path ("/hypersynth.html", "/Unbounded.ttf"); every built-in file is found by its name */
std::optional<juce::WebBrowserComponent::Resource> HyperSynthEditor::resource(const juce::String& url)
{
    auto file = url.upToFirstOccurrenceOf("?", false, false).upToFirstOccurrenceOf("#", false, false).fromLastOccurrenceOf("/", false, false);
    if (file.isEmpty()) file = "hypersynth.html";
    for (int i = 0; i < BinaryData::namedResourceListSize; ++i) {
        if (file != BinaryData::originalFilenames[i]) continue;
        int size = 0;
        if (const char* d = BinaryData::getNamedResource(BinaryData::namedResourceList[i], size)) {
            std::vector<std::byte> v((size_t) size); std::memcpy(v.data(), d, (size_t) size);
            return juce::WebBrowserComponent::Resource { std::move(v), mimeFor(file) };
        }
    }
    return std::nullopt;
}

juce::WebBrowserComponent::Options HyperSynthEditor::makeOptions()
{
    using O = juce::WebBrowserComponent::Options;
    auto reply = [](juce::WebBrowserComponent::NativeFunctionCompletion& done, juce::var v) { done(std::move(v)); };
    auto idx = [this](const juce::var& v) { return proc_.indexOf(v.toString()); };
    return O{}
        .withBackend(O::Backend::webview2)
        .withWinWebView2Options(O::WinWebView2{}.withUserDataFolder(juce::File::getSpecialLocation(juce::File::tempDirectory).getChildFile("HyperSynthWebView")))
        .withKeepPageLoadedWhenBrowserIsHidden()
        .withNativeIntegrationEnabled()
        .withResourceProvider([this](const juce::String& url) { return resource(url); })
        .withNativeFunction("getState", [this, reply](const juce::Array<juce::var>&, auto done) {
            auto* o = new juce::DynamicObject(); o->setProperty("defs", proc_.paramDefs()); o->setProperty("values", proc_.values());
            o->setProperty("name", proc_.presetName()); o->setProperty("category", proc_.presetCategory()); o->setProperty("version", HyperSynthProcessor::versionText());
            reply(done, juce::var(o)); })
        .withNativeFunction("setParam", [this, reply, idx](const juce::Array<juce::var>& a, auto done) {
            if (a.size() >= 2) { const int i = idx(a[0]); proc_.setFromUi(i, (float) (double) a[1]); if (i >= 0) shown_[(size_t) i] = proc_.value(i); }
            reply(done, juce::var(true)); })
        .withNativeFunction("gesture", [this, reply, idx](const juce::Array<juce::var>& a, auto done) {
            if (a.size() >= 2) proc_.gesture(idx(a[0]), (bool) a[1]); reply(done, juce::var(true)); })
        .withNativeFunction("note", [this, reply](const juce::Array<juce::var>& a, auto done) {
            if (a.size() >= 3) proc_.uiNote((int) a[0], (float) (double) a[1], (bool) a[2]); reply(done, juce::var(true)); })
        .withNativeFunction("bend", [this, reply](const juce::Array<juce::var>& a, auto done) { if (!a.isEmpty()) proc_.uiBend((float) (double) a[0]); reply(done, juce::var(true)); })
        .withNativeFunction("mod", [this, reply](const juce::Array<juce::var>& a, auto done) { if (!a.isEmpty()) proc_.uiMod((float) (double) a[0]); reply(done, juce::var(true)); })
        .withNativeFunction("listPresets", [this, reply](const juce::Array<juce::var>&, auto done) { reply(done, proc_.listPresets()); })
        .withNativeFunction("loadPreset", [this, reply](const juce::Array<juce::var>& a, auto done) {
            auto r = a.isEmpty() ? juce::var() : proc_.loadPreset(a[0].toString());
            for (int i = 0; i < proc_.numParams(); ++i) shown_[(size_t) i] = proc_.value(i);
            reply(done, r); })
        .withNativeFunction("savePreset", [this, reply](const juce::Array<juce::var>& a, auto done) {
            reply(done, a.size() >= 2 ? proc_.savePreset(a[0].toString(), a[1].toString()) : juce::var()); })
        .withNativeFunction("deletePreset", [this, reply](const juce::Array<juce::var>& a, auto done) {
            reply(done, juce::var(!a.isEmpty() && proc_.deletePreset(a[0].toString()))); })
        .withNativeFunction("openPresetFolder", [reply](const juce::Array<juce::var>&, auto done) {
            HyperSynthProcessor::presetFolder().createDirectory(); HyperSynthProcessor::presetFolder().startAsProcess(); reply(done, juce::var(true)); })
        .withNativeFunction("openCommunity", [reply](const juce::Array<juce::var>&, auto done) {
            juce::URL(HyperSynthProcessor::communityUrl()).launchInDefaultBrowser(); reply(done, juce::var(true)); });
}

/* what the host changed (automation, a DAW preset), the keys sounding, the wheels: shown on the panel */
void HyperSynthEditor::timerCallback()
{
    juce::Array<juce::var> ii, vv;
    for (int i = 0; i < proc_.numParams(); ++i) { const float v = proc_.value(i); if (v != shown_[(size_t) i]) { shown_[(size_t) i] = v; ii.add(i); vv.add(v); } }
    if (!ii.isEmpty()) { auto* o = new juce::DynamicObject(); o->setProperty("i", ii); o->setProperty("v", vv); o->setProperty("name", proc_.presetName()); browser_.emitEventIfBrowserIsVisible("values", juce::var(o)); }
    bool keysChanged = false; juce::Array<juce::var> down;
    for (int k = 0; k < 128; ++k) { const bool d = proc_.keysDown[(size_t) k].load(); if (d != keys_[(size_t) k]) keysChanged = true; keys_[(size_t) k] = d; if (d) down.add(k); }
    const int nv = proc_.activeVoices.load();
    if (keysChanged || nv != voices_) {
        voices_ = nv; auto* o = new juce::DynamicObject(); o->setProperty("keys", down); o->setProperty("voices", nv);
        o->setProperty("bend", proc_.bendNow.load()); o->setProperty("mod", proc_.modNow.load()); browser_.emitEventIfBrowserIsVisible("play", juce::var(o));
    }
}
