#include "PluginEditor.h"

namespace
{
const juce::Colour kBg(0xff1c1c1e), kPanel(0xff2a2a2d), kLine(0xff111111), kText(0xffd8d8da), kMuted(0xff8d8d93), kSel(0xff3d6fa8);
}

// scrolling grid of library tiles
class VisuEditor::Grid : public juce::Component
{
public:
    std::function<void(int)> onPick;
    explicit Grid(VisuProcessor& p) : proc(p) {}

    void setQuery(const juce::String& q) { query = q.trim().toLowerCase(); rebuild(); }
    void rebuild()
    {
        shown.clear();
        auto& cat = proc.catalog();
        for (int i = 0; i < (int) cat.size(); ++i)
        {
            auto hay = juce::String(cat[(size_t) i].info.name + " " + cat[(size_t) i].info.author + " " + cat[(size_t) i].info.category + " " + cat[(size_t) i].info.tags).toLowerCase();
            bool ok = true; for (auto& w : juce::StringArray::fromTokens(query, " ", "")) if (!hay.contains(w)) ok = false;
            if (ok) shown.push_back(i);
        }
        layoutFor(getParentWidth() > 0 ? getParentWidth() : getWidth());
        repaint();
    }
    int shownCount() const { return (int) shown.size(); }

    void layoutFor(int w)
    {
        const int gap = 14, minW = 170; cols = juce::jmax(1, (w - gap) / (minW + gap));
        tileW = (w - gap * (cols + 1)) / cols; tileH = tileW * 2 / 3 + 30;
        const int rows = ((int) shown.size() + cols - 1) / cols;   // no "add" tile in the native grid, the button does that
        setSize(w, juce::jmax(60, gap + rows * (tileH + gap)));
    }
    juce::Rectangle<int> rectFor(int slot) const { const int gap = 14; return { gap + (slot % cols) * (tileW + gap), gap + (slot / cols) * (tileH + gap), tileW, tileH }; }

    void paint(juce::Graphics& g) override
    {
        auto& cat = proc.catalog();
        if (shown.empty()) { g.setColour(kMuted); g.setFont(15.f); g.drawFittedText(cat.empty() ? "No libraries yet.\nDrop a .vsamp file here, or press Add library.\nFolder: " + VisuProcessor::libraryFolder().getFullPathName() : "Nothing matches.", getLocalBounds().reduced(30), juce::Justification::centred, 4); return; }
        for (int s = 0; s < (int) shown.size(); ++s)
        {
            auto r = rectFor(s); if (!g.getClipBounds().intersects(r)) continue;
            const auto& e = cat[(size_t) shown[(size_t) s]];
            auto art = r.withHeight(tileH - 30), nameR = r.withTrimmedTop(tileH - 30);
            g.setColour(kPanel); g.fillRect(r);
            juce::Graphics::ScopedSaveState ss(g); g.reduceClipRegion(art);
            if (e.tile.isValid())
            {
                const float zoom = 1.08f, px = s == hover ? hx : 0.f, py = s == hover ? hy : 0.f;
                const float sw = (float) art.getWidth(), sh = (float) art.getHeight(), dw = sw * zoom, dh = sw * zoom * ((float) e.tile.getHeight() / (float) e.tile.getWidth());
                const float scale = juce::jmax(dw / (float) e.tile.getWidth(), (sh * zoom) / (float) e.tile.getHeight());
                const float iw = (float) e.tile.getWidth() * scale, ih = (float) e.tile.getHeight() * scale; juce::ignoreUnused(dh);
                g.drawImage(e.tile, (int) ((float) art.getX() + (sw - iw) / 2 - px * sw * .024f), (int) ((float) art.getY() + (sh - ih) / 2 - py * sh * .024f), (int) iw, (int) ih, 0, 0, e.tile.getWidth(), e.tile.getHeight());
            }
            else { g.setGradientFill(juce::ColourGradient(juce::Colour::fromString("ff" + juce::String(e.info.accent).replace("#", "")), (float) art.getX(), (float) art.getY(), juce::Colour(0xff10161f), (float) art.getRight(), (float) art.getBottom(), false)); g.fillRect(art); g.setColour(juce::Colours::white); g.setFont(juce::FontOptions(18.f, juce::Font::bold)); g.drawFittedText(e.info.name, art.reduced(8), juce::Justification::centred, 2); }
            g.restoreState();
            g.setColour(juce::Colour(0xff222225)); g.fillRect(nameR);
            g.setColour(kText); g.setFont(13.f); g.drawText(e.info.name, nameR.reduced(9, 0), juce::Justification::centredLeft, true);
            g.setColour(s == hover ? juce::Colour(0xff5d86b5) : kLine); g.drawRect(r, s == hover ? 2 : 1);
        }
    }
    void mouseMove(const juce::MouseEvent& e) override
    {
        int h = slotAt(e.getPosition()); hover = h;
        if (h >= 0) { auto r = rectFor(h); hx = ((float) (e.x - r.getX()) / (float) r.getWidth() - .5f) * 2; hy = ((float) (e.y - r.getY()) / (float) (tileH - 30) - .5f) * 2; }
        repaint(); setMouseCursor(h >= 0 ? juce::MouseCursor::PointingHandCursor : juce::MouseCursor::NormalCursor);
    }
    void mouseExit(const juce::MouseEvent&) override { hover = -1; repaint(); }
    void mouseUp(const juce::MouseEvent& e) override { int s = slotAt(e.getPosition()); if (s >= 0 && onPick) onPick(shown[(size_t) s]); }

private:
    int slotAt(juce::Point<int> p) const { for (int s = 0; s < (int) shown.size(); ++s) if (rectFor(s).contains(p)) return s; return -1; }
    VisuProcessor& proc; std::vector<int> shown; juce::String query; int cols = 1, tileW = 170, tileH = 140, hover = -1; float hx = 0, hy = 0;
};

