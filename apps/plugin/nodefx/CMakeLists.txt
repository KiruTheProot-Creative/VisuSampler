# NodeFX: VisuSampler's node effects as an effect plugin (JUCE is fetched by the top-level CMakeLists.txt)
set(NFX_FORMATS VST3 Standalone)
if(APPLE)
  list(APPEND NFX_FORMATS AU)
endif()

juce_add_plugin(NodeFX
  COMPANY_NAME "VisuSampler"
  PLUGIN_MANUFACTURER_CODE Vsmp
  PLUGIN_CODE Nfx1
  IS_SYNTH FALSE
  NEEDS_MIDI_INPUT FALSE
  NEEDS_MIDI_OUTPUT FALSE
  EDITOR_WANTS_KEYBOARD_FOCUS TRUE
  NEEDS_WEB_BROWSER TRUE
  NEEDS_WEBVIEW2 TRUE
  COPY_PLUGIN_AFTER_BUILD FALSE
  VST3_CATEGORIES Fx
  FORMATS ${NFX_FORMATS}
  PRODUCT_NAME "NodeFX")

# the editor: its own small page (apps/maker build.py: only the Effects editor's parts), the one core module it
# imports, the fonts
juce_add_binary_data(NodeFXUI SOURCES ../../maker/nodefx.html ../../maker/nodefx.js ../../../packages/core/src/util.js
  ../../../assets/fonts/Figtree.ttf ../../../assets/fonts/Unbounded.ttf ../../../assets/fonts/JetBrainsMono.ttf ../../../assets/fonts/Pacifico.ttf ../../../assets/fonts/VT323.ttf)
juce_add_binary_data(NodeFXPresets HEADER_NAME NodeFXData.h NAMESPACE nodefx SOURCES presets/factoryPresets.json)
target_sources(NodeFX PRIVATE NodeFXProcessor.cpp NodeFXEditor.cpp)
target_compile_definitions(NodeFX PUBLIC
  VISU_VERSION="${PROJECT_VERSION}" VISU_BUILD_ID="${VISU_BUILD_ID}"
  JUCE_WEB_BROWSER=1 JUCE_USE_WIN_WEBVIEW2_WITH_STATIC_LINKING=1 JUCE_USE_CURL=0 JUCE_VST3_CAN_REPLACE_VST2=0 JUCE_DISPLAY_SPLASH_SCREEN=0 JUCE_REPORT_APP_USAGE=0)
target_link_libraries(NodeFX
  PRIVATE visu_engine NodeFXUI NodeFXPresets juce::juce_audio_utils juce::juce_gui_extra
  PUBLIC juce::juce_recommended_config_flags juce::juce_recommended_lto_flags juce::juce_recommended_warning_flags)
