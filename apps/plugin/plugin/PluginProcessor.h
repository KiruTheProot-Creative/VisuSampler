#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>
#include "Engine.h"
#include <atomic>
#include <map>
#include <memory>
#include <vector>

class VisuProcessor : public juce::AudioProcessor, public juce::ChangeBroadcaster, private juce::AudioProcessorParameter::Listener
{
public:
    // DAW automation: a fixed set of slots the host sees; each library's knobs (tags) take them in order and lend them their names.
    static constexpr int kMacros = 64;
    struct MacroParam : public juce::AudioParameterFloat
    {
        explicit MacroParam(int i);
        juce::String getName(int maximumStringLength) const override;
        void setLabel(const juce::String& s) { const juce::SpinLock::ScopedLockType l(lock_); label_ = s; }
        int slot;
    private:
        juce::String label_; juce::SpinLock lock_;
    };
    struct Entry { juce::String id; juce::File file; visu::LibraryInfo info; juce::int64 size = 0; };

    VisuProcessor();
    ~VisuProcessor() override;

    // library browser (message thread)
    static juce::File libraryFolder();
    static juce::File logFolder();                         // Documents/VisuSampler/Logs (VisuPlayer.log, for bug reports)
    static void log(const juce::String& line);             // message or loader threads only, never the audio thread
    static juce::String versionText();                     // "0.0.1 (build abc1234)"
    void rescan();
    const std::vector<Entry>& catalog() const { return catalog_; }
    const Entry* entryById(const juce::String& id) const;
    void loadLibrary(const juce::String& id, bool keepTags = false);   // keepTags: restoring a saved project, so the knob values stay
    void unloadLibrary();
    int addLibraryFiles(const juce::Array<juce::File>& files);
    void setList(int index);
    void setListB(int index);   // layer B (-3 = off)
    void setPatch(int layer, int index);
    // the last moments of the output, for graph elements (oscilloscope, spectrum) in the interface
    void setScope(bool on) { scopeOn_.store(on); }
    double hostBpm() const { return hostBpm_.load(); }
    int hostSig() const { return hostSig_.load(); }
    bool scopeOn() const { return scopeOn_.load(); }
    juce::var scopeVar() const;   // patch mode "group": which group of the list plays on a layer
    int currentPatch(int layer) const { const int p = patch_[layer & 1]; return p == -2 && current_ ? current_->defaultPatch[layer & 1] : p; }
    bool pollKeyswitch() { if (!engine_.takeKeyswitchChange()) return false; list_ = engine_.list(); sendChangeMessage(); return true; }
    void panic() { panicRequest_ = true; }
    void setTag(const juce::String& name, float value);   // a knob in the library's interface moved
    void setVolume(float v) { volume_->setValueNotifyingHost(volume_->convertTo0to1(v)); }
    float volume() const { return volume_->get(); }

    juce::var librariesVar() const;   // what the browser shows
    juce::var statusVar() const;      // what play mode shows
    std::shared_ptr<const visu::Library> currentLibrary() const { return current_; }
    const juce::String& currentId() const { return currentId_; }
    juce::var tagsVar() const;   // knob (tag) values the user set, by tag name
    // automation and MIDI learn (message thread)
    juce::var mappingsVar() const;              // { tag name: { slot, cc } }
    void startLearn(const juce::String& tag);   // the next MIDI controller moved drives this knob
    void cancelLearn() { learning_ = false; learnTag_.clear(); }
    void forgetMidi(const juce::String& tag);
    bool pollLearned();                         // true when a learn finished (mappings changed)
    juce::var takeUiChanges();                  // knob values moved by the DAW or MIDI, for the interface
    void endIdleGestures();
    const juce::String& learning() const { return learnTag_; }
    // user presets: the knob values and the list, saved per library in Documents/VisuSampler/Presets/<library>
    juce::File presetFolder() const;
    juce::var presetsVar() const;                         // { names: [...], current }
    bool savePreset(const juce::String& name);
    juce::var loadPreset(const juce::String& name);       // "" = the library's own values; returns { values, list }
    bool deletePreset(const juce::String& name);
    int currentList() const { return list_ == -2 && current_ ? current_->defaultList : list_; }
    int currentListB() const { return listB_ == -2 && current_ ? (current_->layerB ? current_->defaultListB : -3) : listB_; }

    juce::MidiKeyboardState keyboardState;
    int activeVoices() const { return engine_.activeVoices(); }

    // AudioProcessor
    const juce::String getName() const override { return "VisuPlayer"; }
    void prepareToPlay(double sampleRate, int samplesPerBlock) override;
    void releaseResources() override {}
    bool isBusesLayoutSupported(const BusesLayout& layouts) const override;
    void processBlock(juce::AudioBuffer<float>&, juce::MidiBuffer&) override;
    juce::AudioProcessorEditor* createEditor() override;
    bool hasEditor() const override { return true; }
    bool acceptsMidi() const override { return true; }
    bool producesMidi() const override { return false; }
    bool isMidiEffect() const override { return false; }
    double getTailLengthSeconds() const override { return 4.0; }
    int getNumPrograms() override { return 1; }
    int getCurrentProgram() override { return 0; }
    void setCurrentProgram(int) override {}
    const juce::String getProgramName(int) override { return {}; }
    void changeProgramName(int, const juce::String&) override {}
    void getStateInformation(juce::MemoryBlock& destData) override;
    void setStateInformation(const void* data, int sizeInBytes) override;

private:
    void parameterValueChanged(int parameterIndex, float newValue) override;
    void parameterGestureChanged(int, bool) override {}
    void assignSlots();   // after a library loads
    int slotOf(const juce::String& tag) const { for (int i = 0; i < kMacros; ++i) if (slotTag_[i] == tag && tag.isNotEmpty()) return i; return -1; }
    MacroParam* macros_[kMacros] = {};
    juce::String slotTag_[kMacros];
    std::atomic<int> slotTagIndex_[kMacros];
    std::atomic<float> slotValue_[kMacros];
    std::atomic<bool> slotDirty_[kMacros], slotUiDirty_[kMacros], slotFromUi_[kMacros];
    bool gesture_[kMacros] = {}; double gestureTime_[kMacros] = {};
    std::atomic<int> ccSlot_[128];
    std::map<juce::String, int> ccOfTag_;   // saved with the project
    juce::String currentPreset_;
    void applyValue(const juce::String& tag, float v);
    juce::String learnTag_; std::atomic<bool> learning_{ false }; std::atomic<int> learnedCc_{ -1 };
    visu::Engine engine_;
    juce::AudioParameterFloat* volume_ = nullptr;
    std::vector<Entry> catalog_;
    std::shared_ptr<const visu::Library> current_;
    juce::String currentId_, status_ = "No library loaded", pendingId_; bool pendingKeep_ = false;
    std::map<juce::String, float> tagState_; juce::CriticalSection tagLock_;   // saved with the DAW project
    juce::File currentFile_;
    std::atomic<double> hostBpm_{ 0 }; std::atomic<int> hostSig_{ 404 };
    static constexpr int kScope = 4096; float scope_[kScope] = {}; std::atomic<int> scopeW_{ 0 }; std::atomic<bool> scopeOn_{ false };
    int list_ = -2, listB_ = -2, patch_[2] = { -2, -2 }; double sampleRate_ = 0;
    std::atomic<bool> loading_{ false }, panicRequest_{ false };
    std::shared_ptr<std::atomic<bool>> alive_ = std::make_shared<std::atomic<bool>>(true);
    std::atomic<int> loadTicket_{ 0 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(VisuProcessor)
};
