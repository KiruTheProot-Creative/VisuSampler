// NodeFX: VisuSampler's node effects as an effect plugin. The chain comes from the editor (VisuMaker's Effects
// editor in NodeFX mode) as JSON; FxRack runs it on the track's audio. 8 macros, Mix and Output are DAW parameters.
#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>
#include <juce_gui_extra/juce_gui_extra.h>
#include "FxRack.h"
#include <array>
#include <atomic>
#include <memory>

class NodeFXProcessor : public juce::AudioProcessor, private juce::AudioProcessorParameter::Listener, private juce::Timer
{
public:
    static constexpr int kMacros = 8;
    NodeFXProcessor();
    ~NodeFXProcessor() override;

    void prepareToPlay(double sampleRate, int maxBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }
    const juce::String getName() const override { return "NodeFX"; }
    bool acceptsMidi() const override { return false; }
    bool producesMidi() const override { return false; }
    double getTailLengthSeconds() const override { return 10.0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}
    void getStateInformation(juce::MemoryBlock&) override;
    void setStateInformation(const void*, int) override;

    // --- for the editor (message thread) ---
    juce::String rackJson() const { const juce::ScopedLock l(stateLock_); return rackJson_; }
    // the editor's chain: stored (saved with the song); rebuild = the sound changed (not just where boxes sit)
    void setRack(const juce::String& json, bool rebuild);
    void queueParam(const juce::String& node, const juce::String& key, float value, bool sync);
    void setMacroFromUi(int i, float v);
    void setMacroName(int i, const juce::String& name);
    void setGlobalFromUi(const juce::String& which, float value);   // "mix" 0..1, "out" dB
    float macro(int i) const { return i >= 0 && i < kMacros ? macros_[(size_t) i]->get() : 0.f; }
    float mix() const { return mix_->get(); }
    float outDb() const { return out_->get(); }
    juce::String lastError() const { const juce::ScopedLock l(stateLock_); return error_; }

    // presets: factory ones (built in) and the user's (Documents/VisuSampler/NodeFX Presets/<bank>/<name>.nfx)
    static juce::File presetFolder();
    juce::var listPresets() const;
    juce::String loadPreset(const juce::String& id) const;
    juce::var savePreset(const juce::String& name, const juce::String& bank, const juce::String& json);
    bool deletePreset(const juce::String& id);

    static juce::String versionText();
    static juce::String communityUrl() { return "https://discord.gg/JFnu6HTwgs"; }

    struct MacroParam : public juce::AudioParameterFloat
    {
        using juce::AudioParameterFloat::operator=;
        explicit MacroParam(int i);
        juce::String getName(int maximumStringLength) const override;
        void setLabel(const juce::String& s) { const juce::SpinLock::ScopedLockType l(lock_); label_ = s; }
    private:
        juce::String label_; juce::SpinLock lock_;
    };

private:
    void parameterValueChanged(int index, float value) override;
    void parameterGestureChanged(int, bool) override {}
    void timerCallback() override;          // frees retired chains off the audio thread
    void rebuild();                         // builds the chain for the current sample rate and hands it over
    void macroNamesFrom(const juce::String& json);

    std::array<MacroParam*, kMacros> macros_ {};
    juce::AudioParameterFloat* mix_ = nullptr;
    juce::AudioParameterFloat* out_ = nullptr;

    juce::CriticalSection stateLock_;
    juce::String rackJson_, error_;
    double sampleRate_ = 48000;

    // chain hand-over: the message thread puts a new chain in pending_, the audio thread takes it and leaves the old one
    // in retired_ for the timer to free (nothing is allocated or freed on the audio thread)
    juce::SpinLock swapLock_;
    std::shared_ptr<visu::FxRack> pending_, current_, retired_;
    std::atomic<bool> hasPending_ { false };

    struct ParamMsg { char node[48]; char key[32]; float value; bool sync; };
    juce::AbstractFifo fifo_ { 256 };
    std::array<ParamMsg, 256> msgs_ {};
    juce::SpinLock pushLock_;

    juce::AudioBuffer<float> dry_;
    juce::LinearSmoothedValue<float> mixS_, gainS_;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(NodeFXProcessor)
};
