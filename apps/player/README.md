# VisuPlayer

Opens a `.vsamp`, shows it in the library explorer (banner, tile, hover parallax, info), and plays it with `@visusampler/core`.

```
node apps/player/serve.mjs      # then open http://localhost:5173/apps/player/
```

- Open a file, drop it on the page, or press **Load demo library**.
- Play with the on-screen keys, the computer keyboard (A W S E D F T G Y H U J K O L P ;, Z and X change octave) or a MIDI keyboard.
- Groups: normal, round robin (cycle, random, unique), release; choke, mute, solo. Velocity and key fades, loops with crossfades, sample unison and all sample modes come from the core.

Not done yet: lists/banks switching, the library's custom UI (Designer layout), FX graph, tempo sync from a host, and a real-time voice limit.
