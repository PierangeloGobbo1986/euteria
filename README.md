# EUTERIA Web

**EUTERIA**: **E**nhanced **U**niversal **T**ool for **E**xploring **R**ecordings,
**I**mprovisations & **A**rrangements. Created by Pierangelo Gobbo.

Practise with the separated parts of a song, in the browser: switch instruments on
and off, change tempo and key in real time, loop a passage, follow the bar grid and
the chords, and export the parts you need as MP3.

**Status: in development.** Phase 0 (feasibility tests on real devices) and Phase 1
(listening mode: the player with the library and the MP3 export, the timeline, editing
and saving the grid and the chords) are done and tested on smartphone and computer.
Phase 2 (the separation of the instruments in the app, on a computer) is online and
being tested.

- The app: https://pierangelogobbo1986.github.io/euteria/
- Phase 0 test page (not linked from the app): https://pierangelogobbo1986.github.io/euteria/lab/

## Using the app

The app chooses its layout from the device; the link at the bottom of the page switches
to the other one. In both, the home screen is the **Library**; in a song, *Library* and,
under it, *Save* (gold) sit at the top right. The bar at the top is opaque, without a
backdrop blur: Safari (iOS 26) then extends its colour under the status bar instead of
drawing its dark fade over it.

- **Phone layout** (phones and tablets): the songs live in a **library inside the app**.
  *Open MP3 / audio* and *Open EUTERIA project* copy an audio file or a `.euteria`
  project from the Files app, a download or a chat into the app's private storage and
  open it. The library lists every song with its length, number of tracks and size,
  shows the space they take and the space still available, and deletes songs one at a
  time (✕, then *Delete*) or all together (*Delete all*, tapped twice). The same file is
  never copied twice, and a file that is neither a project nor readable audio is refused
  before it takes any space. Volumes, tempo, key and the playhead are numbers with
  − and + buttons: a tap on the number brings up the keypad, holding a button repeats
  it. In a song, play, stop, −5 s, +5 s, the loop and the position join the bar at the
  top, with the name and *Library* and *Save*: one banner that stays in view as the page
  scrolls. Deleting a song frees the space of the app's copy; the file it was added from
  (in Files, in a chat) is not touched, as a web app cannot reach it.
- **Computer layout**: songs are opened from any folder (*Open MP3 / audio*, *Open
  EUTERIA project*, or dropped on the window), so the folder where you keep the songs
  you are studying stays the only copy. In Chrome and Edge the Library lists the songs
  opened before, to open them again with one click (the browser asks once for
  permission). The column of the tracks starts, beside the bar numbers and the
  chords, with *Bars and Chords* (the editor, see below), then *All stems* and *Original
  only*. Volumes and tempo also have sliders; keyboard: Space play or pause,
  ← → 5 seconds, Home back to the start, L loop on or off, [ and ] loop start and end
  at the current position, 1 to 7 switch a track on or off, + and − zoom, 0 the whole
  song, Ctrl+S (⌘S on a Mac) save.

In both layouts: tracks on and off (*All stems*, *Original only*), volumes up to 200%
(+20 dB), tempo 50-200%, key ±12 semitones (drums excluded), a loop with its start and
end. The card *File export and sharing* has *Share project*, for smartphones: with one
tap it sends the song's file, with its bars, chords and practice settings, with the
share sheet (email, WhatsApp, Files, AirDrop), and saves the song in the library, so the
library and the file sent are the same project. Chrome and Edge cannot share project
files (they share only images, audio, video, PDF and text): there a smartphone downloads
the project instead. On a computer *Share project* says that it works on smartphones:
there the project file saved with *Save* is shared with the app wanted, by attaching it
to an email or a message. The card has the MP3 export of the stems that are on, too,
downloaded or shared where the browser can share files (Safari, and Chrome and Edge on
some systems). The MP3 files exported stay in the app only until it closes: they are not
saved in the project and take no space on the device. Each has a red ✕ that deletes it,
and *Delete all* above the list deletes them all (after a second tap). An audio file
opens as a single track: tempo, key and loop work on the whole song.

