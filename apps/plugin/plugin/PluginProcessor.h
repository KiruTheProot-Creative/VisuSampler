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
    struct Entry { juce::File file; visu::LibraryInfo info; juce::Image tile, wide; };

    VisuProcessor();
    ~VisuProcessor() override;

    // library browser (message thread)
    static juce::File libraryFolder();
    void rescan();
    const std::vector<Entry>& catalog() const { return catalog_; }
    void loadLibrary(const juce::File& file);
    const juce::String& status() const { return status_; }
    const Entry* currentEntry() const;
    bool isLoading() const { return loading_; }
    juce::File currentFile() const { return current_; }
    void unloadLibrary();
    void addLibraryFile(const juce::File& file);

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
    juce::String status_ = "No library loaded";
    juce::File current_;
    std::atomic<bool> loading_{ false };
    std::shared_ptr<std::atomic<bool>> alive_ = std::make_shared<std::atomic<bool>>(true);
    std::atomic<int> loadTicket_{ 0 };

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(VisuProcessor)
};
