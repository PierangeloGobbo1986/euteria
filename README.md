# EUTERIA Web

**EUTERIA**: **E**nhanced **U**niversal **T**ool for **E**xploring **R**ecordings,
**I**mprovisations & **A**rrangements. Created by Pierangelo Gobbo.

Practise with the separated parts of a song, in the browser: switch instruments on
and off, change tempo and key in real time, loop a passage, follow the bar grid and
the chords, record yourself over the song, and export the parts you need as MP3.

**Status: in development.** Phase 0 (feasibility tests on real devices) and Phase 1
(listening mode: the player with the library and the MP3 export, the timeline, editing
and saving the grid and the chords) are done and tested on smartphone and computer.
Phase 2 (the separation of the instruments in the app, on a computer) and the recording
of takes over a song (version 0.5 and later) are online and being tested. The version
went from 0.12 to **2.0** in November 2026: with the separation, the takes, the tempo and
chord detection, the metronome and the empty projects, the web app is EUTERIA's second
version; the 0.x numbers below are those of its development releases.

- The app: https://pierangelogobbo1986.github.io/euteria/
- Phase 0 test page (not linked from the app): https://pierangelogobbo1986.github.io/euteria/lab/

## Using the app

The app chooses its layout from the device; the link at the bottom of the page switches
to the other one. In both, the home screen is the **Library**; in a song, *Library* and,
under it, *Save* (gold) sit at the top right.

**Language**: English or Italian. The app starts in the device's language (Italian on a
device set to Italian, English otherwise); the menu at the top right, at the left of
*Update* in the Library and of *Library* in a song, switches it at once and the browser
keeps the choice. On a computer it reads *Language:* with its menu, on the phone a small
*EN ▾* (or *IT ▾*). In Italian too, *Take*, *Stem*, *Sync*, *Loop* and *Zoom* keep their
English names, and so does the tagline.

**Instructions**: the button at the top right, between the language menu and *Update* in
the Library and under the language menu in a song (on the phone a small *?* under the
language, on both screens), opens a window with how to use EUTERIA, in the language in
use. Its text scrolls under its title; ✕, Esc or a click beside it closes it. While it is
open, the keys of the player do nothing and the page under it stays still.

- **Phone layout** (phones and tablets): the songs live in a **library inside the app**.
  *Open MP3 / audio* and *Open EUTERIA project* copy an audio file or a `.euteria`
  project from the Files app, a download or a chat into the app's private storage and
  open it. The library lists every song with its length, number of tracks and size,
  shows the space they take and the space still available, and deletes songs one at a
  time (✕, then *Delete*) or all together (*Delete all*, tapped twice). The same file is
  never copied twice, and a file that is neither a project nor readable audio is refused
  before it takes any space. Volumes, tempo, key and the playhead are numbers with − and
  + buttons: a tap on the number brings up the keypad, holding a button repeats it. In a
  song, its name (with its tracks and length on the same line), play, stop, −5 s, +5 s,
  the loop, Record and the position join the bar at the top, with *Library* and *Save*:
  one banner that stays in view as the page scrolls. Under it come *Recording input*
  (see below), then the card of the timeline, the tracks, *Song analysis* (below), *Metronome*,
  *Tempo and key* and *File export and sharing*. Deleting a song frees the space of the app's copy; the file it was added from
  (in Files, in a chat) is not touched, as a web app cannot reach it.
- **Computer layout**: songs are opened from any folder (*Open MP3 / audio*, *Open
  EUTERIA project*, or dropped on the window), so the folder where you keep the songs
  you are studying stays the only copy. In Chrome and Edge the Library lists the songs
  opened before, to open them again with one click (the browser asks once for
  permission). The transport stays in view as the page scrolls, the song's name at its
  top (its tracks and length on the same line; a click on the name renames the project,
  see Saving). Under it comes *Recording input* (see
  below), then the card of the timeline, with the overview, the bars, the chords and the
  tracks as rows; the column of the tracks starts with *All stems*
  and *Original only*, beside the bars and the time scale. *Song analysis*,
  *Metronome*, *Tempo and key* and *File export and sharing* follow, each across the page
  (*File export and sharing* in two columns). Volumes and tempo also have sliders; keyboard (listed in the transport, under its buttons): Space play or pause, ← → 5 seconds, Home back to the start, L loop
  on or off, M metronome on or off, [ and ] loop start and end at the current position, R record a take (again:
  stop), 1 to 9 switch a track on or off, + and − zoom, 0 the whole song, Ctrl+S (⌘S on
  a Mac) save.

