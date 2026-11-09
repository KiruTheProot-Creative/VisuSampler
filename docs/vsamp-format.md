# Instrument (.vsins) and library (.vslib) format, version 1

File names: **`.vsins`** is one instrument (this format; called `.vsamp` before, and `.vsamp` files keep loading
forever, they are the same thing). **`.vslib`** is a library of instruments, see "Libraries (.vslib)" at the end.
Both use the same container below; the manifest's `format` says which it is (`vsamp` for an instrument, `vslib`).

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

## project.play
How the library plays: `{mono, legato, glide (ms), bend (semitones, default 2), maxVoices (0 = 256), steal ("oldest" | "quietest")}`.
Glide works in mono. Released notes are stolen first. The player also lowers the voice limit for a moment when the CPU cannot keep up.

## Streamed audio (chunks)
Exported samples store their audio as `chunks` (each chunk a blob of `chunkFrames` frames, 32768 by default, packed or raw on its own)
instead of one `data` blob. VisuPlayer keeps only the start of a long sample in memory (16384 frames plus the furthest zone start)
and reads the rest from disk while it plays. Samples that loop, play reversed, or use the speed-keeping, granular or wavetable modes
are loaded fully. Older files with one raw `data` blob also stream; one packed `data` blob is loaded fully.

## Libraries (.vslib)

A library holds several instruments, sorted into banks (like a Kontakt library and its instruments). It uses the same
container as an instrument; its manifest:

- `format`: `"vslib"`, `formatVersion`: 1
- `lib`: the library's id, name, author, version, desc, ... (the same fields as an instrument's `lib`)
- `banner.images`: the library's `wide`, `tile` and `icon` PNGs (blob references)
- `banks[]`: `{name, instruments[]}`, in the order to show them; each instrument is
  `{id, name, desc, data}`, where `data` is a blob reference to a **complete instrument file** (`.vsins`), stored
  (`enc: raw`) so a player can open it in place: the instrument's own offsets count from where its blob starts.

Instrument ids are unique within the library and stay the same between versions (a song remembers
`<library id>/<instrument id>`). Each instrument has its own samples, interface, effects and knobs; nothing is shared
between them. A reader opens only the instrument that is played, and streams its long samples straight from the
library file. Players also accept a library with a single instrument.
