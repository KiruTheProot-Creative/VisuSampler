include(FetchContent)
FetchContent_Declare(JUCE GIT_REPOSITORY https://github.com/juce-framework/JUCE.git GIT_TAG 8.0.8 GIT_SHALLOW TRUE)
FetchContent_MakeAvailable(JUCE)

set(VISU_FORMATS VST3 Standalone)
if(APPLE)
  list(APPEND VISU_FORMATS AU)
endif()

juce_add_plugin(VisuPlayer
  COMPANY_NAME "VisuSampler"
  PLUGIN_MANUFACTURER_CODE Vsmp
  PLUGIN_CODE Vply
  IS_SYNTH TRUE
  NEEDS_MIDI_INPUT TRUE
  NEEDS_MIDI_OUTPUT FALSE
  EDITOR_WANTS_KEYBOARD_FOCUS TRUE
  NEEDS_WEB_BROWSER TRUE
  NEEDS_WEBVIEW2 TRUE
  COPY_PLUGIN_AFTER_BUILD FALSE
  FORMATS ${VISU_FORMATS}
  PRODUCT_NAME "VisuPlayer")

juce_add_binary_data(VisuPlayerUI SOURCES ../ui/index.html ../ui/ui.css ../ui/ui.js ../ui/bridge.js)
target_sources(VisuPlayer PRIVATE PluginProcessor.cpp PluginEditor.cpp)
target_compile_definitions(VisuPlayer PUBLIC
  JUCE_WEB_BROWSER=1 JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0 JUCE_DISPLAY_SPLASH_SCREEN=0 JUCE_REPORT_APP_USAGE=0)
target_link_libraries(VisuPlayer
  PRIVATE visu_engine VisuPlayerUI juce::juce_audio_utils juce::juce_gui_extra
  PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_lto_flags juce::juce_recommended_warning_flags)
