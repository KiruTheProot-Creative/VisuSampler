# VisuSampler

A lighter, friendlier Kontakt alternative.

- **VisuMaker** builds libraries: Samples, Mapping, Designer, FX Designer, Export.
- **VisuPlayer** plays them. A library is one `.vsamp` file. No scripting.

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