**The timeline** shows the song as EUTERIA (Python) does: the bar numbers and the time,
the chords, and the waveform with the bar grid over it, the loop and the playhead. On a
computer every track has its own row, with its switch and volume beside it (a track
that is off is drawn dimmed); on the phone the row is the Original Track. Mouse and
finger work alike on the waveforms: a tap or a click places the playhead (the yellow
line), dragging from inside the loop moves the loop and keeps its length, dragging
from anywhere else drags the playhead, to place it exactly. Dragging the bar numbers
scrolls (with momentum on a touch screen); pinching, ctrl+wheel (a trackpad pinch) or
the zoom buttons go from the whole song (100%) to about 100 pixels per second, and a
tap on the percentage goes back to the whole song. The overview under the timeline
shows the whole song, the part in view and the loop: dragging the frame of the view or
of the loop moves it (the loop snaps to the bars), a tap elsewhere brings the view
there.

The edges of the loop are dragged and snap to the bars and beats (Alt or Option places
them freely): with a finger by the handles in the band under the bar numbers, with a
mouse anywhere along them; the green bar in that band moves the loop too. Next to
*Loop* (in the timeline's toolbar on a computer, under the timeline on the phone, after
the editing tools) one field shows the playhead to the hundredth of a second: it
follows the yellow line, and typing a time or − and + (a hundredth at a time, held to
repeat) move the line. *Set start* and *Set end* put the start or the end of the loop
at the playhead; *Set end* also switches the loop on. A loop switched on with *Loop*
starts at the bar being played (or in the middle of the view if the playhead is
elsewhere) and lasts 16 seconds, at most half of what is in view, in whole bars; a loop
already placed and in view stays where it is. While the song plays, the view follows
the playhead, except for a few seconds after it was moved by hand.
*Grid* hides the grid lines and the chords. Bar numbers start from the number saved by
EUTERIA (Python), and a chord too long for its bar uses the following empty bars.