In both layouts: tracks on and off (*All stems*, *Original only*), volumes up to 200%
(+20 dB, − and + by 5%, as the tempo), tempo 50-200%, key ±12 semitones (drums
excluded), a loop with its start and end. Every track card has a grip (⠿) at its left:
dragging it puts the track elsewhere, the Original Track and the takes as the stems, and
on a computer the row of the track in the timeline follows (on the grip, the arrow keys
↑ ↓ move the track too; the keys 1 to 9 follow the order). The order is kept with the
song and written in the project by *Save*. The card *File export and sharing* has *Share
project*, for smartphones: with one tap it sends the song's file, with its bars, chords
and practice settings, with the share sheet (email, WhatsApp, Files, AirDrop), and saves
the song in the library, so the library and the file sent are the same project. Chrome
and Edge cannot share project files (they share only images, audio, video, PDF and
text): there a smartphone downloads the project instead. On a computer *Share project*
says that it works on smartphones: there the project file saved with *Save* is shared
with the app wanted, by attaching it to an email or a message. The card has the MP3
export of the stems and the takes that are on, too (with no stem on, the Original Track
goes with the takes, or alone if its tempo, key or volume was changed: as it is, it would
be the file you already have, and the app says so), downloaded or shared where the browser can share files (Safari,
and Chrome and Edge on some systems). The list under *Export MP3* shows the MP3 files of
the song open: they stay in the app only until it closes, are not saved in the project
and take no space on the device, and they go when their song is deleted from the
library. Each has a red ✕ that deletes it, and *Delete all* above the list deletes them
all (after a second tap). An audio file opens as a single track: tempo, key and loop
work on the whole song, and *Export MP3* gives it at the tempo and in the key chosen.

