<!-- The tag guide (docs/tags.md) cut into Discord posts: each part between the ===== lines is one message
     (under 2000 characters). Post them in order. -->
===== POST 1 =====
# 🏷️ Tags: the guide for library makers

Tags are how everything in a VisuSampler instrument talks to each other. A **tag is one value with a name**: a knob turns it, a text shows it, a button changes it, an effect listens to it, your DAW automates it.

**The idea in one minute.** You want a Cutoff knob that moves a filter and shows `2.40 kHz` under it:
1. Make a tag `cutoff` (Number, 20 to 20000, unit `Hz`, logarithmic)
2. Put a knob on the interface, set its **Tag** to `cutoff`
3. In the Effects tab, link the filter's **Cutoff** to `cutoff`
4. Add a text under the knob: `{cutoff}`

Now knob, filter and text share one value. In VisuPlayer that tag also shows up in your DAW as an automatable parameter called `cutoff`. ✨

Inside, every tag is a value from 0 to 1. What you see (Hz, dB, step names, note values) comes from the tag's settings, which is why one knob can drive anything.

**Making a tag:** Interface tab → right panel → **Tags** → **+ New tag**. Give it a short **name** without spaces or dots (`cutoff`, `verbMix`, `wave`). The test slider lets you try it right there, and **Set default to this** sets its starting value (and what *reset* goes back to).
===== POST 2 =====
## The three kinds of tags

🔢 **Number**: a smooth value from **Min** to **Max**, with a **Unit** (`Hz`, `dB`, `ms`, `%`) and decimals. **Logarithmic** scaling feels natural for frequencies and times (needs a min above 0).
*e.g. cutoff 20–20000 Hz (log), volume -60–6 dB, mix 0–100 %*

📋 **Named steps**: choices, typed comma separated: `Saw, Square, Triangle, Sine`. Knobs snap to them, buttons step through them, texts show the name.
*e.g. waveform, filter type, `Off, On` switches*

⏱️ **Tempo sync**: musical lengths, from `1/64` to `4 bars` (with triplets and dotted values), or fractions of a bar. It knows how long they are at the current tempo: link it to a delay time and the delay follows your DAW.

