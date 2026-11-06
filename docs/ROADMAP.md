# Roadmap

> Hard rule: every library ever exported keeps loading and sounding the same in every later player. See [COMPATIBILITY.md](COMPATIBILITY.md).

## Done
- **Core library** (`packages/core`), **VisuMaker** (Sound, Interface, Effects, Export tabs, projects), **VisuPlayer** (VST3 + standalone, library browser, the library's own interface).
- **One shared engine** (`apps/plugin/engine`, plain C++): native in the VST, WebAssembly in the Maker. Sampler, slicer, keep-speed, granular, wavetable; mono/legato/glide, bend range, voice limit, CPU guard; per-group ADSR and knobs on group volume/pan/tune; FX graph with modulators, macros and on/off buttons.
- Designer: pages (tabs), layer groups, multi selection, dropdowns, images, text panels, list selectors, rules.

## Next, one by one (the Kontakt essentials)
1–6 are built and tested (engine tests listen to the sound; Windows CI builds the VST3). None of them has been tried in a real DAW yet, that is item 7.
1. ✅ **Undo / redo** in the Maker (Designer, Sound tab, Effects).
2. ✅ **Streaming samples from disk**: keep only the start of each sample in memory, read the rest while playing; 16-bit in memory where the source is 16-bit.
3. ✅ **DAW automation and MIDI learn** for library knobs.
4. ✅ **User presets in the player** (save and load your own knob settings).
5. ✅ **Keyswitches / articulations** (notes that switch lists).
6. ✅ **Per-note filter and modulation** (a filter with its own envelope per note, velocity to brightness, per-note LFO).
7. **(next)** **Real DAW testing and an installer** for the player.
- Also: lists and banks for the base library; button actions for next/previous list and bank.

## Later
- **Animation element and filmstrip importer.** Import a WebM with transparency (or a filmstrip PNG, or a folder of PNG frames); a trim view picks start frame, end frame and frame count; the Maker splits it into frames and stores them as a filmstrip inside the library (the player never decodes video). The element can follow a tag (knob 0 = first frame, 1 = last), play when triggered (once, loop, ping-pong), loop forever, or run reversed; a knob can use it as its look. Show the size the frames add, with a frame-size option.
- **Microtuning** (.scl / .tun) applied in the engine.
- **Batch sample tools**: normalize, trim silence, fades over many samples at once.
- **Layout templates** for the Designer (dual-layer pad, 4-knob synth, minimal keys), starting from the Base Library layout.
- **Dice / randomizer** in the player: nudges chosen knobs by a small random amount.
- **Player-side knob assignments** (the user links a knob to more targets in the VST).
- **Multiple outputs**: groups routed to separate DAW channels (drum kits).
- Export extras: size budget, "Listen to export", optional licence lock, lite build, export report.
- Animated banner logos (the background already has hover parallax).
- **SFZ import** in the Maker, so existing free libraries can come in.
- **Several instruments in one player**, each on its own MIDI channel (like a rack).
- **Library protection** for people who sell libraries.
- **MPE / per-note pressure** for modern controllers.