**The timeline** shows, from the top: the bar numbers, the chords under them (each
chord in line with its number), the time scale, then the waveform with the bar grid over
it, the loop and the playhead; on a computer the lanes of the bars and of the chords
are named beside them. The loop and the playhead are drawn over the waveforms
only, so that the bars and their chords stay free to be clicked. On a computer every
track has its own row, with its switch and volume beside it (a track that is off is
drawn dimmed); on the phone the row is the Original Track. Mouse and finger work alike
on the waveforms: a tap or a click places the playhead (the yellow line), dragging from
inside the loop moves the loop and keeps its length, dragging from anywhere else drags
the playhead, to place it exactly. A tap or a click on the time scale places the
playhead too; a tap or a click on a bar (its number or its chord) opens *Bars and
Chords* on that bar, to write its chord (with a mouse, the cursor goes in the chord
field). Dragging the time scale or the bars scrolls (with momentum on a touch screen);
pinching, ctrl+wheel (a trackpad pinch) or the buttons of *Zoom* (at the right of the
timeline's toolbar) go from the whole song (100%) to about 100 pixels per second, and a
tap on the percentage goes back to the whole song.
The overview, the grey strip above the bars, shows the whole song, the part in
view and the loop: dragging the frame of the view or of the loop moves it (the loop
snaps to the bars), a tap elsewhere brings the view there.

The edges of the loop are dragged and snap to the bars and beats (Alt or Option places
them freely): with a finger by their handles at the foot of the time scale, with a
mouse also anywhere along them. Next to
*Loop* (in the timeline's toolbar on a computer, under the timeline on the phone, after
the editing tools) one field shows the playhead to the hundredth of a second: it
follows the yellow line, and typing a time or − and + (a hundredth at a time, held to
repeat) move the line. *Set start* and *Set end* put the start or the end of the loop
at the playhead; *Set end* also switches the loop on. A loop switched on with *Loop*
starts at the bar being played (or in the middle of the view if the playhead is
elsewhere) and lasts 16 seconds, at most half of what is in view, in whole bars; a loop
already placed and in view stays where it is. While the song plays, the view follows
the playhead, except for a few seconds after it was moved by hand.
The eye beside *Bars and chords*, in the *Song analysis* card, shows or hides the grid
lines and the chords (open: shown and editable, closed: hidden; the choice is kept with the
song). Bar numbers start from the number saved by
EUTERIA (Python), and a chord too long for its bar uses the following empty bars.

**Editing the grid and the chords.** The *Song analysis* card (between the tracks and
the metronome, the same on the computer and on the phone) holds the editor of EUTERIA
(Python); it is always at hand, with the bars and the chords selectable in the timeline
as long as the eye is open:

- **The grid** (the row under the buttons that find): *BPM* (20-400, by half beats per
  minute; *×2* and *÷2* double or halve it; at another speed, a grey line says the tempo
  played, for example *96 BPM at this speed* at 80% of a song at 120), the meter (4/4,
  3/4, 6/8; a song without bars keeps the meter alone, for the metronome and for the grid
  to come) and the first beat, where a bar starts: *Set first beat* puts it at the
  playhead, on the beat the tempo detection found nearest to it if one is within a third
  of a beat (else exactly where the playhead is), and the field beside it moves it by
  hundredths of a second. It corrects a detection that missed the first beat: the bars
  and the chords stay with the music and the whole grid, and the count-in, follow the new
  first beat. Each change rebuilds the grid from the first beat, both ways, as EUTERIA
  (Python) does. Chords and bar numbers stay with their bars measured from it, so a bar
  that appears or vanishes at the start of the song shifts nothing. A song without a
  grid starts at 180 BPM as in EUTERIA (Python), once the first beat is set; *Detect
  tempo* makes the grid from the tempo found (below).
- **The chords**: a tap or a click on a bar, on its number or its chord, selects it;
  dragging along the bars (or shift-click) selects several. No bar is selected when a
  song opens, so the keys stay the transport's (← → five seconds) until a bar is chosen;
  ‹ and › start from the bar at the playhead, and Escape lets the selection go. The chord typed goes to every bar selected (an empty
  chord removes it); Return (*next* on the phone keyboard) goes on to the following
  bar, so a song is entered chord after chord without leaving the keyboard. ‹ and ›
  move the selection. *Copy* and *Paste* copy the chords of the bars selected: pasted
  into several bars they repeat to fill them (as in EUTERIA (Python)), pasted into one
  bar they all go in from there. On a computer: a click puts the cursor in the chord
  field, a key from A to G starts a chord, ← → move the selection (Shift: extend it),
  Delete clears it, Ctrl+C and Ctrl+V (⌘ on a Mac) copy and paste.
- **The chords' row**: *Bars and chords* with its eye, the chord field, ‹ Bar n ›, *Copy*
  and *Paste*, and, at the right end, *Clear chords* (two taps: it removes every chord and
  keeps the grid; a grid not wanted is hidden with the eye). A button beside *Chords*, in the column of
  the timeline (on the phone, beside the chord field), switches every chord between letters
  and the Italian names: it says the notation it changes to (*Do Re Mi…* while the chords
  are in letters, *C D E…* in Italian); the choice is kept in this browser, and the chord
  field takes either.
- **Detect chords** (the third button of the card): the chords found (below) written in every
  bar, one chord a bar, or two when each half of the bar has its own; a bar without a
  clear chord stays empty. Pressed again (a second click when the bars have chords), it
  writes them again as they were found, in place of the chords changed or typed since:
  the song keeps what was found, so this is at once, on the phone too, and after a
  change of tempo or first beat the chords go in the new bars. They are suggestions to check
  by ear: the model often writes a triad where a seventh is played (G for G7, Dm for
  Dm7), and the names are spelled in the key of the song.
- **The chords follow the key**: with the song transposed (*Key*), the timeline and the
  chord field show the chords in the new key, and a line under the chord field says so; a
  chord typed then is kept in the song's own key, so the project saved is the same in any
  key and the chords move again with the next change of key. Only chord names move: a
  root (C to B, or Do to Si), its sharp or flat, what follows it as it is (m7, maj7,
  7(b9), sus4, ø, 6/9…) and a bass after "/"; other words (N.C., %, x2, Coda, Solo) stay
  as they are. The new names are spelled from the key of the song, estimated from its
  chords: the notes of the key, then the others as b2, b3, b5, b6 and b7 (Bb7, not A#7,
  in G), raised for diminished and half-diminished chords (C#°7, F#ø7 in C), and a bass
  as a note of its chord (D7/F#). With the key at 0 the chords are shown as typed.
- **Bar numbers**: *Bar* shows the number of the bar selected; typing another number
  renumbers every bar from it (the bar number offset of EUTERIA (Python)), for a pickup
  bar or a song that starts in the middle.

Every edit is kept in the browser at once, so nothing is lost if the page closes; until
it is saved, a dot on *Save* and the line under the card's rows say so. Leaving the song for the
Library or another song then asks, as EUTERIA (Python) does: *Save*, *Don't save* (the
song goes back to what its file has) or *Cancel*. A song opens with the name its file
gives it (an audio file, its file name); a click or a tap on the name at the top turns it
into a field to rename the project (Return or leaving the field keeps the new name,
Escape the old one). A new name is a change to save, as the bars and chords are.
**Save** (top right, Ctrl+S or ⌘S) writes the name, the grid, the chords and the
practice settings (tempo, key, loop, volumes, tracks
on, the order of the tracks) in the song's `manifest.json`, in the fields EUTERIA
(Python) uses, and the takes recorded (see below) in the project:

- phone: the song in the library is updated;
- computer, Chrome and Edge: the file itself is updated (the browser asks once for
  permission to write it);
- computer, Safari and Firefox, which cannot write files: *Save a copy* downloads the
  song with the changes;
- an audio file becomes an EUTERIA project (`.euteria`) holding it, with its grid and
  chords, named as the song (renamed or not): in the library on the phone, where you
  choose in Chrome and Edge, downloaded elsewhere; so does a new empty project the
  first time it is saved on a computer.

**Save as new project…** (the card *File export and sharing*, beside *Share project*)
asks a name (the song's, with *(copy)* after it, to start with) and saves the song as it
is now, with its tracks, takes, bars, chords and settings, in a new project with a new
identity: a second song in the library on the phone, a new file where you choose in
Chrome and Edge on a computer (downloaded in the other browsers). The song goes on as
the new project; the one saved before stays as it was saved, its changes not saved
having gone with the copy.

**New empty project** (in the Library) asks a name (*New project*, *New project 2*… to
start with) and opens a project with no audio of its own, to record into: a grid at 120
BPM in 4/4 for the metronome, the loop and the chords, 16 bars long until a take goes
past them. On the phone it is in the library at once; on a computer *Save* asks where
to put it. *Detect tempo*, *Detect chords* and the separation have nothing to analyse
there; the metronome, the takes, the bars and chords, the loop and the MP3 export work
as in any song. Its manifest has no audio members, only `audio.length_seconds`.

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
installed as an app, which then opens `.euteria` files directly. The Home Screen app
keeps the status bar above the page, opaque (no `black-translucent` style): iOS 26 draws
a dark fade over the top of an app that runs under the status bar. An app added to the
Home Screen before version 0.4.5 keeps the old style, as the system reads it only when
the app is added: its Library then says to delete it from the Home Screen and add it
again. Its library is deleted with it, so first save the projects changed on the phone
(*Share project*, then *Save to Files*).

**Recording takes** (every device and browser). *Record*, the red dot beside *Loop*,
records what you play over the song: if the song is paused it starts it from the
playhead. *Record* again, as *Stop*, ends the take and the song and goes back to the
start (of the loop, if it is on); *Pause* ends both where they are. A take may go on
past the end of the song (an audio file, a project, an empty project): playback goes
on, the song and its grid grow ahead of the playhead, and once the take is added the
song is as long as its longest take (deleting the take shortens it again). While a take is
recorded its waveform grows in the timeline, in red: on a computer in a row at the
bottom (*Recording…* beside it), on the phone in a lane under the waveform. It is drawn
as large as it can be, so a quiet input shows as clearly as a loud one; a flat line
means nothing is coming in. The input is chosen in the card **Recording input** (under
the transport): the menu lists the microphone of the
phone or the computer and the audio interfaces connected, such as a guitar processor on
USB-C. The browser names them only once the page may use the microphone, so the first
time ↻ asks for that permission, then lists them; the list follows what is plugged in
and out, the choice is kept. The meter beside the menu (under it on the phone) shows the
level of the input in dB, as in recording programs, for a few seconds after an input is
chosen and while recording: green, then yellow from −12 dB, red from −3 dB (too loud:
the take may distort; 0 dB is the loudest a take can be), and a line that holds the
highest peak for a moment. The sound is recorded as it is (no echo
cancellation, noise suppression or automatic gain, made for calls) and is not played
back through the app while recording: you hear yourself from the instrument, the amp or
the processor, which has no delay.

**The level of a take.** A song is mastered: loud and even, its average close to its
peaks. A take comes in as played, its peaks far above its average, and from an input
that leaves room to spare (an audio interface peaks around −18 dB, a phone's microphone
lower still): beside the song it would be much too quiet, and raising its volume would
push its peaks over full scale. So once recorded, a take is raised to sit about 6 dB
under the song (as a guitar in a band), measured as programme loudness is (ITU-R
BS.1770: the take, and what played while it was recorded); its few highest peaks are
held under −1 dB by a limiter that lowers them instead of cutting them. A take already
loud enough stays as it is, and with no track of the song playing it is brought to
−20 LUFS. The message after the take says by how much it was raised; its volume stays
at 100%, free to change (`src/level.js`).

Every take is a track at the bottom of the tracks (a row of its own in the timeline on a
computer, drawn in red; its grip moves it elsewhere), with its switch, its volume, a red
✕ that deletes it (a second tap confirms; on the phone it sits between the grip and the
name) and **Sync**. The take is lined up with the
song from what the engine was playing while each sample came in, minus the delay of the
devices that the browser reports (the sound on its way to the ears, the input on its way
to the page). What it does not report, as the delay of Bluetooth headphones or speakers
(a few hundred milliseconds), is corrected with *Sync*: it moves the take earlier (−) or
later (+), in milliseconds, and the next takes from the same input get the same *Sync*,
so it is set once per setup. Wired headphones, or the outputs of an audio interface,
keep the delay small and known.

With the loop on, each pass is a take: after the third one the song stops, back at the
start of the loop (a first pass shorter than a second, when *Record* is pressed near the
end of the loop, does not count). While recording, jumps, tempo, key and the loop wait,
as they would move the song under the take; volumes and tracks on stay free. A take can
be recorded with the song slower or transposed: it is then brought back to the song's
own tempo and key, so that it follows tempo and key afterwards as the stems do, and
stays with them (with the light colouring of a stretched sound). Takes recorded, deleted
or moved are changes to the song, as the bars and chords: *Save* writes them in the
project, *Share project* sends them, and leaving the song asks first. A phone keeps
about 15 minutes of takes per song in memory, a computer much more; when there is no
more room the take ends and the app says so.

On an iPhone the audio session plays and records while the input is open, and plays only
once it is closed (some seconds after the last take). Chrome and the other browsers of
the iPhone use Safari's engine, so they behave as Safari. With Bluetooth headphones, iOS
may switch them to their call mode while the microphone is open: wired headphones or an
audio interface sound better. EUTERIA (Python) does not show the takes.

**Separating the instruments** (computer, Chrome or Edge). A song without stems (an
audio file, or a project holding only the Original Track) shows *Separate instruments*
first in the *Song analysis* card; once the song has its stems the button stays there,
grey, and says the instruments are separated already. It first asks where to
save the EUTERIA project (`.euteria`) it is going to make, so that a separation left to
run on its own is saved when it ends. The first time, it downloads the separation model
(336 MB, or 669 MB for graphics cards without 16-bit floats), which then stays in the
browser. A bar in the *Song analysis* card shows the progress, the speed and the time left;
*Stop* ends it and saves nothing. The six stems are written as MP3 at 320 kbps, with the
Original Track (kept as it is if it is an MP3 or AAC file, else written as MP3 too), the
grid, the chords, the practice settings and the takes recorded over the song, and the
project opens in the player with every stem on. The song keeps playing while it is
separated; another song opens once the separation is over. A 4-minute song makes a
project of about 70 MB, light enough to send over WhatsApp and to keep on a phone. On a
phone, and in browsers that cannot separate, a note under the tracks says what is
needed.

**The version** of the app is shown next to its name. **Update** (at the top right of
the Library) looks for a new version and, if there is one, switches to it at once; the
settings of the open song are kept, and changes not saved are asked about first. A gold
dot on *Update* says that a newer version is online. When online, the app always loads
its newest files anyway: the service worker asks the site whether each file changed, and
uses the copy it keeps only without a connection.

## Modes

Two modes, chosen from what the device can do:

- **Full mode** (computer with Chrome or Edge and WebGPU): separate songs into six
  stems (vocals, drums, bass, guitar, piano, other) inside the browser, plus everything
  in listening mode.
- **Listening mode** (phones, tablets, Safari, Firefox): open a project, choose the
  stems, set volumes, change tempo and key, loop, bar grid, chords, record takes, MP3
  export and sharing. A note under the tracks of a song without stems says how to
  separate it.

**Tempo and chord detection** (computer, Chrome or Edge with WebGPU), on request:
**Detect tempo**, in the *Song analysis* card (the buttons are *Separate instruments*,
*Detect tempo* and *Detect chords*, in the order they are pressed), finds the beats and the
downbeats of the song with Beat This! (see *How the tempo detection works*) and makes
the grid from them: the tempo, the meter (4/4 or 3/4; two beats a bar become a 6/8) and
the first beat, the first downbeat. Under the buttons come the tempo of the grid and its
meter; a meter found wrong is changed there, and a first beat found wrong is put right with
*Set first beat*. **Detect chords** finds the chords with BTC (see *How the chord recognition works*) and writes
them in the bars, finding the tempo first for a song without a grid. The song plays
meanwhile; the line under the top bar tells the progress, the grid and the chords wait for the end, and a separation started meanwhile waits too. The new grid replaces
the one the song had (bars numbered from 1, chords kept with their bars) and is shown.
The tempo found is said, with a warning when it varies in the song, and how many bars
got a chord. The song is analysed as it was recorded, whatever the tempo set to play
it: the grid is right at 100% and follows any tempo; at another tempo a grey line beside the
BPM says the tempo played (`96 BPM at this speed` at 80%). What was found is kept in this browser and written in the
project by *Save* and by the separation, so a song is analysed once: pressed again,
the buttons bring back the grid or the chords as they were found, at once, after a
second click when they replace a grid or chords; the phone gets them ready and can do
the same. The changes they make are changes to save. On the phone, and in the other
browsers, a song never analysed has no buttons: its grid is the one it brings, or one
made by hand.

**The metronome** (a card of its own, between *Song analysis* and *Tempo and key*, every device, and a round
button with a metronome in the transport, between *Loop* and *Rec*, M on a computer) is
only the click: the tempo and the bars of the song stay those of *Song analysis*. It clicks on the beats of the grid, each on the beat found in the
song when there is one near it (*Detect tempo*), so it stays with a recording whose tempo
moves, a live one above all, as one steady tempo would not; it follows the tempo set,
the loop and every jump. Its first row has *On*/*Off*, its tempo in BPM (− and +), the
*Volume* up to 200% (a slider on a computer, and the value with − and +, as for the
tracks; 100% is as loud as the click was up to 0.10) and a button per beat of the bar,
for the meter of the grid: a click makes a beat an accent (a higher click), then
silent, then a beat again, for example the first beat accented, or only 2 and 4. The
tempo field says the song's tempo; changed, the click goes steadily at its own tempo,
from the first bar, and *Follow the song* brings it back (a new tempo of the grid does
too). A song without bars clicks at the metronome's own tempo from its start, with the
meter in *Song analysis*. The second row has the *Count-in* (*Off*, 1 or 2 bars; 1 by
default) of clicks before the song starts, before playback and before a take, with the
beats as set, heard only with the metronome *On* (the same for the key M and the round
button), and *Plays*, *Count-in only* (the default: the metronome counts the bars in, then
goes quiet) or *Whole song*. A third row, which applies to the whole song only (it is
dimmed with the count-in only), has *Clicks for* N *bars, then mute for* M *bars* (0: none; *bar* for 1),
*Random 💀*, and *What to mute* over its menu: *Metronome and tracks* (the default: the band
drops out, to keep the time alone), *Metronome only* or *Tracks only* (the click goes on).
*Random* makes the muted bars come unannounced, as many on the whole, the first N bars
always on; while it is on, a line under the row says so with the numbers set. The bars
are counted from where the song starts (those of the count-in are not). A count-in that
starts before the sound of the song (a song that opens with some seconds of silence)
begins just before the sound, the silence skipped, so that it counts the music in whatever
the length of that silence; from the sound on, or inside a loop, it starts where the playhead
is. The tempo, the volume, the beats (per meter), *Plays* and the muted bars are kept in
this browser, the same for every song; on and off and the count-in are not: every song
opens with the metronome off and a count-in of 1 bar. (The settings kept before 2.0 go
back to *Metronome and tracks*, the new default.)

**Speed training**, the last part of the metronome's card, under its own title: *On*/*Off*
(as the metronome's), then, with the loop on, the speed changes by its *Step* (5% to
start with) every so many passes of the loop (*Passes per step*), *Up to* the speed set
(100%), and says when it gets there; from 70%, for example, a hard passage comes up to
tempo a little at a time. A line under it says how it works, and another one asks for
the loop while it is off. Its settings are kept in this browser; it is off whenever a
song opens.

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
- **Takes** recorded in EUTERIA Web go in the same zip as `audio/takes/<id>.mp3` (320
  kbps stereo, or 160 kbps mono for a mono input), listed in `manifest.audio.takes` with
  their title, the moment of the song where they begin (`start`, seconds), `sync_ms`,
  the input, the date, and the tempo and key they were recorded at; `audio.tracks` gives
  their exact length, delay and padding as for the stems, and `practice` their volume
  and switch (keys `take-<id>`). EUTERIA (Python) ignores them.
- **The tempo detection**: `music.beat_tracking` keeps what it found: the times of the
  beats and of the downbeats (seconds, to the millisecond), the tempo, meter and anchor
  of the grid made from them, how far the beats stray from one tempo (`drift_ms`), the
  model, where it ran (`backend`: the graphics card, or the processor when the card
  could not), how long it took (`seconds`) and the version of EUTERIA Web. *Detect BPM*
  makes the grid from it again.
- **The chords found**: `music.chord_recognition` keeps the chords BTC found, as
  `segments`: `[start, end, label, p]` (seconds, BTC's label as `A:min7`, `C` or `N`
  for no chord, the mean probability of that chord over the segment), with the model,
  where it ran, how long it took and the version of EUTERIA Web. *Detect chords* puts
  them again in the bars of the grid of now.
- **The order of the tracks**: `practice.stem_order` keeps the order of the six stems,
  as EUTERIA (Python) reads it; `practice.track_order`, written by EUTERIA Web, lists
  every track in its order, the Original Track and the takes too. A project without
  `track_order` opens with the Original Track first, the stems in the order of
  `stem_order`, then the takes.

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
EUTERIA (Python). During playback the sum goes through a limiter: where it would go over
−0.9 dB the gain drops at once, just enough, and comes back over 120 ms, so the peaks of
a song and a take played together are lowered rather than cut. While the metronome clicks
over the song the gain is held instead: on a loud song every click goes over the limit,
and a gain coming back at once made the whole song dip with each click and swell between
them (2.1.1 fixes it: about 3 dB of pumping at 100%, measured on what the engine plays).
A gain lowered for a click now stays down for two bars (or as many as the silent bars and
one more, 16 s at most), each peak within 2 dB of the limit holding it again (a click
lands on the song's waveform a little differently each time), and then comes back over
1.5 s: the song stays at one level, a few dB lower while the clicks are loud, within 0.01 dB
in the test. The count-in goes through the limiter too, and every start begins afresh.

The metronome is mixed after the stretchers, at its own pitch: the engine has the
song times of its clicks (`src/metronome.js`: the beats of the grid, moved onto the
beats found, two bars more before the first) and sounds each as the song moment it
belongs to comes out of the stretchers, from the same position as the playhead and the
takes, so it is in step with the audio at any tempo (checked offline, rendered with the
engine: within 0.1 ms at 100%, a few milliseconds at other tempos) and follows the loop
and every jump. Without a grid, or at a tempo of its own, the clicks are steady, from
the anchor of the grid or the start of the song, and go on past its end. A count-in is
output time before the song starts: the clicks of the bars before the start point, with
the beats as set, the song silent, then the song on the next beat; a take recorded with
it begins where playback starts. The start point of a count-in that begins before the song's
sound is moved to 50 ms before it (`Player.firstSound()`: the first three consecutive 5 ms
envelope buckets above 4% of the 99th percentile of the tracks, takes left out), which the
clicks of the grid, two bars of them before the song, lead into. A silent bar that takes the tracks fades them out over
6 ms, ending 10 ms before its bar line (the engine knows the bar coming), so that its
first beat is silent too, and back in the same way, so that the first beat after it is
whole. The engine counts the passes of the loop, for the speed trainer. While a take is
recorded it plays on past the end of the song (silence, and the clicks), and it measures
the level of what plays before the clicks are added, so that the take's level follows
the song, not the metronome; the song lasts as long as its longest track, takes
included, or the length an empty project was given.

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

**Recording** (`src/recorder.js`, `app/recording.js`): the input (a
`MediaStreamAudioSourceNode` of the microphone or interface chosen, opened with
`getUserMedia()`) goes into the engine's AudioWorklet, which keeps each block of input
with the moment of the song it sends out in the same block (`emission()`, the same
mapping as the playhead, the stretcher's delay included). The input travels to the page
as 16-bit PCM in chunks of 8192 samples, drawn as they arrive; meanwhile the worklet
measures every 100 ms the K-weighted loudness of the input and of its own output, which
`src/level.js` turns into the take's gain at the end. Lined up on the song from that moment minus
the delay of the devices (the context's `baseLatency` and `outputLatency`, and the
track's `latency` where the browser gives it), the take is split into loop passes and
trimmed to where playback started with it (what the stretcher sends out before is its
priming). With the loop on, the worklet itself stops playback at the end of the last
pass, to the block, then keeps the input a little longer, the sound still on its way. A
take recorded at another tempo or key goes through the engine once more in
`src/render-worker.js`, at the inverse rate and transposed back. A stereo input whose
channels are equal is kept mono. Each take is encoded to MP3 at once in a worker, with
its CRC-32, so that *Share project* can put the file together during the tap. A take
starts at its own moment of the song: the engine mixes it from there (`start`), and
*Sync* only changes that moment. The alignment was checked with the engine's output fed
back to its input through a known delay: the takes land on the song to the sample, at
any tempo and key within a millisecond, and again once saved as MP3 and opened.

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

## How the tempo detection works

The beats and the downbeats come from Beat This! (Foscarin, Schlüter and Widmer, ISMIR
2024, MIT License), its `final0` model converted to ONNX with a fixed window of 1500
frames (`musetric/beat-this-onnx`, about 191 MB, downloaded from Hugging Face the first
time and kept in the browser's private storage, as the separation model). It is not
part of this repository.

`src/beats.js` reads the song as the player has it: its Original Track (or, in a
project without it, its stems added together), mono, at 22050 Hz, trimmed as the
player trims it. `src/beats-worker.js` runs the rest in a Web Worker with ONNX Runtime
Web 1.31 on the graphics card, as the `beat_this` package does without its DBN:

- the spectrogram of `LogMelSpect` (`src/melspec.js`): frames of 1024 samples every
  441 (50 a second), periodic Hann window, reflected edges, magnitudes divided by the
  square root of the frame length (torchaudio's `frame_length` normalisation), 128 mel
  bands of the Slaney scale from 30 Hz to 11 kHz without area normalisation, then
  log(1 + 1000 x); checked against a NumPy and librosa computation to 5e-7;
- windows of 1500 frames (30 s) overlapping by 6 frames at each side, the last one
  ending at the end of the song, zeros outside it (`split_piece`); the windows joined
  keeping the earlier one where they overlap, without their 6 border frames
  (`aggregate_prediction`, `keep_first`);
- a beat (or downbeat) is a frame whose logit is above 0 and the highest within 3
  frames, adjacent ones merged; each downbeat moves to the nearest beat.

`src/tempo.js` makes the grid: the beats are fitted on one straight line (beat k at
a + kT), first on the middle of the song and then on wider and wider stretches, each
beat numbered by the line of the step before, so that a missed beat, a spurious one or
a slowly drifting tempo do not shift the numbering; beats far from the line are left
out. The tempo is 60/T; the meter is the number of beats between downbeats seen most
often; the bars start at the beats whose number has the remainder most downbeats have,
and the anchor is the one at or before the first downbeat. The 95th percentile of the
distance of the beats from the line is kept as `drift_ms`: above 60 ms the app warns
that the tempo varies. All the beats and downbeats are kept in the project, for a grid
that could follow them.

The chain was tested in the browser with a stand-in model of the same inputs and
outputs (an onset detector) on songs of known tempo, meter and first downbeat; the
model itself was not reachable from the test machine.

## How the chord recognition works

The chords come from BTC (Bi-directional Transformer for Chord recognition: Park, Choi,
Jeon, Kim and Park, ISMIR 2019, MIT License), its large-vocabulary model: 12 roots
times 14 qualities (min, maj, dim, aug, min6, maj6, min7, minmaj7, maj7, 7, dim7, hdim7,
sus2, sus4), and "no chord". Its weights are kept in this repository (`models/btc`,
about 12 MB, with its licence), written as an ONNX graph by `models/btc/convert.py`
from the checkpoint of the authors (without PyTorch); the graph gives the same logits as
a NumPy copy of the model to 1.4e-5. The app downloads it from this site the first time,
checks its SHA-256 and keeps it in the browser's private storage, as the other models.

The song is read as for the tempo, mono at 22050 Hz, and `src/beats-worker.js` does
what BTC's `test.py` does:

- the constant-Q transform of librosa 0.6.3 (`src/cqt.js`), the one BTC was trained
  on: chunks of 10 s, 144 bins from C1, 24 per octave, a frame every 2048 samples, the
  song halved in rate once and then once per octave with resampy's `kaiser_fast`
  filter, the filters of the top octave applied to the spectrum of each, librosa's
  normalisations, then log(|C| + 1e-6); checked against a copy of the librosa 0.6.3
  code to 1e-3 in the lowest values and 5e-5 elsewhere;
- the features normalised with the mean and deviation BTC was trained with, the model
  run on each chunk (108 frames) with ONNX Runtime Web on the graphics card (the CPU if
  it cannot), the probability of each chord per frame; checked in the browser against
  the same chain in Python to 2e-6.

`src/chords.js` keeps them as segments: the probabilities averaged over 5 frames (half
a second), the most likely chord of each frame, frames in a row with the same chord
joined. In the bars, the chords are weighed by family (a root and its triad: C, C6,
Cmaj7 and C7 are one family; Cm, Cm6, Cm7 and Cm(maj7) another), as BTC shares its
belief among them: the family that covers most of a bar, weighted by probability, is
the bar's if it covers a third of it, written as its chord that covers most; two chords
when each half of a 4/4 or 6/8 bar has a clear family of its own that one chord for the
whole bar would hide. The names are spelled in the key of the song, estimated from all
its chords (`src/chordnames.js`).

Tested in the browser on synthesised chord sequences with the real model; the tempo
model there was the stand-in. BTC was trained on pop and rock songs: it finds roots
and major or minor well, sevenths and the rarer chords less often.

## Visit counter

`index.html` loads the counter of GoatCounter (`euteria.goatcounter.com`), which counts
page loads without cookies and without personal data. The app also counts, as events
with a name only, what is done with it (`app/counter.js`): `song-opened-audio` and
`song-opened-project`, `separation-done`, `separation-stopped` and `separation-failed`,
`mp3-exported`, `take-recorded`, `project-shared` and `project-downloaded`. They appear
in GoatCounter's list of pages under those names (the filter `is:event` shows them
alone). GoatCounter counts visitors, not repetitions: someone who does the same thing
again within a few hours counts once. Nothing about the songs, the projects
or the recordings is sent: audio never leaves the device. The script is loaded from
another site, so the service worker does not touch it, and the app works the same when
it cannot be reached (offline, or blocked by an extension). Visits from `localhost` are
not counted.

To leave a device out of the count (your own use): in a browser, open the app's address
with `#toggle-goatcounter` at the end; in the app installed on the Home Screen, which
has no address bar, tap the version number beside EUTERIA five times. The same gesture
counts the device again. The choice stays in that browser or app, until its website data
is cleared.

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

Saving (`src/zipwrite.js`, `src/manifest.js`) rewrites only `manifest.json`, unless
takes were recorded or deleted: the audio is never read into memory. In place (the
library, or a file Chrome and Edge may write), the new manifest and a new zip directory
replace the end of the file, a few kilobytes: the manifest saved before as well when it
is the last member, so that saving again and again does not make the file grow (the
first time, the manifest written by EUTERIA (Python) at the start of the file stays
there, unlisted). A copy, or a song whose takes changed, is assembled by the browser
from slices of the file (and the MP3 files of the new takes) as it is written, so the
file shrinks again when a take is deleted. The file written is read back before the app
says it is saved. Chrome, Edge and the other Chromium browsers answer yes to
`navigator.canShare()` for any file but then refuse to share a project
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
  the tempo and chord detection, on request, in `detect.js`,
  the recording of takes in `recording.js`, the number fields and the icons in
  `controls.js`, the cards dragged to another place in `sortable.js`, the events of the
  visit counter in `counter.js`, the app's icons); `version.js`, the version of the app;
  `manifest.webmanifest` and `sw.js` (service worker) make it installable and usable
  offline.
- `lab/`: the Phase 0 test page, and the sync test projects `sync-test.euteria`
  (EUTERIA 4.3 format) and `sync-test-old.euteria` (4.2 format).
- `src/`: shared code: project files (`zip.js`, `project.js`; written by `zipwrite.js`
  and `manifest.js`), the alignment of the Original Track (`align.js`), the audio engine
  (`engine*.js`), the player (`player.js`), the export worker (`render-worker.js`), the
  library (`library.js`, `library-worker.js`), recent files (`recent.js`), per-song
  settings (`settings.js`), the grid and chords of a project, and their editing
  (`grid.js`), chord names read and transposed (`chordnames.js`), the metronome's
  settings and clicks (`metronome.js`), waveform envelopes (`peaks.js`), the recording of takes (`recorder.js`)
  and their level (`level.js`),
  the separation (`separation.js`, `separate-worker.js`, `stft.js`, `resample.js`,
  `onnx-rewrite.js`), the tempo and chord detection (`beats.js`, `beats-worker.js`,
  `melspec.js`, `tempo.js`, `cqt.js`, `chords.js`; model files in the browser's
  storage: `model-store.js`),
  MP3 encoding of the stems and takes (`encode-worker.js`), device
  checks (`device.js`), the languages of the app (`i18n.js`, the Italian texts in
  `i18n-it.js`) and the synthetic test song (`synth.js`).
- `lib/`: third-party components, unchanged, each with its licence.
- `models/btc/`: the chord model (BTC, MIT), as ONNX, with its licence and the script
  that converts it.

The site is plain HTML, CSS and JavaScript modules: there is no build step, and the
repository is published as it is by GitHub Pages. Every update published raises the
version in `version.js` (the only place it is written).

The texts are written in English in the code and in `index.html`; the English text is the
key of its translation (`src/i18n-it.js`). The code writes its texts through `tr()` (with
`{name}` for the values in them) and `trn()` (one, or any other number), and writes them
again when the language changes; the texts of `index.html` are translated where they are
(`data-i18n-html` for a sentence with words in bold, `translate="no"` for what stays as
it is). A text missing from a dictionary shows in English. The instructions are written
whole in both languages in `index.html`, and the page shows the one of the language in
use. The names of the files the
app writes (the stems in a project, the MP3 exports) stay as EUTERIA (Python) gives them.

## Roadmap

- **Phase 0** (done): feasibility tests on real devices: audio engine on smartphone,
  opening `.euteria` files with exact alignment, MP3 export and sharing, in-browser
  separation on a computer.
- **Phase 1** (done): listening mode. Step 1: the player, the library (phone), opening
  files and recent files (computer), settings kept per song, MP3 export, offline use.
  Step 2: the timeline (waveforms, bar grid and numbers, chords, loop dragged on it,
  zoom, overview). Step 3: editing the grid, the bar numbers and the chords, saved in
  the `.euteria` file. All tested on smartphone and computer. The metronome came later
  (0.10), once the beats found in the song let it follow recordings, live ones above
  all, that do not keep a mathematical tempo.
- **Phase 2**: full mode. Step 1: separating the instruments of a song in the app and
  saving them in a project (online, being tested). Step 2: recording takes over a song,
  on every device, saved in the project (version 0.5, online, being tested).
- **Phase 3**: band features.

## Licence

Copyright (c) 2026 Pierangelo Gobbo. All rights reserved. No licence is granted:
using, copying or modifying this software requires the written permission of the
copyright holder. See [LICENSE](LICENSE). Third-party components keep their own
licences, listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
