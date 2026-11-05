#pragma once
#include <juce_audio_processors/juce_audio_processors.h>
#include <juce_audio_utils/juce_audio_utils.h>
#include "Engine.h"
#include <atomic>
#include <memory>
#include <vector>

class VisuProcessor : public juce::AudioProcessor, public juce::ChangeBroadcaster
{
public:
    struct Entry { juce::String id; juce::File file; visu::LibraryInfo info; juce::int64 size = 0; };

    VisuProcessor();
    ~VisuProcessor() override;

    // library browser (message thread)
    static juce::File libraryFolder();
    void rescan();
    const std::vector<Entry>& catalog() const { return catalog_; }
    const Entry* entryById(const juce::String& id) const;
    void loadLibrary(const juce::String& id);
    void unloadLibrary();
    int addLibraryFiles(const juce::Array<juce::File>& files);
    void setList(int index);
    void panic() { panicRequest_ = true; }
    void setVolume(float v) { volume_->setValueNotifyingHost(volume_->convertTo0to1(v)); }
    float volume() const { return volume_->get(); }

    juce::var librariesVar() const;   // what the browser shows
    juce::var statusVar() const;      // what play mode shows
    std::shared_ptr<const visu::Library> currentLibrary() const { return current_; }
    const juce::String& currentId() const { return currentId_; }
    int currentList() const { return list_ == -2 && current_ ? current_->defaultList : list_; }

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
    visu::Engine engine_;
    juce::AudioParameterFloat* volume_ = nullptr;
    std::vector<Entry> catalog_;
    std::shared_ptr<const visu::Library> current_;
    juce::String currentId_, status_ = "No library loaded", pendingId_;
    juce::File currentFile_;
    int list_ = -2;
    std::atomic<bool> loading_{ false }, panicRequest_{ false };
    std::shared_ptr<std::atomic<bool>> alive_ = std::make_shared<std::atomic<bool>>(true);
    std::atomic<int> loadTicket_{ 0 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(VisuProcessor)
};
