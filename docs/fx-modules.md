# FX modules (concept)

Decisions so far:
- FX graphs run **per group and on the master**, plus **send/return buses**.
- **Convolution impulse files can be packed into a library**, like banner images.
- No limits on modules or connections. The CPU meter shows the cost.
- Every module exists twice: JS (VisuMaker preview) and C++ (VisuPlayer VST). First release: a solid core of about 15, the rest after.
- Module names are generic. "Inspired by" notes describe the sound, not a product.

## Routing
Splitter, Mixer, Crossover (2 to 4 bands), Mid/Side split and join, Send, Return, Gain / Pan / Width utility.

## Time
| Module | Notes |
|---|---|
| Delay | ping-pong, tempo sync, tape wobble, ducking |
| Reverb | room, hall, plate, spring; pre-delay; freeze |
| Convolution | impulse files packed in the library; trim, pre-delay, stretch |
| Shimmer | octave-up reverb for pads |

## Modulation
Chorus, Phaser, Flanger, Tremolo / Auto-pan (sync), Rotary speaker, Vibrato.

## Tone
Multi-mode filter (LP, HP, BP, notch, peak; 12/24 dB; ladder), parametric EQ (any number of bands), Distortion (tube, tape, hard clip, foldback, fuzz), Bitcrusher / Downsampler, Lo-fi (crackle, wow and flutter, noise), Cabinet (built on Convolution).

## Dynamics
Compressor, Limiter, Transient shaper, Gate, De-esser.

## Retro
The sound of early samplers, string machines and 80s studios.

| Module | What it does | Inspired by |
|---|---|---|
| Morph Filter | a filter that blends between two to four filter shapes with one knob (vowel-like, phasey, resonant peaks), modulatable | the morphing filters of late-90s rompler samplers |
| Vintage Sampler | lower bit depth and sample rate with the old converter character: no anti-alias filter (gritty aliasing), companding (soft 8-bit hiss), output filter roll-off; presets for 8-bit, 12-bit drum machine and 12-bit studio sampler | 80s sampling keyboards and drum machines |
| Varispeed | plays the sound back faster or slower like a turntable or sampler pitch knob, with the aliasing of the era | pitched-down samples of early hip-hop |
| Tape Echo | multi-head tape delay, wow and flutter, saturation that gets dirtier with feedback, spring reverb option | 70s tape echo units |
| BBD Chorus | dark, noisy bucket-brigade chorus with the classic two-mode switch | 80s analogue polysynth chorus |
| Ensemble | three-voice lush chorus for strings and pads | 70s string machines |
| Tape Machine | saturation, head bump, hiss, wow and flutter, tape age | reel-to-reel and cassette decks |
| Tape Keys | the rough attack, pitch wobble and 8-second fade of tape-based keyboards | tape-replay keyboards |
| 80s Digital Reverb | grainy, bright early-digital halls and plates, low sample rate inside | early digital reverb units |
| Gated Reverb | big reverb that cuts off sharply | 80s drum sound |
| Spring Tank | boingy spring reverb, drip control | guitar amps and dub |
| Vinyl | crackle, rumble, wear, turntable wow | records |
| Radio / Phone | band-limited, crunchy, a little noise | AM radio and telephones |

## Pedals
A **Pedalboard** module: a chain shown as stomp boxes, each with a footswitch (bypass), its own skin, and an LED.
- Footswitches and knobs can be linked to Designer tags, so a library can put real pedals on its UI.
- An **Expression** source (MIDI CC 11 or any tag) can drive any pedal knob, like a wah or volume pedal.
- Pedals are the same modules as above, so they cost nothing extra in C++.

| Pedal | Inspired by |
|---|---|
| Overdrive | mid-hump green overdrive pedals |
| Fuzz | 60s germanium fuzz |
| Distortion | 80s hard-clipping pedals |
| Wah | expression or auto wah |
| Octaver | analogue octave-down pedals |
| Pitch Whammy | expression-controlled pitch shifter |
| Comp Pedal | squashy guitar compressor |
| Chorus, Phaser, Flanger, Tremolo | classic modulation pedals |
| Uni-Vibe | throbbing photocell vibe |
| Reverse Delay | backwards echoes |
| Shimmer Verb | ambient reverb pedals |
| Freeze / Looper | holds the sound, or records a short loop |
| Noise Gate | keeps it quiet between notes |
| Volume Pedal | swells, expression controlled |

## Modulators
LFO (more shapes, sync, retrigger per note, step mode = step sequencer), Envelope (ADSR per note), Random / Sample and hold, MIDI sources (velocity, mod wheel, aftertouch, pitch bend, key position, expression CC 11), Macro, Follower, Math (scale, invert, add, multiply).

## First release (about 15)
Delay, Reverb, Convolution, Chorus, Phaser, Multi-mode filter, Parametric EQ, Distortion, Compressor, Limiter, Vintage Sampler, Tape Echo, BBD Chorus, Pedalboard (with Overdrive, Fuzz, Wah), Splitter/Mixer, plus LFO, Envelope, MIDI sources and Macro.
