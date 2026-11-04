# @visusampler/core

Everything that makes sound or reads/writes a library, with no UI and no dependencies. Runs in browsers and Node 18+.

- `dsp.js`: resampler (nearest, linear, cubic, sinc), WSOLA time-stretch, granular, wavetable, transient detection
- `modes.js`: sample modes and sample unison
- `zone.js`: `zoneData(ctx, zone, note, ...)`, renders one zone to plain data
- `vsamp.js`: `.vsamp` writer, reader and verifier (see `docs/vsamp-format.md`)
- `bake.js`: bake plan, size estimate and export set (optional, off by default)

The engine reads the project through a small context object (see `zone.js`), so it never touches globals.

```
npm test
```
