# HyperSynth: the two-layer synthesizer (JUCE is fetched by the top-level CMakeLists.txt; the sound engine is
# engine/Synth.cpp in visu_engine)
set(HS_FORMATS VST3 Standalone)
if(APPLE)
  list(APPEND HS_FORMATS AU)
endif()

juce_add_plugin(HyperSynth
  COMPANY_NAME "VisuSampler"
  PLUGIN_MANUFACTURER_CODE Vsmp
  PLUGIN_CODE Hys1
  IS_SYNTH TRUE
  NEEDS_MIDI_INPUT TRUE
  NEEDS_MIDI_OUTPUT FALSE
  EDITOR_WANTS_KEYBOARD_FOCUS TRUE
  NEEDS_WEB_BROWSER TRUE
  NEEDS_WEBVIEW2 TRUE
  COPY_PLUGIN_AFTER_BUILD FALSE
  VST3_CATEGORIES Instrument Synth
  FORMATS ${HS_FORMATS}
  PRODUCT_NAME "HyperSynth")

# the panel: one page, its fonts
juce_add_binary_data(HyperSynthUI SOURCES ui/hypersynth.html ../../../assets/fonts/Unbounded.ttf ../../../assets/fonts/JetBrainsMono.ttf)
juce_add_binary_data(HyperSynthPresets HEADER_NAME HyperSynthData.h NAMESPACE hypersynth SOURCES presets/factoryPresets.json)
target_sources(HyperSynth PRIVATE HyperSynthProcessor.cpp HyperSynthEditor.cpp)
target_compile_definitions(HyperSynth PUBLIC
  VISU_VERSION="${PROJECT_VERSION}" VISU_BUILD_ID="${VISU_BUILD_ID}"
  JUCE_WEB_BROWSER=1 JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0 JUCE_DISPLAY_SPLASH_SCREEN=0 JUCE_REPORT_APP_USAGE=0)
target_link_libraries(HyperSynth
  PRIVATE visu_engine HyperSynthUI HyperSynthPresets juce::juce_audio_utils juce::juce_gui_extra
  PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_lto_flags juce::juce_recommended_warning_flags)
