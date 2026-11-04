# VisuPlayer (plugin)

The VST3 / AU / standalone player.

- `engine/`: the C++ playback engine (no JUCE). Reads `.vsamp`, plays zones in real time. Tested against the JS core with golden files (`tests/`).
- `plugin/`: the JUCE plugin. The window is a web view showing `ui/` (library browser, then play view). The page calls native functions (`getLibraries`, `loadLibrary`, `noteOn`…) and receives `libraries`, `status`, `meter` and `volume` events.
- `ui/`: that window. `node apps/plugin/ui/test/ui.test.mjs` tests it in a browser against a stand-in plugin.

Libraries are read from `Documents/VisuSampler/Libraries` (Add library copies files there).

```
cmake -S apps/plugin -B build -DCMAKE_BUILD_TYPE=Release            # engine + tests
ctest --test-dir build
cmake -S apps/plugin -B build -DVISU_BUILD_PLUGIN=ON                 # the plugin (fetches JUCE)
cmake --build build --target VisuPlayer_VST3
```

Building the plugin needs: on Linux `libwebkit2gtk-4.1-dev libgtk-3-dev` (plus the usual JUCE packages); on Windows the
Microsoft.Web.WebView2 NuGet package (pass its folder as `-DJUCE_WEBVIEW2_PACKAGE_LOCATION=...`). See `.github/workflows/plugin.yml`.
