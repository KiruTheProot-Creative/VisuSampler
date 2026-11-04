#pragma once
#include "PluginProcessor.h"

// Library browser first (search, tiles with hover parallax), then play mode, like the web player.
class VisuEditor : public juce::AudioProcessorEditor, private juce::ChangeListener, public juce::FileDragAndDropTarget, private juce::Timer
{
public:
    explicit VisuEditor(VisuProcessor&);
    ~VisuEditor() override;
    void paint(juce::Graphics&) override;
    void resized() override;
    bool isInterestedInFileDrag(const juce::StringArray& files) override;
    void filesDropped(const juce::StringArray& files, int, int) override;

private:
    class Grid;
    void changeListenerCallback(juce::ChangeBroadcaster*) override;
    void timerCallback() override;
    void showPlay(bool play);
    void refreshGrid();

    VisuProcessor& proc_;
    juce::TextEditor search_;
    juce::TextButton back_{ "< Libraries" }, add_{ "Add library" };
    juce::Slider volume_;
    juce::Label count_, voices_;
    std::unique_ptr<Grid> grid_;
    juce::Viewport viewport_;
    juce::MidiKeyboardComponent keyboard_;
    juce::Rectangle<int> bannerArea_;
    std::unique_ptr<juce::FileChooser> chooser_;
    bool playing_ = false;
    std::unique_ptr<juce::SliderParameterAttachment> volAttach_;

    JUCE_DECLARE_NON_COPYABLE_WITH_LEAK_DETECTOR(VisuEditor)
};
