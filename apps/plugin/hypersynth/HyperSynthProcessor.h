// HyperSynth: the plugin around the sound engine (engine/Synth.h). Every engine parameter is a DAW parameter with the
// same id; the panel (ui/hypersynth.html) sets them, the host automates them, and each block hands the values to the
// engine. Presets are .hsyn files in Documents\VisuSampler\HyperSynth Presets\<category>\<name>.hsyn.
#pragma once
#include <juce_audio_utils/juce_audio_utils.h>
#include <array>
#include <atomic>
#include "Synth.h"
#include "FxRack.h"

class HyperSynthProcessor : public juce::AudioProcessor, private juce::Timer
{
public:
    HyperSynthProcessor();
    ~HyperSynthProcessor() override { stopTimer(); }

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
    double getTailLengthSeconds() const override { return 6.0; }
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
    // INIT: everything back to the Init sound (no samples, tables, modulation or effects); undoInit() brings back what was there
    juce::var initSound();
    juce::var undoInit();
    // wavetable import: a file picker, then the sound -> frames -> oscillator `osc` (0..2) of `layer` (0/1)
    void importTable(int layer, int osc, std::function<void(juce::var)> done);
    juce::var tablePreview(int layer, int osc) const;   // {name, frames: [[...128 samples], ...]} or void
    // Sample mode: a file picker, then the sound -> oscillator `osc` of `layer` (its key found, Sample mode on)
    void importSample(int layer, int osc, std::function<void(juce::var)> done);
    juce::var samplePreview(int layer, int osc) const;  // {name, seconds, ch, peaks: [max, min, ...] x 300} or void
    // modulation (message thread): {routes:[{src,dst,amt}], shapes:[[x,y,curve,...] x4], names:[macro names]}
    juce::var modState() const;
    void setMods(const juce::var& routes);
    void setLfoShape(int lfo, const juce::var& pts);
    void setMacroName(int i, const juce::String& name);
    float sourceValue(const juce::String& src) const { return synth_.sourceValue(src.toStdString()); }
    // the FX tab: NodeFX's modules after the synth. json = {"graph":{nodes,cables},"fxRanges":{...}} ("" = no effects);
    // rebuild = the sound changed (not just where modules sit). Saved in .hsyn presets and the DAW project as "fx".
    juce::String fxJson() const { const juce::ScopedLock l(fxLock_); return fxJson_; }
    void setFx(const juce::String& json, bool rebuild);
    void queueFxParam(const juce::String& node, const juce::String& key, float value);
    juce::String fxError() const { const juce::ScopedLock l(fxLock_); return fxError_; }
    static juce::File presetFolder();
    static juce::String versionText();
    static juce::String communityUrl() { return "https://discord.gg/JFnu6HTwgs"; }

    std::array<std::atomic<bool>, 128> keysDown {};
    std::atomic<int> activeVoices { 0 };
    std::atomic<float> bendNow { 0 }, modNow { 0 }, atNow { 0 };

private:
    juce::String stateJson(const juce::String& name, const juce::String& category) const;
    bool applyJson(const juce::String& json, juce::String* error);   // a .hsyn text into the parameters
    void setNames(const juce::String& n, const juce::String& c) { const juce::ScopedLock l(nameLock_); name_ = n; category_ = c; }
    void handle(const juce::MidiMessage&);
    // the FX tab's envelopes: start on each new note, release when the last held key is let go (audio thread)
    void fxNote(int key, float velocity, bool on);
    std::array<bool, 128> fxDown_ {}; int fxHeld_ = 0;

    void timerCallback() override;          // frees retired effect chains, tells the DAW the latency
    void rebuildFx();
    juce::CriticalSection fxLock_;
    juce::String fxJson_, fxError_;
    double sampleRate_ = 48000;
    juce::SpinLock swapLock_;
    std::shared_ptr<visu::FxRack> fxPending_, fxCurrent_, fxRetired_;
    std::atomic<bool> fxHasPending_ { false };
    std::atomic<int> fxLatency_ { 0 };
    struct FxMsg { char node[48]; char key[32]; float value; };
    juce::AbstractFifo fxFifo_ { 256 };
    std::array<FxMsg, 256> fxMsgs_ {};
    juce::SpinLock fxPushLock_;
    void copyTables(const visu::hs::Synth& from, visu::hs::Synth& to) const;   // imported wavetables and the modulation
    int macroIdx_[4] = { -1, -1, -1, -1 };
    std::unique_ptr<juce::FileChooser> chooser_;
    visu::hs::Synth synth_;
    std::vector<juce::RangedAudioParameter*> params_;
    std::vector<float> sent_;                             // what the engine has (audio thread)
    struct UiEvent { int type, key; float value; };       // 0 note on, 1 note off, 2 bend, 3 mod wheel
    juce::AbstractFifo fifo_ { 256 };
    std::array<UiEvent, 256> events_ {};
    juce::CriticalSection nameLock_;
    juce::String name_ { "Init" }, category_ { "Basics" };
    juce::String beforeInit_;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(HyperSynthProcessor)
};
