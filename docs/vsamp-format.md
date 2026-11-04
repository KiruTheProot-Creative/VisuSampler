# .vsamp format, version 1

All integers are little endian.

| Bytes | Content |
|---|---|
| 8 | magic `56 53 41 4D 50 00 01 00` (`VSAMP`, 0, format version 1, 0) |
| 4 | manifest length `M` |
| 4 | CRC32 of the manifest bytes |
| M | manifest, UTF-8 JSON |
| rest | blob region (audio, images, fonts) |

Blob references in the manifest look like `{off, len, raw, crc, enc}`:
`off` is relative to the start of the blob region, `len` is the stored size, `raw` the size after unpacking,
`crc` is the CRC32 of the stored bytes, `enc` is `raw` or `deflate` (raw DEFLATE, no zlib header).

## Manifest

- `format`, `formatVersion`, `created`, `app`
- `lib`: id (UUID, stable between versions), name, author, version, desc, tags, category, web, licence, changelog, accent
- `banner`: `settings` (layout), `images` (composed PNGs: wide 1200x400, tile 512x512, icon 128x128), `layers` (the original background and logo images)
- `project`: canvas, light, bpm, sig, els (UI elements), tags, groups, lists, banks, fx graphs, gset (group settings)
- `assets`, `fonts`: images and embedded fonts used by the UI (fonts with a restricted licence are never packed)
- `samples[]`: id, name, sr, chn, frames, root, fine, loop, bits (16, 24 or 32 float), `sm` (sample mode settings), `data` blob, `baked`
- `zones[]`: lo, hi, vlo, vhi, root, tune, vol, pan, start, end, group, loop, interp, fades, round robin and other mapper settings
- `bake`: what the export baked (`enabled`, `mode`, `step`, `quality`, counts)
- `export`: `bits`, `compress`

Audio blobs are interleaved PCM.

## Reader rules

1. Check the magic, then the manifest CRC, before parsing.
2. Check each blob CRC before use.
3. Ignore unknown manifest keys (forward compatible).
4. Baking only changes the exported file. Zones with `baked` samples play with `keytrack` and `tune` 0 at the baked note.
