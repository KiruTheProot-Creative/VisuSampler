# VisuSampler

> **Disclaimer: this project is AI-coded.** Nearly all of the code, tests and documentation in this repository were
> written by an AI (Claude, by Anthropic), directed, tested and reviewed by a human. It is checked by automated tests
> on Linux and Windows and tried in real DAWs, but it has not been reviewed line by line by an experienced audio
> developer. Treat it as early, experimental software: keep backups of your projects, and please report bugs.

A lighter, friendlier Kontakt alternative, for Windows.

Nothing here plays on the web: VisuMaker is a Windows desktop app (`.exe`) and VisuPlayer is a VST3. The Maker exports a library straight into the VST's library folder (`Documents\\VisuSampler\\Libraries`).

- **VisuMaker** builds libraries: Samples, Mapping, Designer, FX Designer, Export.
- **VisuPlayer** plays them. A library is one `.vsamp` file. No scripting.

## Guides

- **[Tags: the guide for library makers](docs/tags.md)**: knobs, buttons, texts, effects and DAW automation, all through tags.

## Community

Questions, bug reports, libraries and news: **[Kiru's Creative Suite (KCS) on Discord](https://discord.gg/JFnu6HTwgs)**.

## License

VisuSampler is free software under the **GNU GPL v3** (or later), see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md).
**Libraries you make with VisuMaker are yours**: share or sell them under any terms you like.

## Layout

- `packages/core`: the engine and the `.vsamp` format (done, tested, `npm test`)
- `apps/plugin`: **VisuPlayer**, the VST3/AU plugin (C++ engine, JUCE). Its window (`apps/plugin/ui`) is the library browser and play view, shown in a web view
- `examples/`: a demo library used by the tests
- `tools/serve.mjs`: local web server for the Maker (`node tools/serve.mjs`)
- `apps/maker`: VisuMaker (`python3 apps/maker/build.py`)
- `prototype/`: the single-file HTML prototype all design decisions came from
- `docs/`: format spec and roadmap

## Status

`prototype/` holds the single-file HTML prototype (v4) that all design decisions came from.
Build it with `python3 prototype/build.py` (output: `prototype/visumaker-prototype-4.html`, open it in a browser).

See `docs/vsamp-format.md` for the file format and `docs/ROADMAP.md` for the plan.
