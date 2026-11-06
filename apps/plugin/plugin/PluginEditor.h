#pragma once
#include "PluginProcessor.h"

// The plugin window is a web view showing the library browser and play mode (apps/plugin/ui).
// The page calls the native functions below; the plugin sends "libraries", "status", "meter" and "volume" events back.
class VisuEditor : public juce::AudioProcessorEditor, private juce::ChangeListener, private juce::Timer
{
public:
    explicit VisuEditor(VisuProcessor&);
    ~VisuEditor() override;
    void paint(juce::Graphics&) override;
    void resized() override;

private:
    juce::WebBrowserComponent::Options makeOptions();
    std::optional<juce::WebBrowserComponent::Resource> resource(const juce::String& url);
    void changeListenerCallback(juce::ChangeBroadcaster*) override;
    void timerCallback() override;

    VisuProcessor& proc_;
    std::unique_ptr<juce::FileChooser> chooser_;
    juce::WebBrowserComponent browser_;
    int lastVoices_ = -1; float lastVol_ = -1; double lastBpm_ = 0; int lastSig_ = 0;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(VisuEditor)
};