VisuEditor::VisuEditor(VisuProcessor& p)
    : AudioProcessorEditor(&p), proc_(p), keyboard_(p.keyboardState, juce::MidiKeyboardComponent::horizontalKeyboard)
{
    setOpaque(true); setResizable(true, true); setResizeLimits(620, 420, 2000, 1400); setSize(960, 600);
    search_.setTextToShowWhenEmpty("Search libraries", kMuted); search_.setFont(juce::FontOptions(15.f));
    search_.onTextChange = [this] { grid_->setQuery(search_.getText()); count_.setText("Show " + juce::String(grid_->shownCount()) + " libraries", juce::dontSendNotification); };
    addAndMakeVisible(search_); addAndMakeVisible(back_); addAndMakeVisible(add_);
    back_.onClick = [this] { proc_.unloadLibrary(); showPlay(false); };
    add_.onClick = [this] {
        chooser_ = std::make_unique<juce::FileChooser>("Choose a library", juce::File(), "*.vsamp");
        chooser_->launchAsync(juce::FileBrowserComponent::openMode | juce::FileBrowserComponent::canSelectFiles | juce::FileBrowserComponent::canSelectMultipleItems,
                              [this](const juce::FileChooser& fc) { for (auto& f : fc.getResults()) proc_.addLibraryFile(f); });
    };
    grid_ = std::make_unique<Grid>(proc_);
    grid_->onPick = [this](int i) { proc_.loadLibrary(proc_.catalog()[(size_t) i].file); showPlay(true); };
    viewport_.setViewedComponent(grid_.get(), false); viewport_.setScrollBarsShown(true, false); addAndMakeVisible(viewport_);
    volume_.setSliderStyle(juce::Slider::LinearHorizontal); volume_.setTextBoxStyle(juce::Slider::NoTextBox, false, 0, 0);
    addAndMakeVisible(volume_);
    if (auto* prm = proc_.getParameters()[0]) volAttach_ = std::make_unique<juce::SliderParameterAttachment>(*static_cast<juce::RangedAudioParameter*>(prm), volume_);
    count_.setColour(juce::Label::textColourId, kMuted); count_.setJustificationType(juce::Justification::centredRight); addAndMakeVisible(count_);
    voices_.setColour(juce::Label::textColourId, kMuted); addChildComponent(voices_);
    addChildComponent(keyboard_); keyboard_.setKeyWidth(22.f); keyboard_.setAvailableRange(36, 96);
    proc_.addChangeListener(this); refreshGrid(); showPlay(proc_.currentEntry() != nullptr); startTimerHz(6);
}

VisuEditor::~VisuEditor() { proc_.removeChangeListener(this); }

