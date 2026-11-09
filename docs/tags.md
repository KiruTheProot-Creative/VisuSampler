# Tags: the guide for library makers

Tags are how everything in a VisuSampler instrument talks to each other. A **tag is one value with a name**:
a knob turns it, a text shows it, a button changes it, an effect listens to it, your DAW automates it.
Once you get tags, you can build almost any interface.

> Questions or something unclear? Come say hi on the [KCS Discord](https://discord.gg/JFnu6HTwgs).

## Contents

1. [The idea in one minute](#1-the-idea-in-one-minute)
2. [Making a tag](#2-making-a-tag)
3. [The three kinds of tags](#3-the-three-kinds-of-tags)
4. [Built-in tags](#4-built-in-tags)
5. [Connecting tags to things](#5-connecting-tags-to-things)
6. [Showing tags in text: `{tokens}`](#6-showing-tags-in-text-tokens)
7. [Buttons and rules: changing tags](#7-buttons-and-rules-changing-tags)
8. [Tags in VisuPlayer: DAW automation and MIDI](#8-tags-in-visuplayer-daw-automation-and-midi)
9. [Recipes](#9-recipes)
10. [Tips and gotchas](#10-tips-and-gotchas)

---

## 1. The idea in one minute

Say you want a **Cutoff** knob that moves a filter and shows `2.40 kHz` underneath:

1. Make a tag called `cutoff` (Number, 20 to 20000, unit `Hz`, logarithmic).
2. Put a knob on the interface and set its **Tag** to `cutoff`.
3. In the Effects tab, link the filter's **Cutoff** parameter to `cutoff`.
4. Put a text under the knob that says `{cutoff}`.

Now the knob, the filter and the text all share one value. Turn the knob and both follow.
In VisuPlayer that same tag also shows up as an automatable parameter in your DAW, named `cutoff`.

**Every tag stores a value from 0 to 1 inside.** What you see (Hz, dB, step names, note values) comes from the tag's
settings. That's why one knob can drive anything.

## 2. Making a tag

**Interface tab → right panel → Tags → + New tag.** Each tag has:

| Setting | What it does |
|---|---|
| **Name** | How you refer to it everywhere: in texts (`{name}`), in rules, and in the DAW. Keep it short, without spaces or dots (`cutoff`, `verbMix`, `wave`). |
| **Type** | Number, Named steps or Tempo sync (see below). |
| **Test value** | A slider to try the tag out right there; everything linked to it moves. |
| **Set default to this** | The value the tag starts at, and what *reset* goes back to. |

Renaming a tag also updates the texts that use it. A tag that nothing uses still shows up in the DAW, so delete
the ones you don't need.

## 3. The three kinds of tags

### Number
A smooth value between a **Min** and a **Max**, with a **Unit** (`Hz`, `dB`, `ms`, `%` …) and **Decimals**.
**Scaling** can be *Linear* or *Logarithmic*. Use logarithmic for frequencies and times: it feels natural on a
knob, and it needs a min above 0.

Examples: cutoff `20 – 20000 Hz` (log), volume `-60 – 6 dB`, attack `1 – 5000 ms` (log), mix `0 – 100 %`.

### Named steps
A list of choices, like `Saw, Square, Triangle, Sine` (type them comma separated, at least two).
Knobs and faders snap to the steps; buttons can step through them; texts show the step's name.

Examples: waveform, filter type, reverb room (`Room, Hall, Plate`), an on/off switch (`Off, On`).

### Tempo sync
Steps through **musical lengths** and knows how long they are at the current tempo. It counts in either:
- **Note values**: 18 steps from `1/64` up to `4 bars` (with triplets and dotted values), or
- **Fractions of a bar**: follows the time signature.

Show it as a name (`1/8T`) or as milliseconds (`{tag.ms}`). Link it to a delay time and the delay follows your
DAW's tempo.

## 4. Built-in tags

These exist automatically (marked **built-in**). You can't delete or rename them, but you can use them everywhere:
in texts, rules, conditions and on knobs.

| Tag | What it is | Exists when |
|---|---|---|
| `bank` | The selected bank (A, B, C …) | always |
| `list` | The selected list in that bank | always |
| `patch` | The selected patch: one group of the current list | the patch mode is *One group of a list* |
| `bankB`, `listB` | The same for **layer B**, the second patch playing at the same time | Layer B is switched on |
| `patchB` | Layer B's patch | patch mode is *group* and Layer B is on |
| `page` | Which interface page shows (its steps are the page names) | your interface has pages |

There's also a **List selector** element: it's tied to `bank` and `list` with no setup, so drop one in and it works.
In the player, MIDI **program change** picks the list too.

## 5. Connecting tags to things

| Where | How |
|---|---|
| **Knob, fader** | Select it → **Tag**. Turning it sets the tag; the tag moves it back (automation, presets). |
| **Button** | **Tag** + **Mode**: *Momentary* (1 while held, 0 when let go; for Number tags), *Toggle* (flips between 0 and 1), *Radio* (sets one step, e.g. step 2 of `wave`). Buttons can also run **rules** (section 7). |
| **Dropdown** | **Tag** (Named steps or Tempo sync): it lists the steps. |
| **Text, button label, text panel (LCD)** | Write `{tokens}` in the text (section 6). |
| **Effects** | Select a module → **Link parameters to tags**, pick a tag per parameter. The tag's 0–1 spans the parameter's whole range, logarithmically for frequencies. **On / off by** switches the whole module with a tag (optionally letting reverb and delay tails ring out). A **Macro** module turns a tag into a modulation source you can patch to many parameters at once. |
| **Sounds (Sound tab)** | Group settings, layer settings (volume, pan, tune) and envelopes have **Knobs on this group** / knob pickers: pick a Number tag to move them. |
| **Pages** | Buttons with *next* / *previous* / *set* on `page` switch pages. |

## 6. Showing tags in text: `{tokens}`

Anything in `{curly braces}` in a text, a button label or a text panel shows a live value.
Unknown names show in **red** on the canvas, so typos are easy to spot.

### Your own tags
| Token | Shows | Example |
|---|---|---|
| `{cutoff}` or `{cutoff.number}` | the real value with its unit | `2.40 kHz`, `-6.0 dB` |
| `{cutoff.percent}` | 0 to 100 % | `73%` |
| `{wave.name}` | a step's name / a note value | `Square`, `1/8T` |
| `{delay.ms}` | a Tempo sync tag in ms at the current tempo | `250 ms` |
| `{delay.4/4}` | the same, pinned to a time signature | `375 ms` |
| `{cutoff.raw}` | the inside value, 0.000 to 1.000 | `0.731` |

### Lists, banks and patches
| Token | Shows |
|---|---|
| `{list.name}` / `{list}` | the selected list's name |
| `{list.id}` | bank letter + number, like `A01` |
| `{list.number}` | `01`, `02` … |
| `{list.next.name}`, `{list.prev.name}` | the neighbours (also `.id` and `.number`) |
| `{list.count}` | how many lists the bank has |
| `{list.groups}` | how many groups the list holds |
| `{list.loading}` | `READY`, or `LOADING 40%` while samples load |
| `{bank}` / `{bank.letter}`, `{bank.name}`, `{bank.count}` | the bank |
| `{patch.name}` / `{patch}`, `{patch.number}`, `{patch.count}`, `{patch.next.name}`, `{patch.prev.name}` | the patch (patch mode *group*) |
| `{folder…}` | same as `{list…}` (handy when your lists are folders of patches) |
| `{listB…}`, `{bankB…}`, `{patchB…}`, `{folderB…}` | the same for layer B (shows `-` while layer B is off) |

### Tempo
| Token | Shows |
|---|---|
| `{bpm}` | the tempo (your DAW's in the player) |
| `{timesig}` | `4/4`; `{timesig.num}`, `{timesig.den}` for the parts |
| `{timesig.bar}` | one bar in ms at the current tempo |
| `{3/4}` | one bar of 3/4 in ms |

The older form `{tag:format}` works too (`{cutoff:percent}`).

## 7. Buttons and rules: changing tags

Buttons, knobs, faders, dropdowns and list selectors have **Events**: rules that run when something happens.

**When** (the event):
- buttons: `press`, `release`, `hold`, `doubleclick`
- knobs, faders, dropdowns: `change`
- list selectors: `change`, `load`

**If** (optional condition): a tag `is`, `is not`, `above` or `below` a value.

**Then** (one or more actions):

| Action | Example | Does |
|---|---|---|
| **set** … to | set `wave` to `Square` | jumps to a value: a step name, a step number (`2`), or a value like `50%`, `440 Hz`, `2 kHz`, `-6` |
| **add** … by / **subtract** … by | add `cutoff` by `10%` | moves by an amount (steps for step tags) |
| **toggle** | toggle `chorus` | flips between 0 and 1 |
| **next** / **previous** | next `list` | the next / previous step (wraps around) |
| **reset** | reset `cutoff` | back to the default |
| **random** | random `wave` | any value (or any step) |

Under each rule the Maker shows it in short form, for example:
`{on.press -> if wave = Saw -> cutoff + 10%}`. That's handy for checking it at a glance.

Rules run top to bottom; try them in **Test mode**.

## 8. Tags in VisuPlayer: DAW automation and MIDI

- **Every tag you made becomes a DAW parameter**, named after the tag (up to 64 per instrument). The built-in
  `bank`, `list` and `page` tags aren't on that list. So name your tags the way you want people to see them in
  their DAW's automation lanes.
- In the player, **right-click a knob** → its automation slot, and **MIDI learn** (move a knob on your controller).
- **Program change** picks lists. The **mod wheel** and **pitch wheel** go to the engine as usual.
- A user's presets in the player remember every tag's value.

## 9. Recipes

**Patch browser with arrows**
- A text panel: `{list.id}  {list.name}`
- Button ◀: rule `press → previous list`. Button ▶: `press → next list`.

**Two patches at once (layer B)**
Switch on Layer B in the Sound tab, then do the same with `listB`:
- text `{listB.id} {listB.name}`
- buttons with `previous listB` / `next listB`

**Waveform switch**
- A Named steps tag `wave`: `Saw, Square, Triangle, Sine`.
- Four buttons in **Radio** mode on `wave`, steps 0 to 3, each with the LED on.
- A text `{wave.name}`.

**Tempo-synced delay**
- A Tempo sync tag `time` (note values).
- In Effects: the Delay's **Time** linked to `time`.
- A knob on `time`, with a text `{time.name} · {time.ms}`. It reads `1/8 · 250 ms` at 120 BPM.

**Reverb on/off with tails**
- A Named steps tag `verb`: `Off, On`.
- The reverb module: **On / off by** `verb`, with tails.
- A Toggle button on `verb`.

**One knob, many things (macro)**
- A Number tag `drive`.
- In Effects, a **Macro** module on `drive`, cabled to the distortion's drive *and* the filter's cutoff.

**Reset all**
- A button whose `press` rule has several actions: `reset cutoff`, `reset reso`, `reset drive`…

**Pages**
- Add pages to your interface.
- Buttons `press → set page to Effects` / `set page to Main`.

## 10. Tips and gotchas

- **Names are how things find each other.** Texts and rules use the tag's *name*, so short and unique
  names are best. Avoid dots and spaces in names (`verbMix`, not `verb mix`).
- **Red text on the canvas** means a token's tag doesn't exist (typo, or it was deleted).
- **Set the defaults**: it's what a fresh instrument starts at, and what *reset* goes back to.
- **Steps from 0**: in Radio buttons, step 0 is the first step. In rules, `set … to 2` means the *2nd* step
  (or type the step's name).
- **Logarithmic** needs a min above 0 (frequencies from 20 Hz, times from 1 ms).
- **Every instrument in a library has its own tags.** Copy an instrument with *Duplicate* to keep the same
  knobs and layout.
- **Up to 64 tags per instrument appear in the DAW.** Delete the ones you don't need.