## Built-in tags
These exist on their own (you can't delete them, but you can use them everywhere):
• `bank`: the selected bank (A, B, C…)
• `list`: the selected list in that bank
• `patch`: the selected patch, when a patch is *one group of a list*
• `bankB` `listB` `patchB`: the same for **layer B** (the second patch playing at the same time)
• `page`: which interface page shows

The **List selector** element is already tied to `bank` and `list`: drop it in and it works. MIDI program change picks lists too.
===== POST 3 =====
## Connecting tags to things

🎛️ **Knob / fader**: select it → **Tag**. Turning it sets the tag, and the tag moves it back (automation, presets).

🔘 **Button**: **Tag** + **Mode**:
• *Momentary*: 1 while held (Number tags)
• *Toggle*: flips between 0 and 1
• *Radio*: sets one step (step 0 is the first)
Buttons can also run **rules** (next post).

📜 **Dropdown**: lists the steps of a step, sync, list or patch tag.

✏️ **Text, button label, text panel**: write `{tokens}` (post 5).

🌀 **Effects**: select a module → **Link parameters to tags**. The tag's 0–1 covers the parameter's whole range (log for frequencies).
• **On / off by** switches a module with a tag (optionally letting reverb and delay tails ring out)
• A **Macro** module turns one tag into a modulation source you can cable to many parameters

🎹 **Sound tab**: group, layer and envelope settings have knob pickers (**Knobs on this group**): pick a Number tag to move them.

📄 **Pages**: buttons with *next* / *previous* / *set* on `page`.
===== POST 4 =====
## Buttons and rules

Buttons, knobs, faders, dropdowns and list selectors have **Events**:

**When**
• buttons: `press` `release` `hold` `doubleclick`
• knobs, faders, dropdowns: `change`
• list selectors: `change` `load`

**If** (optional): a tag `is` / `is not` / `above` / `below` a value

**Then** (one or more actions):
• **set** `wave` to `Square` (a step name, step number like `2`, or a value like `50%`, `440 Hz`, `2 kHz`, `-6`)
• **add** / **subtract** `cutoff` by `10%`
• **toggle** `chorus`
• **next** / **previous** `list` (wraps around)
• **reset** `cutoff` (back to its default)
• **random** `wave`

Under each rule the Maker shows a short version, like:
`{on.press -> if wave = Saw -> cutoff + 10%}`
Rules run top to bottom; try them in **Test mode**. 🧪
===== POST 5 =====
## Showing tags in text: `{tokens}`
Anything in `{braces}` in a text, button label or text panel shows a live value. Unknown names turn **red** on the canvas, so typos are easy to spot.

**Your tags**
• `{cutoff}` → `2.40 kHz` (value + unit)
• `{cutoff.percent}` → `73%`
• `{wave.name}` → `Square` / `1/8T`
• `{delay.ms}` → `250 ms` (tempo sync at the current tempo)
• `{delay.4/4}` → the same in a pinned time signature
• `{cutoff.raw}` → `0.731`

**Lists, banks, patches**
• `{list.name}` · `{list.id}` → `A01` · `{list.number}` → `01`
• `{list.next.name}` `{list.prev.name}` (also `.id`, `.number`)
• `{list.count}` · `{list.groups}` · `{list.loading}` → `READY` / `LOADING 40%`
• `{bank}` `{bank.name}` `{bank.count}`
• `{patch.name}` `{patch.number}` `{patch.count}` `{patch.next.name}`
• `{folder…}` = same as `{list…}`
• `{listB…}` `{bankB…}` `{patchB…}` for layer B (shows `-` while it's off)

**Tempo**
• `{bpm}` · `{timesig}` → `4/4` · `{timesig.bar}` → one bar in ms · `{3/4}` → a bar of 3/4 in ms
===== POST 6 =====
## In VisuPlayer
• **Every tag you made becomes a DAW parameter** named after it (up to 64 per instrument; `bank`, `list` and `page` aren't on that list). So name tags the way you want people to see them in their automation lanes!
• **Right-click a knob** → its automation slot + **MIDI learn**
• Player presets remember every tag's value

## Recipes 🍳
**Patch browser:** text panel `{list.id}  {list.name}` + ◀ button `press → previous list` + ▶ button `press → next list`

**Two patches at once:** turn on Layer B (Sound tab), then the same with `listB`: `{listB.id} {listB.name}`, `previous listB` / `next listB`

**Waveform switch:** steps tag `wave` = `Saw, Square, Triangle, Sine` → 4 **Radio** buttons (steps 0–3, LED on) + text `{wave.name}`

**Tempo-synced delay:** Tempo sync tag `time` → Delay's Time linked to `time` → knob + text `{time.name} · {time.ms}` → shows `1/8 · 250 ms` at 120 BPM

**Reverb on/off with tails:** steps tag `verb` = `Off, On` → reverb **On / off by** `verb` (tails on) → Toggle button

**One knob, many things:** Number tag `drive` → a **Macro** module on it, cabled to distortion drive *and* filter cutoff

**Reset all:** one button, `press` → `reset cutoff`, `reset reso`, `reset drive`…
===== POST 7 =====
## Tips 💡
• **Names are how things find each other.** Short, unique, no dots or spaces (`verbMix`, not `verb mix`).
• **Red text on the canvas** = that tag doesn't exist (typo, or deleted).
• **Set your defaults**: it's where a fresh instrument starts and what *reset* goes to.
• **Steps count from 0** in Radio buttons. In rules, `set … to 2` means the **2nd** step (or just type the step's name).
• **Logarithmic** needs a min above 0.
• **Each instrument in a library has its own tags.** Use *Duplicate* to copy an instrument with the same knobs and layout.
• Delete tags you don't use; they'd still show up in the DAW.

The full guide (same content, with tables) is in the repo: `docs/tags.md`.
Questions? Ask right here! 💜
