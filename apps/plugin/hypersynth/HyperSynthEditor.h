// HyperSynth's window: the physical-looking panel (ui/hypersynth.html) in a web view, talking to the processor.
#pragma once
#include "HyperSynthProcessor.h"

class HyperSynthEditor : public juce::AudioProcessorEditor, private juce::Timer
{
public:
    explicit HyperSynthEditor(HyperSynthProcessor&);
    void resized() override { browser_.setBounds(getLocalBounds()); }
private:
    void timerCallback() override;
    juce::WebBrowserComponent::Options makeOptions();
    std::optional<juce::WebBrowserComponent::Resource> resource(const juce::String& url);
    HyperSynthProcessor& proc_;
    juce::WebBrowserComponent browser_;
    std::vector<float> shown_;           // what the panel shows: changes from the host are sent on
    std::array<bool, 128> keys_ {};
    int voices_ = -1;
    std::array<float, 12> srcShown_ {};
};
