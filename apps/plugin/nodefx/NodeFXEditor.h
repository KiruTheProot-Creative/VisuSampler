#pragma once
#include "NodeFXProcessor.h"

// The NodeFX window: VisuMaker's Effects editor in NodeFX mode (apps/maker/nodefx.html, built in), talking to the
// processor through the native functions below. It sends "macros" and "globals" when the host moves them.
class NodeFXEditor : public juce::AudioProcessorEditor, private juce::Timer
{
public:
    explicit NodeFXEditor(NodeFXProcessor&);
    void paint(juce::Graphics& g) override { g.fillAll(juce::Colour(0xff2b2b2b)); }
    void resized() override { browser_.setBounds(getLocalBounds()); }
private:
    juce::WebBrowserComponent::Options makeOptions();
    std::optional<juce::WebBrowserComponent::Resource> resource(const juce::String& url);
    void timerCallback() override;
    NodeFXProcessor& proc_;
    juce::WebBrowserComponent browser_;
    float lastMacro_[NodeFXProcessor::kMacros] {}; float lastMix_ = -1, lastOut_ = -99;
    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(NodeFXEditor)
};