void VisuEditor::refreshGrid()
{
    grid_->rebuild(); count_.setText("Show " + juce::String(grid_->shownCount()) + " libraries", juce::dontSendNotification);
}
void VisuEditor::changeListenerCallback(juce::ChangeBroadcaster*)
{
    refreshGrid(); if (playing_ && !proc_.currentEntry() && !proc_.isLoading() && proc_.currentFile() == juce::File()) {}
    repaint();
}
void VisuEditor::timerCallback() { if (playing_) { voices_.setText(juce::String(proc_.activeVoices()) + " voices", juce::dontSendNotification); } }

void VisuEditor::showPlay(bool play)
{
    playing_ = play;
    search_.setVisible(!play); viewport_.setVisible(!play); count_.setVisible(!play); add_.setVisible(!play);
    back_.setVisible(play); keyboard_.setVisible(play); voices_.setVisible(play);
    if (play) keyboard_.grabKeyboardFocus();
    resized(); repaint();
}

void VisuEditor::resized()
{
    auto r = getLocalBounds(); auto top = r.removeFromTop(40);
    top.reduce(10, 6); add_.setBounds(top.removeFromRight(110)); back_.setBounds(top.removeFromLeft(110));
    auto foot = r.removeFromBottom(34).reduced(14, 4);
    volume_.setBounds(foot.removeFromLeft(160)); count_.setBounds(foot); voices_.setBounds(foot.removeFromLeft(100));
    if (playing_)
    {
        keyboard_.setBounds(r.removeFromBottom(110).reduced(10, 4));
        bannerArea_ = r.reduced(14);
    }
    else
    {
        auto s = r.reduced(14, 8); search_.setBounds(s.removeFromTop(34));
        viewport_.setBounds(s.withTrimmedTop(8));
        grid_->layoutFor(viewport_.getMaximumVisibleWidth()); grid_->rebuild();
    }
}

void VisuEditor::paint(juce::Graphics& g)
{
    g.fillAll(kBg);
    g.setColour(juce::Colour(0xff303033)); g.fillRect(0, 0, getWidth(), 40); g.setColour(kLine); g.drawHorizontalLine(40, 0, (float) getWidth());
    g.setFont(juce::FontOptions(16.f, juce::Font::bold)); g.setColour(juce::Colours::white);
    const int lx = playing_ ? 130 : 12; g.drawText("Visu", lx, 0, 40, 40, juce::Justification::centredLeft); g.setColour(juce::Colour(0xff7fb0e6)); g.drawText("Player", lx + 38, 0, 70, 40, juce::Justification::centredLeft);
    if (!playing_) return;
    const auto* e = proc_.currentEntry();
    auto b = bannerArea_; auto img = b.removeFromTop(juce::jmin(b.getHeight() / 2, (int) (b.getWidth() / 3)));
    g.setColour(kPanel); g.fillRect(img);
    if (e && e->wide.isValid()) g.drawImage(e->wide, img.toFloat(), juce::RectanglePlacement::fillDestination | juce::RectanglePlacement::centred);
    else if (e) { g.setColour(juce::Colours::white); g.setFont(juce::FontOptions(30.f, juce::Font::bold)); g.drawText(e->info.name, img, juce::Justification::centred); }
    b.removeFromTop(10);
    g.setColour(juce::Colours::white); g.setFont(juce::FontOptions(22.f, juce::Font::bold));
    g.drawText(e ? juce::String(e->info.name) : juce::String("Loading…"), b.removeFromTop(30), juce::Justification::centredLeft);
    g.setColour(kMuted); g.setFont(13.f);
    if (e) g.drawText(juce::String(e->info.author.empty() ? "Unknown author" : e->info.author) + " · version " + e->info.version + " · " + e->info.category, b.removeFromTop(20), juce::Justification::centredLeft);
    g.setColour(kText); g.drawText(proc_.status(), b.removeFromTop(24), juce::Justification::centredLeft);
    if (e && !e->info.desc.empty()) { g.setColour(kText); g.drawFittedText(e->info.desc, b.removeFromTop(60), juce::Justification::topLeft, 3); }
}

bool VisuEditor::isInterestedInFileDrag(const juce::StringArray& files) { for (auto& f : files) if (f.endsWithIgnoreCase(".vsamp")) return true; return false; }
void VisuEditor::filesDropped(const juce::StringArray& files, int, int) { for (auto& f : files) if (f.endsWithIgnoreCase(".vsamp")) proc_.addLibraryFile(juce::File(f)); }
