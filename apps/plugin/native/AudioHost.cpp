// VisuMakerAudio: VisuMaker's native audio on Windows (and wherever JUCE runs). It plays the project through the same
// engine as the VST, on the sound card with a low-latency driver, and takes commands from VisuMaker on stdin
// (see HelperCore.h). Device commands are handled here:
//   {t:'devices'}                                   -> {t:'devices',types:[{name,devices:[..]}],current:{type,device,rate,buffer,latencyMs},rates:[..],buffers:[..]}
//   {t:'setDevice',type,device,rate,buffer}          -> applies it, then answers like 'devices' (with error when it failed)
// It exits when stdin closes (VisuMaker quit or restarted it).
#include "HelperCore.h"
#include <juce_audio_devices/juce_audio_devices.h>
#include <juce_events/juce_events.h>
#include <iostream>
#include <thread>

using namespace visu;

namespace {
struct Callback : juce::AudioIODeviceCallback {
    HelperCore& core; std::vector<float> l, r;
    explicit Callback(HelperCore& c) : core(c) {}
    void audioDeviceAboutToStart(juce::AudioIODevice* d) override {
        const int n = std::max(64, d->getCurrentBufferSizeSamples()) * 2; l.assign((size_t) n, 0.f); r.assign((size_t) n, 0.f);
        core.prepare(d->getCurrentSampleRate(), n);
    }
    void audioDeviceStopped() override {}
    void audioDeviceIOCallbackWithContext(const float* const*, int, float* const* out, int nOut, int n, const juce::AudioIODeviceCallbackContext&) override {
        if (n > (int) l.size()) { for (int c = 0; c < nOut; ++c) if (out[c]) juce::FloatVectorOperations::clear(out[c], n); return; }
        core.render(l.data(), r.data(), n);
        for (int c = 0; c < nOut; ++c) if (out[c]) juce::FloatVectorOperations::copy(out[c], c % 2 ? r.data() : l.data(), n);
    }
};

struct Host : juce::Timer {
    HelperCore core; juce::AudioDeviceManager dm; Callback cb{ core };
    Host() {
        core.send = [](const std::string& s) { std::fwrite(s.data(), 1, s.size(), stdout); std::fputc('\n', stdout); std::fflush(stdout); };
        dm.initialise(0, 2, nullptr, true);
        // the lowest-latency Windows driver that works, at a small buffer
        for (const char* t : { "Windows Audio (Low Latency Mode)", "Windows Audio" })
            for (auto* type : dm.getAvailableDeviceTypes()) if (type->getTypeName() == t) { dm.setCurrentAudioDeviceType(t, true); goto chosen; }
        chosen:
        { auto s = dm.getAudioDeviceSetup(); s.bufferSize = 128; s.inputDeviceName = {}; s.useDefaultInputChannels = false; s.inputChannels.clear(); dm.setAudioDeviceSetup(s, true); }
        dm.addAudioCallback(&cb);
        startTimerHz(30);
        core.out("{\"t\":\"ready\",\"native\":true," + currentJson().substr(1));
    }
    ~Host() override { stopTimer(); dm.removeAudioCallback(&cb); dm.closeAudioDevice(); }
    void timerCallback() override { core.tick(); }
    static std::string q(const juce::String& s) { return "\"" + HelperCore::esc(s.toStdString()) + "\""; }
    std::string currentJson() {
        auto* d = dm.getCurrentAudioDevice(); auto s = dm.getAudioDeviceSetup();
        const double rate = d ? d->getCurrentSampleRate() : 0; const int buf = d ? d->getCurrentBufferSizeSamples() : 0;
        const double lat = d && rate > 0 ? (d->getOutputLatencyInSamples() + buf) * 1000.0 / rate : 0;
        return "{\"type\":" + q(dm.getCurrentAudioDeviceType()) + ",\"device\":" + q(s.outputDeviceName) + ",\"rate\":" + std::to_string((int) rate)
            + ",\"buffer\":" + std::to_string(buf) + ",\"latencyMs\":" + std::to_string(std::round(lat * 10) / 10) + "}";
    }
    void devices(const juce::String& error) {
        std::string o = "{\"t\":\"devices\",\"types\":[";
        bool first = true;
        for (auto* type : dm.getAvailableDeviceTypes()) {
            type->scanForDevices(); o += (first ? "" : ",") + std::string("{\"name\":") + q(type->getTypeName()) + ",\"devices\":["; first = false;
            auto names = type->getDeviceNames(false); for (int i = 0; i < names.size(); ++i) o += (i ? "," : "") + q(names[i]);
            o += "]}";
        }
        o += "],\"current\":" + currentJson();
        auto* d = dm.getCurrentAudioDevice();
        o += ",\"rates\":["; if (d) { auto r = d->getAvailableSampleRates(); for (int i = 0; i < r.size(); ++i) o += (i ? "," : "") + std::to_string((int) r[i]); }
        o += "],\"buffers\":["; if (d) { auto b = d->getAvailableBufferSizes(); for (int i = 0; i < b.size(); ++i) o += (i ? "," : "") + std::to_string(b[i]); }
        o += "]" + (error.isNotEmpty() ? ",\"error\":" + q(error) : std::string()) + "}";
        core.out(o);
    }
    void setDevice(const Json& m) {
        juce::String err;
        const juce::String type = m["type"].str(), name = m["device"].str();
        if (type.isNotEmpty() && type != dm.getCurrentAudioDeviceType()) dm.setCurrentAudioDeviceType(type, true);
        auto s = dm.getAudioDeviceSetup();
        if (name.isNotEmpty()) s.outputDeviceName = name;
        if (m["rate"].num() > 0) s.sampleRate = m["rate"].num();
        if (m["buffer"].integer() > 0) s.bufferSize = m["buffer"].integer();
        s.inputDeviceName = {}; s.useDefaultInputChannels = false; s.inputChannels.clear();
        err = dm.setAudioDeviceSetup(s, true);
        if (err.isEmpty() && !dm.getCurrentAudioDevice()) err = "the device did not open";
        devices(err);
    }
};
}

int main() {
    juce::ScopedJuceInitialiser_GUI init;
    std::unique_ptr<Host> host = std::make_unique<Host>();
    Host* h = host.get();
    std::thread in([h] {
        std::string line;
        while (std::getline(std::cin, line)) {
            if (!line.empty() && line.back() == '\r') line.pop_back(); if (line.empty()) continue;
            if (line.find("\"devices\"") != std::string::npos || line.find("\"setDevice\"") != std::string::npos) {
                Json m; try { m = Json::parse(line.data(), line.size()); } catch (...) { continue; }
                const std::string t = m["t"].str();
                if (t == "devices") { juce::MessageManager::callAsync([h] { h->devices({}); }); continue; }
                if (t == "setDevice") { juce::MessageManager::callAsync([h, m] { h->setDevice(m); }); continue; }
            }
            h->core.command(line);
        }
        juce::MessageManager::callAsync([] { juce::MessageManager::getInstance()->stopDispatchLoop(); });   // VisuMaker closed the pipe
    });
    juce::MessageManager::getInstance()->runDispatchLoop();
    in.detach();
    host.reset();
    return 0;
}
