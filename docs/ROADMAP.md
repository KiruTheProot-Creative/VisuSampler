# Roadmap

1. **Core library** (`packages/core`): done. Next for core: slice and tempo-sync helpers, a streaming reader for large libraries, a real-time voice engine.
2. **VisuMaker app** (`apps/maker`): ported onto core, all five tabs working. Next: save and reopen projects, then polish.
3. **VisuPlayer** (`apps/plugin`): the VST. Library browser and play view in a web view, lists, C++ engine. Next: one shared engine (the C++ engine compiled to WebAssembly for the Maker), FX in C++, the Designer UI in play mode.
4. Export extras: size budget, "Listen to export", optional licence lock, lite build, export report.
5. Decided: the banner logo stays still in v1 (only the background has hover parallax). Animated logos can come later.
