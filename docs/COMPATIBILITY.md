# Backwards compatibility: a hard rule

**Every library ever exported by VisuMaker must load and sound the same in every later VisuPlayer.**
A library made with version 1 plays in version 2, 3 and every version after, without being re-exported.

## How the code keeps this rule

- **New settings are optional.** Every field added to the library format has a default that means "behave like
  before" (no layers, patch mode `list`, no sync, groups play like the Playing settings, and so on). A library without
  the field plays exactly as it did.
- **Old ways of storing audio keep loading.** Single raw blocks, packed blocks and chunked audio all still work.
  Streaming falls back to loading into memory whenever a sample cannot stream.
- **Never refuse an old library.** The player only warns about features that are *newer* than itself
  (the library's `features` list). It never removes support for an older one.
- **Nothing is renamed or reinterpreted.** A field keeps its meaning and its units forever. A change of meaning is a
  new field with a new name.
- **Projects (.vmproj) open in newer Makers too**, by the same rules.

## How it is tested

`apps/plugin/tests/compat/` holds libraries exported by earlier versions. These files are **never changed or deleted**;
new ones are added over time (one per notable version, with its date in the name). `compat.json` stores how loud each
one is every 100 ms for five notes, recorded when the file was added.

`engine_test` (run on every build, Linux and Windows) loads every file and checks it still plays the same, within 0.2 %.
If a change to the engine makes an old library sound different, the build fails.

To add a new frozen library: put the exported `.vsamp` in `tests/compat/` with the date in its name, add its file name
to the list in `testCompat()` (`tests/engine_test.cpp`), and run `VISU_COMPAT_WRITE=1 engine_test` once. That records
fingerprints for new files only; existing ones are never overwritten.

## Bug fixes

When the player did something clearly unintended, fixing it is allowed even though old libraries then sound different
(they now sound the way they were meant to, the way the Maker describes them). Each such fix is listed here.

- **2026-11-06, round robin:** "cycle" played every round-robin position at once and "random" played zero to two of
  them; each key press now plays exactly one position. "Random" may repeat a position, "random, no repeat" never does.
