# @visusampler/engine-wasm

The C++ engine from `apps/plugin/engine`, compiled to WebAssembly, so VisuMaker plays a library exactly like the VST.

- `engine.wasm` is built by GitHub Actions (workflow **wasm**, artifact `engine-wasm`) and committed here.
- `src/engine.js` loads it (Node, browser or AudioWorklet). `src/worklet.js` is a ready AudioWorklet (`visu-engine`).
- `npm test` checks it against the same golden vectors as the native engine.
