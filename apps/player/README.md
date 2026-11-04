# VisuPlayer

Starts in a library browser (search, Category and Tags filters, a tile per library with hover parallax). Click a library to switch to play mode; Escape or the back button returns. Added libraries are remembered in the browser (IndexedDB).

```
node apps/player/serve.mjs      # then open http://localhost:5173/apps/player/
```

- Add libraries with the Add library tile, the button, or by dropping files on the page. The demo library is one click if the list is empty.
- Play with the on-screen keys, the computer keyboard (A W S E D F T G Y H U J K O L P ;, Z and X change octave) or a MIDI keyboard.
- Groups: normal, round robin (cycle, random, unique), release; choke, mute, solo. Velocity and key fades, loops with crossfades, sample unison and all sample modes come from the core.

Not done yet: lists/banks switching, the library's custom UI (Designer layout), FX graph, tempo sync from a host, and a real-time voice limit.
