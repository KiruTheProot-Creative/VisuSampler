# VisuSampler

A lighter, friendlier Kontakt alternative.

- **VisuMaker** builds libraries: Samples, Mapping, Designer, FX Designer, Export.
- **VisuPlayer** plays them. A library is one `.vsamp` file. No scripting.

## Layout

- `packages/core`: the engine and the `.vsamp` format (done, tested, `npm test`)
- `apps/player`: VisuPlayer, first version (`node apps/player/serve.mjs`)
- `prototype/`: the single-file HTML prototype all design decisions came from
- `docs/`: format spec and roadmap

## Status

`prototype/` holds the single-file HTML prototype (v4) that all design decisions came from.
Build it with `python3 prototype/build.py` (output: `prototype/visumaker-prototype-4.html`, open it in a browser).

See `docs/vsamp-format.md` for the file format and `docs/ROADMAP.md` for the plan.
