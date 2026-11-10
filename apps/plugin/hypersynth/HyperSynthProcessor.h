// HyperSynth: the plugin around the sound engine (engine/Synth.h). Every engine parameter is a DAW parameter with the
// same id; the panel (ui/hypersynth.html) sets them, the host automates them, and each block hands the values to the
// engine. Presets are .hsyn files in Documents\VisuSampler\HyperSynth Presets\<category>\<name>.hsyn.
#pragma once
#include <juce_audio_utils/juce_audio_utils.h>
#include <array>
#include <atomic>
#include "Synth.h"

class HyperSynthProcessor : public juce::AudioProcessor
{
public:
    HyperSynthProcessor();
    ~HyperSynthProcessor() override = default;

    void prepareToPlay(double sampleRate, int maxBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported(const BusesLayout&) const override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    using AudioProcessor::processBlock;

    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }
    const juce::String getName() const override { return "HyperSynth"; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 2.0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return presetName(); }
    void changeProgramName(int, const juce::String&) override {}
    void getStateInformation(juce::MemoryBlock&) override;
    void setStateInformation(const void*, int) override;

    /* for the panel (message thread) */
    int numParams() const { return (int) params_.size(); }
    float value(int i) const;                             // in the parameter's own units (Hz, ms, a choice's index)
    int indexOf(const juce::String& id) const { return visu::hs::paramIndex(id.toStdString()); }
    void setFromUi(int i, float v);
    void gesture(int i, bool begin);
    void uiNote(int key, float velocity, bool on);
    void uiBend(float v);                                 // -1..1
    void uiMod(float v);                                  // 0..1
    juce::var paramDefs() const;
    juce::var values() const;
    juce::String presetName() const { const juce::ScopedLock l(nameLock_); return name_; }
    juce::String presetCategory() const { const juce::ScopedLock l(nameLock_); return category_; }
    juce::var listPresets() const;
    juce::var loadPreset(const juce::String& id);         // {name, category} or {error}
    juce::var savePreset(const juce::String& name, const juce::String& category);
    bool deletePreset(const juce::String& id);
    // wavetable import: a file picker, then the sound -> frames -> oscillator `osc` (0..2) of `layer` (0/1)
    void importTable(int layer, int osc, std::function<void(juce::var)> done);
    juce::var tablePreview(int layer, int osc) const;   // {name, frames: [[...128 samples], ...]} or void
    static juce::File presetFolder();
    static juce::String versionText();
    static juce::String communityUrl() { return "https://discord.gg/JFnu6HTwgs"; }

    std::array<std::atomic<bool>, 128> keysDown {};
    std::atomic<int> activeVoices { 0 };
    std::atomic<float> bendNow { 0 }, modNow { 0 };

private:
    juce::String stateJson(const juce::String& name, const juce::String& category) const;
    bool applyJson(const juce::String& json, juce::String* error);   // a .hsyn text into the parameters
    void setNames(const juce::String& n, const juce::String& c) { const juce::ScopedLock l(nameLock_); name_ = n; category_ = c; }
    void handle(const juce::MidiMessage&);

    void copyTables(const visu::hs::Synth& from, visu::hs::Synth& to) const;
    std::unique_ptr<juce::FileChooser> chooser_;
    visu::hs::Synth synth_;
    std::vector<juce::RangedAudioParameter*> params_;
    std::vector<float> sent_;                             // what the engine has (audio thread)
    struct UiEvent { int type, key; float value; };       // 0 note on, 1 note off, 2 bend, 3 mod wheel
    juce::AbstractFifo fifo_ { 256 };
    std::array<UiEvent, 256> events_ {};
    juce::CriticalSection nameLock_;
    juce::String name_ { "Init" }, category_ { "Basics" };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(HyperSynthProcessor)
};
