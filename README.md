# VisuSampler

> **Disclaimer: this project is AI-coded.** Nearly all of the code, tests and documentation in this repository were
> written by an AI (Claude, by Anthropic), directed, tested and reviewed by a human. It is checked by automated tests
> on Linux and Windows and tried in real DAWs, but it has not been reviewed line by line by an experienced audio
> developer. Treat it as early, experimental software: keep backups of your projects, and please report bugs.

A lighter, friendlier Kontakt alternative, for Windows.

Nothing here plays on the web: VisuMaker is a Windows desktop app (`.exe`) and VisuPlayer is a VST3. The Maker exports a library straight into the VST's library folder (`Documents\VisuSampler\Libraries`).

- **VisuMaker** builds libraries: Samples, Mapping, Designer, FX Designer, Export.
- **VisuPlayer** plays them. An instrument is one `.vsins` file, a library of several is one `.vslib` (older `.vsamp` files still load). No scripting.
- **NodeFX** is the Maker's node effects editor as its own effect plugin (VST3 and standalone): cable modules together,
  turn 8 macro knobs (automatable in your DAW), and save your sounds as `.nfx` presets
  (`Documents\VisuSampler\NodeFX Presets`, one folder per bank). It comes with factory presets: basics, guitar amps and weird FX.
- **HyperSynth** is a two-layer polyphonic synthesizer (VST3 and standalone) in the spirit of the Yamaha CS-80, with
  Vital/Serum-style oscillators: Analog, Wavetable and FM modes, Hyper unison up to 16 voices, high-pass into low-pass
  filters, a Crossfade between the layers, a ribbon and wheels. Presets are `.hsyn` files in
  `Documents\VisuSampler\HyperSynth Presets`. Spectrum and Sample oscillators, LFOs, macros and effects are on the way.

## Download

Grab **KiruCAS-Setup.exe** from the [releases](https://github.com/KiruTheProot-Creative/VisuSampler/releases): the
**Kiru Creative Audio Suite (Kiru CAS)** setup installs VisuMaker, VisuPlayer, NodeFX and HyperSynth (pick the parts you want).
Kiru CAS is the audio side of Kiru's Creative Suite: plugins and audio tools, all in one setup.

## Guides

- **[Tags: the guide for library makers](docs/tags.md)**: knobs, buttons, texts, effects and DAW automation, all through tags.

## Community

Questions, bug reports, libraries and news: **[Kiru's Creative Suite (KCS) on Discord](https://discord.gg/JFnu6HTwgs)**.

## License

VisuSampler is free software under the **GNU GPL v3** (or later), see [LICENSE](LICENSE), [NOTICE.md](NOTICE.md) and the
short, plain [terms of use](TERMS.md).
**Libraries you make with VisuMaker are yours**: share or sell them under any terms you like.

## Layout

- `packages/core`: the engine and the `.vsamp` format (done, tested, `npm test`)
- `apps/plugin`: **VisuPlayer**, the VST3/AU plugin (C++ engine, JUCE). Its window (`apps/plugin/ui`) is the library browser and play view, shown in a web view
- `apps/plugin/hypersynth`: **HyperSynth**, the synthesizer; its sound engine is `apps/plugin/engine/Synth.cpp`, its panel `ui/hypersynth.html`
- `apps/plugin/nodefx`: **NodeFX**, the effect plugin; its window is the Maker's FX page (`apps/maker/nodefx.html`), its factory presets come from `presets/make-presets.mjs`
- `examples/`: a demo library used by the tests
- `tools/serve.mjs`: local web server for the Maker (`node tools/serve.mjs`)
- `apps/maker`: VisuMaker (`python3 apps/maker/build.py`)
- `prototype/`: the single-file HTML prototype all design decisions came from
- `docs/`: format spec and roadmap

## Status

`prototype/` holds the single-file HTML prototype (v4) that all design decisions came from.
Build it with `python3 prototype/build.py` (output: `prototype/visumaker-prototype-4.html`, open it in a browser).

See `docs/vsamp-format.md` for the file format and `docs/ROADMAP.md` for the plan.