**Editing the grid and the chords.** *Bars and Chords* (on a computer, at the top of the
column of the tracks) or *Edit* (on the phone, in the timeline's toolbar) opens the
editor of EUTERIA (Python), the same in both layouts:

- **The grid**: *BPM* (20-400, by half beats per minute), the meter (4/4, 3/4, 6/8) and
  the anchor, the first beat of a bar: *Set anchor* puts it at the playhead (placed
  exactly with the playhead field), and the field beside it moves it by hundredths of a
  second. Each change rebuilds the grid from the anchor, both ways, as EUTERIA (Python)
  does. Chords and bar numbers stay with their bars measured from the anchor, so a bar
  that appears or vanishes at the start of the song (an anchor moved by a few
  hundredths, a different tempo) shifts nothing. *Clear grid* (two taps) removes the
  grid and the chords; *Set anchor* makes a new grid at the tempo kept. An audio file
  starts without a grid, at 180 BPM as in EUTERIA (Python).
- **The chords**: a tap or a click in the chord lane selects a bar, dragging along the
  lane (or shift-click) several. The chord typed goes to every bar selected (an empty
  chord removes it); Return (*next* on the phone keyboard) goes on to the following
  bar, so a song is entered chord after chord without leaving the keyboard. ‹ and ›
  move the selection. *Copy* and *Paste* copy the chords of the bars selected: pasted
  into several bars they repeat to fill them (as in EUTERIA (Python)), pasted into one
  bar they all go in from there. On a computer: a click puts the cursor in the chord
  field, a key from A to G starts a chord, ← → move the selection (Shift: extend it),
  Delete clears it, Ctrl+C and Ctrl+V (⌘ on a Mac) copy and paste.
- **Bar numbers**: *Bar* shows the number of the bar selected; typing another number
  renumbers every bar from it (the bar number offset of EUTERIA (Python)), for a pickup
  bar or a song that starts in the middle.

Every edit is kept in the browser at once, so nothing is lost if the page closes; until
it is saved, a dot on *Bars and Chords* (*Edit*) and on *Save* says so. Leaving the song
for the Library or another song then asks, as EUTERIA (Python) does: *Save*, *Don't
save* (the song goes back to what its file has) or *Cancel*. **Save** (top right, Ctrl+S
or ⌘S) writes the grid, the chords and the practice settings (tempo, key, loop, volumes,
tracks on) in the song's `manifest.json`, in the fields EUTERIA (Python) uses:

- phone: the song in the library is updated;
- computer, Chrome and Edge: the file itself is updated (the browser asks once for
  permission to write it);
- computer, Safari and Firefox, which cannot write files: *Save a copy* downloads the
  song with the changes;
- an audio file becomes an EUTERIA project (`.euteria`) holding it, with its grid and
  chords: in the library on the phone, where you choose in Chrome and Edge, downloaded
  elsewhere.

Every song reopens as it was left (tracks, volumes, tempo, key, loop, position, zoom,
the part in view, the grid shown or hidden, the edits not saved yet): the settings are
kept in the browser. A project opened for the first time starts from the practice
settings saved in it: tempo, transposition (if the project was left transposed), loop,
volumes and the tracks that are on.

On a smartphone or a tablet it is best to add EUTERIA to the Home Screen (in Safari:
Share, then *Add to Home Screen*; in Chrome: the menu, then *Add to Home screen* or
*Install app*) and use it from there: Safari may delete the data of websites that have
not been opened for a while, never that of Home Screen apps. The Home Screen app has a
library of its own, separate from the browser's. Once loaded, the app also works without
a connection (a service worker keeps a copy of it); in Chrome and Edge it can be
installed as an app, which then opens `.euteria` files directly.

**Separating the instruments** (computer, Chrome or Edge). A song without stems (an
audio file, or a project holding only the Original Track) shows *Separate instruments*
in the column of the tracks, under *Bars and Chords*. It first asks where to save the
EUTERIA project (`.euteria`) it is going to make, so that a separation left to run on
its own is saved when it ends. The first time, it downloads the separation model (336
MB, or 669 MB for graphics cards without 16-bit floats), which then stays in the
browser. A bar under the timeline's toolbar shows the progress, the speed and the time
left; *Stop* ends it and saves nothing. The six stems are written as MP3 at 320 kbps,
with the Original Track (kept as it is if it is an MP3 or AAC file, else written as MP3
too), the grid, the chords and the practice settings, and the project opens in the
player with every stem on. The song keeps playing while it is separated; another song
opens once the separation is over. A 4-minute song makes a project of about 70 MB,
light enough to send over WhatsApp and to keep on a phone. On a phone, and in browsers
that cannot separate, a note under the tracks says what is needed.

**The version** of the app is shown next to its name. **Update** (at the top right of the
Library) looks for a new version and, if there is one, switches to it at once; the
settings of the open song are kept, and changes not saved are asked about first. A gold dot on *Update* says that a newer version is online. When online, the app
always loads its newest files anyway: the service worker asks the site whether each file
changed, and uses the copy it keeps only without a connection.

## Modes

Two modes, chosen from what the device can do:

- **Full mode** (computer with Chrome or Edge and WebGPU): separate songs into six
  stems (vocals, drums, bass, guitar, piano, other) inside the browser, plus everything
  in listening mode.
- **Listening mode** (phones, tablets, Safari, Firefox): open a project, choose the
  stems, set volumes, change tempo and key, loop, bar grid, chords, MP3 export and
  sharing. A note under the tracks of a song without stems says how to separate it.

There is no server and no account: the audio stays on each device, and projects
travel as files (for example over WhatsApp).

## Project files

- **`.euteria`**: light project for EUTERIA Web, written by EUTERIA (Python) with
  *Export for Webapp version*. A zip (members stored, not compressed) holding
  `manifest.json`, `audio/original.mp3` and `audio/stems/<stem>.mp3` (MP3, 320 kbps
  CBR, no ID3 tags). The manifest is the one of `.musicproj` with `format_version` 4,
  `variant: "web"` and `audio.tracks`, which gives for every audio member its codec,
  bitrate, sample rate, channels, exact length in samples (`frames`), and the MP3
  encoder delay and padding read from the LAME/Info tag. Transposed tracks are left
  out: EUTERIA Web transposes live. Since EUTERIA 4.3 every track is at 48 kHz (the
  stems' rate; the Original Track is resampled when needed) and as long as the
  Original Track, so that every browser decodes them all alike. Files from 4.2 keep
  the Original Track at its own rate; they still open, and the web app lines the
  Original Track up with the stems (see below).
- **`.musicproj`**: full project written by EUTERIA (Python), same layout with 16-bit
  WAV audio.

## Phase 0 test page (`lab/`)

The app no longer links to it; it stays at its address for checks on a new device or
browser.

Open it on each device (phone, tablet, computer) and go through the cards in order:

1. **This device**: browser, memory, audio support, WebGPU, and the mode the device
   would get (full or listening).
2. **Open a song**: a `.euteria` file (or a `.musicproj`). Every track is decoded, its
   length checked against the manifest, and the Original Track compared with the stems
   and lined up with them if a decoder shifted it. **Sync test** opens a small built-in
   project in the EUTERIA 4.3 format whose tracks all have a click at exactly 1.000 s,
   and reports how far each track lands from it, in samples; **Sync test, old format**
   does the same with the EUTERIA 4.2 format (Original Track at 44.1 kHz).
3. **Play**: switch tracks on and off, volumes up to 200% (+20 dB), tempo 50-200%,
   key ±12 semitones (drums excluded), loop.
4. **Export MP3**: the stems that are on, as they sound, named `Song_BassDrumsVocals.mp3`.
   Every export joins a list: tick the files you want, then **Download selected** saves
   them as separate files (the browser may ask once to allow several downloads); on
   phones and tablets **Share selected…** opens the share sheet (WhatsApp, Save to Files).
5. **Stress test**: loads a synthetic seven-track song of 1, 3, 5 or 8 minutes to find
   how much audio the device can hold. If the page reloads by itself, the next visit
   reports which step was interrupted.
6. **Engine speed**: how many times faster than real time the engine runs on this
   device with all tracks on, and its slowest moments (a single audio block, and a
   stretch of about 23 ms) against the time playback gives them.
7. **Separation (computer)**: separates the Original Track of the open song, or an
   audio file, into the six stems in the browser (Chrome or Edge with WebGPU), and
   reports the speed. With a project that already has stems from EUTERIA (Python),
   the new stems join the track list next to them ("Vocals · web" and so on) and the
   report gives, for each pair, how close they are (SI-SDR in dB, correlation, level).
   Options: the model at half or full precision, the rate it runs at (44.1 kHz, the
   rate it was trained at, or 48 kHz, as EUTERIA (Python) runs it), the ONNX Runtime
   build (1.24, 1.31, or 1.31 with the graph optimiser), and the overlap between
   blocks (50% as EUTERIA (Python), or 25%, a third less time). **Compare runtimes**
   times the first blocks of the open song with each runtime, estimates the time for
   the whole song, profiles the graphics card with ONNX Runtime 1.24 (time per kind
   of operation), and selects the fastest runtime.

**Copy report** puts every result in the clipboard, ready to paste back.

## How the audio engine works

All tracks are held as 16-bit PCM in one AudioWorklet (`src/engine-processor.js`,
`src/engine-core.js`). The tracks that are on are mixed sample by sample into two
buses, the pitched instruments with the full mix, and the drums, and each bus runs
through one [Signalsmith Stretch](https://signalsmith-audio.co.uk/code/stretch/)
instance. Tempo and key change live, the tracks cannot drift apart, and the drums keep
their pitch, as in EUTERIA (Python). Volumes above 100% use the same soft limiter as
EUTERIA (Python), and the sum goes through it too during playback.

The stretchers run at Signalsmith's default quality (120 ms blocks every 30 ms) with
the work of each block spread over the audio callbacks: done all at once, it
overflowed single callbacks on phones and playback crackled. The song is streamed
into them a few samples per callback; they are primed again only when playback starts
or jumps, and a loop is a sample-exact splice (loop end followed by loop start), so it
never drifts.

The same engine code runs in a Web Worker (`src/render-worker.js`) for the MP3 export,
which is encoded with LAME compiled to WebAssembly. The export renders the song twice:
the first pass finds the peak, the second lowers the whole song under -1 dBFS if
needed and encodes it, as EUTERIA (Python) does, so memory stays flat whatever the
length. The PCM of the tracks is lent to the worker during an export (moved, not
copied), so an export does not double the memory in use.

When a project opens, `src/align.js` compares the Original Track with the sum of the
stems (cross-correlation of their energy envelopes, as `measure_alignment_offset()`
in EUTERIA (Python)) and shifts the Original Track when a browser's decoder placed it
more than 5 ms away. Safari, for one, decoded a 44.1 kHz MP3 one MP3 frame early.

## How the separation works

The model is the one of EUTERIA (Python): BS-RoFormer SW, six stems (vocals, drums,
bass, guitar, piano, other). In the browser it runs as the ONNX conversion published
by [bs-roformer-web](https://github.com/elicwhite/bs-roformer-web): the checkpoint
without its STFT, fixed at 345 STFT frames (176128 samples), at half (336 MB) or full
(669 MB) precision. It is downloaded from Hugging Face the first time and kept in the
browser's private storage (OPFS); it is not part of this repository.

`src/separate-worker.js` runs it in a Web Worker with
[ONNX Runtime Web](https://onnxruntime.ai) on the graphics card (WebGPU), loaded from
the jsDelivr CDN. The worker computes the STFT and the inverse STFT itself
(`src/stft.js`, identical to `torch.stft` / `torch.istft` as the model uses them) and
cuts the song as `demix_track()` does in EUTERIA (Python): chunks that overlap by
half (or by a quarter, which needs a third fewer chunks), linear fades a tenth of a
chunk long, mirrored edges. The inverse STFT of a chunk runs while the graphics card
computes the next one.

Before the session is created, `src/onnx-rewrite.js` rewrites the attention of the
model: its `Einsum` nodes (queries times keys, weights times values) become
`MatMul` nodes, with a `Transpose` where needed. The result is the same, but ONNX
Runtime computes `Einsum` with a generic kernel: on an Apple graphics card these 48
nodes took three quarters of the time of every block, each holding the card for
about a tenth of a second, which most likely is also what made Chrome stutter. The model
file is edited in memory, at the level of its protobuf encoding; the downloaded file
stays as it is. Rates are converted with
`src/resample.js`, the same filter as `scipy.signal.resample_poly`.

The whole chain was checked against PyTorch with a small model of the same
architecture and random weights, exported the same way: on the CPU the stems agree
to within rounding, on WebGPU to within the graphics card's arithmetic.

Graphics cards whose WebGPU lacks 16-bit floats cannot run the half-precision model
(it would return silence instead of failing): there the Lab offers full precision
only, and the worker refuses the half-precision model. Any chunk that comes back
silent or not finite stops the separation with an error.

**In the app** (`app/separate.js`) the separation uses the choices measured on the test
page: ONNX Runtime 1.31 with the graph optimiser, the model at half precision (full
precision without 16-bit floats), at 44.1 kHz, the rate it was trained at, with chunks
overlapping by half, as EUTERIA (Python). The graphics card is asked for only when a
separation starts, so that the app does not wake the discrete graphics card of a laptop
that has two. The song is read at 44.1 kHz and trimmed as the player trims it; the stems
come back from the worker without being copied, so a long song does not need twice the
memory. A few Web Workers (`src/encode-worker.js`) encode them to MP3 with LAME, 320
kbps CBR. This LAME writes no gapless tag, so, as for the projects of EUTERIA (Python),
the manifest gives every MP3 its exact length, the encoder delay (576 samples) and the
padding (from the number of frames written); the player trims both when the project
opens, whatever the browser's decoder does, and the stems line up with the song to the
sample. The project is assembled in memory (stored zip members) and written at once to
the file chosen, read back, then opened.

## How the app keeps songs and settings

The library of the phone layout (`src/library.js`) uses the origin private file system,
storage that belongs to the site and that other apps cannot see. A song is copied there
by a Web Worker (`src/library-worker.js`) a few megabytes at a time, so a large project
never sits in memory as a whole during the copy; the list with titles, lengths and sizes
is kept in `localStorage`. At start-up the library drops entries whose file the browser
has removed, and deletes files left by a copy that was interrupted. The app asks the
browser to keep its storage (`navigator.storage.persist()`).

Recent files of the computer layout (`src/recent.js`) are the handles that Chrome and
Edge give for files opened with the system's file picker or dropped on the window, kept
in IndexedDB. The practice settings of every song (`src/settings.js`) are kept in
`localStorage`, under the project's id and the file's size (or the name and size of an
audio file); those of the 300 songs opened most recently are kept.

`src/player.js` holds one audio context and one engine for the whole session. Opening
a song closes the previous one first, so that two songs are never in memory together.

The waveforms of the timeline (`src/peaks.js`) are computed once, when a song opens,
before its audio goes to the audio thread: the lowest and highest sample every 256
samples (about 5 ms), as 8-bit values, about 90 kB per track for four minutes. The
timeline (`app/timeline.js`) draws on two canvases, one for the waveforms, the grid and
the chords, redrawn when the view changes, and one for the loop and the playhead,
redrawn as the song plays; only the part of the song in view is drawn. The grid
(`src/grid.js`) is read from the project as EUTERIA (Python) saves it: the times of the
beats and of the bars, the bar number offset and the chords, keyed by bar.

Saving (`src/zipwrite.js`, `src/manifest.js`) rewrites only `manifest.json`: the audio
is never read into memory. In place (the library, or a file Chrome and Edge may write),
the new manifest and a new zip directory replace the end of the file, a few kilobytes:
the manifest saved before as well when it is the last member, so that saving again and
again does not make the file grow (the first time, the manifest written by EUTERIA
(Python) at the start of the file stays there, unlisted). A copy is assembled by the
browser from slices of the file as it is downloaded. The file written is read back
before the app says it is saved. Chrome, Edge and the other Chromium browsers answer yes
to `navigator.canShare()` for any file but then refuse to share a project
(`NotAllowedError`): the app recognises them and offers *Download project* instead.
Safari opens the share sheet only while the tap that asks for it is being handled, so
*Share project* puts the file together at once, without waiting for the file to be read:
where the members of a project lie, and the CRC-32 of an audio file, are read
beforehand, when the song opens or is saved. A song of the library is saved after the
share sheet has taken the file (at the latest after 15 seconds, should the share sheet
stay open). Edits not saved yet are kept with the song's settings as the tempo, meter,
anchor, bar number offset and chords: the beats and bars are rebuilt from them.

## Repository layout

- `index.html`, `app/`: the app (page, styles, `app.js`, the timeline in `timeline.js`,
  the editor of the grid and the chords in `editor.js`, the separation in `separate.js`,
  the number fields in `controls.js`, icons); `version.js`, the version of the app; `manifest.webmanifest` and
  `sw.js` (service worker) make it installable and usable offline.
- `lab/`: the Phase 0 test page, and the sync test projects `sync-test.euteria`
  (EUTERIA 4.3 format) and `sync-test-old.euteria` (4.2 format).
- `src/`: shared code: project files (`zip.js`, `project.js`; written by `zipwrite.js`
  and `manifest.js`), the alignment of the
  Original Track (`align.js`), the audio engine (`engine*.js`), the player
  (`player.js`), the export worker (`render-worker.js`), the library (`library.js`,
  `library-worker.js`), recent files (`recent.js`), per-song settings (`settings.js`),
  the grid and chords of a project, and their editing (`grid.js`), waveform envelopes
  (`peaks.js`),
  the separation (`separation.js`, `separate-worker.js`, `stft.js`, `resample.js`,
  `onnx-rewrite.js`), MP3 encoding of the stems (`encode-worker.js`), device checks
  (`device.js`) and the synthetic test song
  (`synth.js`).
- `lib/`: third-party components, unchanged, each with its licence.

The site is plain HTML, CSS and JavaScript modules: there is no build step, and the
repository is published as it is by GitHub Pages. Every update published raises the
version in `version.js` (the only place it is written).

## Roadmap

- **Phase 0** (done): feasibility tests on real devices: audio engine on smartphone,
  opening `.euteria` files with exact alignment, MP3 export and sharing, in-browser
  separation on a computer.
- **Phase 1** (done): listening mode. Step 1: the player, the library (phone), opening
  files and recent files (computer), settings kept per song, MP3 export, offline use.
  Step 2: the timeline (waveforms, bar grid and numbers, chords, loop dragged on it,
  zoom, overview). Step 3: editing the grid, the bar numbers and the chords, saved in
  the `.euteria` file. All tested on smartphone and computer. The metronome is left out:
  recordings, live ones above all, do not keep a mathematical tempo.
- **Phase 2**: full mode. Step 1: separating the instruments of a song in the app and
  saving them in a project (online, being tested).
- **Phase 3**: band features.

## Licence

Copyright (c) 2026 Pierangelo Gobbo. All rights reserved. No licence is granted:
using, copying or modifying this software requires the written permission of the
copyright holder. See [LICENSE](LICENSE). Third-party components keep their own
licences, listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
