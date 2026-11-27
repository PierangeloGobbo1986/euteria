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
version; the 0.x numbers below are those of its development releases. **3.0** (November
2026) opens the way to a repository shared by the community: the details of the song and of
its recording first (3.0), then the analysis of a song (its bars, sections and chords)
exported and imported on its own, lined up with the listener's own copy, then the
community itself. Version 2 stays in the branch `v2` (2.23.0), to go back to if need be.

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

**Instructions**: the button at the top right of the Library, between the language menu
and *Update*; in a song, on a computer, the big button of the tab *Help* (2.14); on the
phone a small *?* under the language, on both screens. It opens a window with how to use
EUTERIA, in the language in use, rewritten in 2.19.1: how EUTERIA is laid out, then the features one by one. Its text scrolls under its title; ✕, Esc or a click beside it closes it. While it is
open, the keys of the player do nothing and the page under it stays still.

- **Phone layout** (phones and tablets): the songs live in a **library inside the app**.
  *Import audio file* and *Open EUTERIA project* copy an audio file or a `.euteria`
  project from the Files app, a download or a chat into the app's private storage and
  open it; an audio file goes in as a project (3.2), named after it. The library lists every song with its length, number of tracks and size,
  shows the space they take and the space still available, and deletes songs one at a
  time (✕, then *Delete*) or all together (*Delete all*, tapped twice). The same file is
  never copied twice, and a file that is neither a project nor readable audio is refused
  before it takes any space. Volumes, tempo, key and the playhead are numbers with − and
  + buttons: a tap on the number brings up the keypad, holding a button repeats it. In a
  song, its name (with its tracks and length on the same line, *Undo* and *Redo* at its
  right), play, stop, −5 s, +5 s,
  the loop, Record and the position join the bar at the top, with *Library* and *Save*:
  one banner that stays in view as the page scrolls. At its foot are the tabs of the song's
  tools (2.12), as icons with a short name: *Analysis*, *Tempo*, *Metronome*, *Record* and
  *Export*. A tap brings up the panel of a tab from the bottom of the screen, under the
  banner; its ✕, or its tab again, takes it down, and so does another song opened. Under
  the banner come the card of the timeline and the tracks. Deleting a song frees the space of the app's copy; the file it was added from
  (in Files, in a chat) is not touched, as a web app cannot reach it.
- **Computer layout**: songs are opened from any folder, so the folder where you keep the
  songs you are studying stays the only copy. The Library has a box (2.14) that says a file
  may be dropped on it (or anywhere on the window), with the three ways to open one in it:
  *Import audio file* (the types it opens under its name), *Open EUTERIA project* and *New
  empty project*. In Chrome and Edge the Library lists the songs
  opened before, to open them again with one click (the browser asks once for
  permission). The transport stays in view as the page scrolls, the song's name at its
  top (its tracks and length on the same line, *Undo* and *Redo* at the right end of it; a
  click on the name renames the project, see Saving). Over the name are the tabs of the
  song's tools (2.12), as the ribbon of a word processor: *Song analysis*, *Tempo and
  key*, *Metronome*, *Bars and chords*, *Tracks*, *Recording*, *File export and sharing*
  and *Help* (2.14; in this order since 2.20). A click opens the panel of a tab
  under the transport, a click again closes it; one at a time, and the one open stays open
  from one visit to the next (in that browser). Each panel is one band, as high as the
  others: its groups side by side with their names over them, the numbers small, with ▲▼
  (they are typed, or changed with the arrow keys), the main actions as big buttons with an
  icon, the help texts as the tooltips of their groups; the MP3 files exported open in a
  small window under their button. In a narrow window the tabs show their short names
  and the groups go on more rows, a row starting as the first one does. The tabs say what
  their panels are doing: the tempo, the key and its fine tuning changed (*80% · +2st · −23c*,
  in semitones and cents), bars
  and chords hidden (a closed eye), the metronome on, a take being recorded, a detection, a
  separation (its percentage) or an export running. *Shortcuts*, at the right of the tabs
  (2.14, *Keys* before), shows in a small window the keys and what the mouse does in the
  timeline, in two lists (Escape, or a click elsewhere, closes it); how to edit the chords
  and the clips is beside their tools, in their tabs, and nothing is said twice. At the top
  right, *Language*, *Library* and *Save* are in one row. Under the transport comes the card
  of the timeline, with the overview, the bars, the chords and the tracks as rows (no line
  of help under them any more, 2.14); the column of the tracks starts with the zoom, beside
  the overview, then *All stems* and *Original only*, beside the bars and the time scale.
  Scrolling down the tracks, the lanes over them (the notes, the sections, the chords, the
  bar numbers and the time scale) and their names stay in view under the transport, as the
  transport does under the bar at the top (2.22), and work there as in their place.
  The page is up to 1360 pixels wide (1280 before 2.14). Volumes and tempo also have
  sliders. Keys: Space play or pause, ← → 5 seconds, Home back to the start, L loop on or
  off, M metronome on or off, [ and ] loop start and end at the current position, R record
  a take (again: stop), 1 to 9 switch a track on or off, + and − zoom, 0 the whole song,
  Ctrl+S (⌘S on a Mac) save, Ctrl+Z undo, Ctrl+Shift+Z or Ctrl+Y redo (⌘Z and ⇧⌘Z on a
  Mac), Escape lets go of what is selected, F2 on a track's name renames it; for the clips,
  Ctrl+A select all of them (2.17), C cut at the playhead, X delete, Ctrl+C copy, Ctrl+V
  paste (⌘A, ⌘C and ⌘V on a Mac).

**Messages** (a song opening, the progress of a detection, of a separation or of a
download, a save, an error) open in a band under the bar at the top: with a song open,
under the transport, on the phone as on a computer, so they stay in view wherever the page
is scrolled. The band lies over the page, which does not move, and has a bar for the
progress of the work it tells; it closes by itself when the work ends or after a few
seconds, an error when its ✕ is tapped.

**Undo and Redo** (2.9.0), at the right end of the line of the song's name (in the
transport on a computer, in the banner at the top on the phone), and on a computer Ctrl+Z
(⌘Z) and Ctrl+Shift+Z or Ctrl+Y (⇧⌘Z), go back and forth through what changed in the song
since it was opened: the bars, the chords, the sections and the bar numbers (*Detect
tempo* and *Detect chords* included), the name of the project, the takes (recorded,
deleted, their *Sync*, *Align*), the stems and the Original Track deleted, the tracks (on
or off, volume, order), tempo, key, loop,
the metronome and the speed training. Not what is only looked at or played: the zoom, the
part in view, the eye of the bars and chords, the notation of the chords, the playhead,
play and pause. A drag (a slider, the loop, a track moved by its grip) is one step, from
where it started to where it ended, and so are − or + pressed again and again on the same
value; the speed the speed training sets is not a step, and an undo leaves it. A message
says what was undone or redone. In a field where something is being typed (a chord, a
number, the name) Ctrl+Z is the field's own; in a chord field with nothing typed in it,
the song's, so that chords typed one after the other are undone from where the cursor
is. Undo and Redo wait while a take is recorded, and while the song is opened, exported
or saved. The steps (up to 200) last while the song stays open: opening another one, or
*Don't save* when leaving it, starts again. A take, a stem or the Original Track deleted
stays in memory meanwhile, so that *Undo* brings it back as it was, even after a *Save*
took it out of the file (a take is then encoded again, a stem or the Original Track keeps
the MP3 its file had; it goes back in at the next *Save*); a take being recorded that
needs that memory takes it back, and the oldest steps go with it.

In both layouts: tracks on and off (*All stems*, *Original only*), volumes up to 200%
(+20 dB, − and + by 5%, as the tempo), tempo 50-200%, key ±12 semitones (drums
excluded) and its fine tuning ±50 cents (2.18, below), a loop with its start and end. Every track card has a grip (⠿) at its left:
dragging it puts the track elsewhere, the Original Track and the takes as the stems, and
on a computer the row of the track in the timeline follows (on the grip, the arrow keys
↑ ↓ move the track too; the keys 1 to 9 follow the order). The order is kept with the
song and written in the project by *Save*.

**The fine tuning** (2.18). A song may have been recorded a little above or below A at
440 Hz (an old record, a band tuned by ear, a tape that ran a little fast), and an
instrument tuned to 440 then sounds out of tune with it by some tens of cents. *Tuning*,
right of *Key* in *Tempo and key* (under it on the phone), works as a tuner: its needle
shows where the song sounds now against A at 440 Hz, in the middle (and green) when in
tune, ♭ to the left and ♯ to the right, half a semitone (50 cents) at the ends. The song's
own tuning is measured the first time the panel is open with it (a second or so, the song
playing on; see *How the tuning is measured*), and the line beside *Tune* says it (*Song:
+23 cents (A 445.9 Hz)*, *about* when the song gives little to go by, or that it could not
be measured). ◀ and ▶ move the song a cent at a time, faster and faster when held; the
field beside them takes a number (50 either way at most); *Tune* puts the needle in the
middle, the song at 440 Hz (the correction is the song's tuning turned round: −23 cents);
*0* takes the correction away. The correction moves every instrument but the drums, as
the key does, and adds to it (*+2st · −23c*); the needle does not move with the key, which
goes by whole semitones. It is one step to undo (a press held on ◀ or ▶ is one step), it is
kept with the song in the browser and saved in the project, the MP3 exported has it, and a
take recorded with it is brought back to the song's own tuning, as one recorded in another
key. A project with no audio of its own has nothing to measure: the correction still
works, by ear.

**The names of the tracks** (2.15). A click on a track's name switches it on or off; a
double-click (a double tap on the phone, F2 on a computer) turns the name into a field, in
its place, to give the track a name of its own (a stem, the Original Track or a take alike;
the two clicks leave the track as it was). Return or a click elsewhere keeps the name typed,
Escape leaves it as it was, and an empty field gives the track its own name back. A new
name is a change to save, as the project's name is: one step to undo, kept in the browser
until it is saved, then written in the project (`practice.track_names`, by track) and shown
wherever the track is named (its tips, Undo's messages, the takes pasted from it).

**Deleting stems and the Original Track** (2.13). To tidy a project and make its file
smaller, every stem and the Original Track have a red ✕ as the takes do (beside the name on
a computer, between the grip and the name on the phone), as long as another of them stays:
the last one has none. ✕ takes the track out of the song at once and says that *Save*
takes it out of the file too; *Undo* brings it back, even after that *Save*. With the
Original Track on alone, deleting it switches the stems on, so the song keeps playing;
without it *Original only* goes. *Save* (and *Save as new project*, and *Share project*)
writes the project without its audio, so a stem the song does not need no longer takes
room; *Don't save* when leaving the song brings back what was deleted. On the phone, which
draws the waveform of the Original Track only, the first stem is drawn in its place.

The tab *File export and sharing* has *Share
project*, for smartphones: with one tap it sends the song's file, with its bars, chords
and practice settings, with the share sheet (email, WhatsApp, Files, AirDrop), and saves
the song in the library, so the library and the file sent are the same project. Chrome
and Edge cannot share project files (they share only images, audio, video, PDF and
text): there a smartphone downloads the project instead. On a computer *Share project*
says that it works on smartphones: there the project file saved with *Save* is shared
with the app wanted, by attaching it to an email or a message. The tab has the MP3
export of the stems and the takes that are on, too (with no stem on, the Original Track
goes with the takes, or alone if its tempo, key or volume was changed: as it is, it would
be the file you already have, and the app says so), downloaded or shared where the browser can share files (Safari,
and Chrome and Edge on some systems). The list under *Export MP3* shows the MP3 files of
the song open: they stay in the app only until it closes, are not saved in the project
and take no space on the device, and they go when their song is deleted from the
library. Each has a red ✕ that deletes it, and *Delete all* above the list deletes them
all (after a second tap). A song made from an audio file has a single track: tempo, key
and loop work on the whole song, and *Export MP3* gives it at the tempo and in the key
chosen.

**An audio file imported is a project at once** (3.2.0). An audio file never opens as it
is: *Import audio file* (and a file dropped, one of the songs opened before, the installed
app's *Open with*) makes a project of it straight away, its audio copied in as the
Original Track, so that renaming, moving or deleting the audio file afterwards changes
nothing (before 3.2 the song kept reading the file, and a file renamed while it was open
stopped the separation). On a computer whose browser saves where the user chooses (Chrome,
Edge), a window says so (*New project from …*) and its *Save…* opens the save dialog, in
the audio file's folder when the browser knows it, with the file's name: the project is
written there and opens, a project like any other (*Save* writes it in place, *Separate
instruments* adds the stems to it); *Cancel*, or the save dialog closed, imports nothing.
The audio is read whole before the save dialog opens, as that dialog empties the file
chosen: the audio file itself chosen gets its audio back, and the message says to choose
another name. A browser that cannot save where the user chooses (Safari, Firefox) opens
the project unsaved, and *Save* downloads it. On the phone the project goes straight into
the library, named after the file; the same file added again opens the project it became,
and an audio file added before 3.2 becomes a project in its place the next time it opens.
What the browser kept of an audio file opened as it was (its bars, chords, sections,
notes, tempo, key, loop: before 3.2) comes into its project, as changes still to save.

**The details of the song** (3.0.0) open the same tab, in the group *Song*: *Title* (the
song's name until another is typed; emptied, the song's name again), *Subtitle* and
*Lyricist* in one column, *Composer*, *Arranger* and *Copyright* in the next, the details
of the chord chart (2.16, before 3.0 beside *Export for MuseScore*); then *Performer*,
*Album* and *Year*, which recording the song is. In a window too narrow for the four
groups of the tab in one row, the fields get narrower. On the phone they go two by two,
each named over it, the recording first. As a song opens, what its audio file says of
itself fills the fields still empty (`src/tags.js`): the artist (or the album's artist),
the album, the year (four digits, from a date too), and the title when it is not the
song's name (a file named *01 Back to Black.mp3* tagged *Back to Black*). It reads the ID3
tags of MP3 and AAC (2.2, 2.3 and 2.4; ID3v1 at the end of an MP3 when there is nothing
else; in WAV and AIFF, their ID3 chunk), the iTunes atoms of MP4 and M4A (wherever the
file has them, at its end too), the Vorbis comments of FLAC, Ogg Vorbis and Opus, the
INFO list of WAV and the NAME and AUTH chunks of AIFF; only the tags are read, the audio
between them skipped. A project reads the tags of its Original Track's file. What the
tags give is the song's own, not a change to save; it goes into the project at the next
*Save*.

**The analysis shared on its own** (3.1.0; imported onto the song's own bars since 3.2.0).
*Share analysis…*, in the group *Project* of the same tab, makes a small file
(`.euteria-analysis`, JSON, some kilobytes) with the bars, the sections and the chords of
the song and its details, without any audio and without the notes (they stay in
EUTERIA): on the phone the share sheet takes it (Safari; elsewhere, and on a computer,
*Download analysis* saves it), to send to whoever has the same recording. *Analysis from a
file…*, in the group *Import* of *Song analysis* (on the phone too), reads one into the song
open (`src/shared.js`); a file opened with *Open*, or dropped, does the same. Its chords
and sections are pasted onto the song's own bars: the tempo, the meter, the bars and the
notes of the song stay, as its own tempo detection (or the hand) made them on its own copy
of the recording, so that silence before the music, another master or another rip change
nothing. They go in the order the analysis has them, one bar after the other, from the bar
of the song nearest in time to the first bar the analysis marks (with a chord, or where a
section starts). A song without bars takes the analysis' bars (built again from its tempo
and first beat). A song whose bars are at twice, half or another tempo than the
analysis', or in another meter, is told so (with ×2 and ÷2 in *Tempo and key* the bars are
put right, then the analysis imported again). Then four arrows come up beside *Analysis
from a file…* (two by two on a computer, as high as the button; four in a row on the phone):
‹ and › move the chords pasted a beat earlier or later (a slot of the bar: a beat in 4/4
and 3/4, half a bar in 6/8), « and » the chords and the sections a bar; always from where
the import put them, so that going back and forth loses nothing at the edges. They stay
while what the import pasted is as it left it: another change to the chords or the
sections, an undo, another song, and they go. The import and the moves of its arrows are
one step: *Undo* takes them away together, *Redo* brings them back as moved
(`app/history.js` `extend()`). The details of the song that it does not have yet come with
the analysis. Until 3.2 a fingerprint of the recording went with the file, and the bars of
the analysis were moved onto the listener's copy by lining up the two fingerprints: the
song's own bars do that better, whatever the copy, and a file of 3.1 still imports (its
fingerprint left unread).

*Export for MuseScore* (2.8), in the same tab, writes the bars and chords as a chord chart
in MusicXML, in the key of now, with a new line after *Bars per line* and at each
section. The chart takes the details of the chart where MuseScore reads them for
the frame at the top of the score: the title (`work-title`), the subtitle (`work-number`,
which MuseScore shows as the subtitle when no movement number is given), the composer, the
arranger and the lyricist (`creator`), the copyright (`rights`, at the foot of the first
page). MuseScore puts the title, the subtitle, the composer and the lyricist in that frame,
and the arranger in the project's properties (*File › Project properties*), from where it
can be added to the page. No layout or style is given, so MuseScore keeps its own; the
details of the recording are not written in it. Each detail typed is a change to save and
one step to undo, kept in the browser until it is saved in the project
(`music.chart_credits`, `music.recording`).

**The timeline** shows, from the top: the notes (2.21), the sections, the chords, the bar
numbers under them (each number in line with its chord), the time scale, then the
waveform with the bar grid over it, the loop and the playhead; on a computer the lanes are
named beside them. On the phone the time scale is under the waveform (2.22), 40 pixels
high, for a finger to drag it, and the tracks follow in the same card (before 2.22, a card
of their own, and a line of help under the timeline: the gestures are in the Instructions
now). The lanes and the tracks are two panes of the timeline (2.22), each with its two
canvases: on a computer the lanes stay in view (sticky) while the page scrolls down the
tracks. Over it, in one row on a computer (in a few on the phone), are the tools of the
chords and then *Zoom* (see *Editing the grid and the chords*). The loop and the playhead
are drawn over the waveforms only, so that the bars and their chords stay free to be
clicked. On a computer every
track has its own row, with its switch and volume beside it (a track that is off is
drawn dimmed); on the phone the row is the Original Track. Mouse and finger work alike
on the waveforms: a tap or a click places the playhead (the yellow line), dragging from
inside the loop moves the loop and keeps its length, dragging from anywhere else drags
the playhead, to place it exactly. A tap or a click on the time scale places the
playhead too; a tap or a click on a chord, or on a beat of the chord lane, selects its
bar, to write its chords (with a mouse, the cursor goes in the field of its first beat;
a click again on the bar, in the field of the beat clicked: 2.20).
Dragging the time scale scrolls (with
momentum on a touch screen). A drag that selects bars (on the chords or the sections), takes
a stretch of the bar numbers, or moves clips or the loop, scrolls the view when it reaches an
edge of the timeline or goes past it, faster the further it goes, and goes on there (2.15:
before, a long stretch had to be chosen zoomed out);
pinching, ctrl+wheel (a trackpad pinch) or the buttons of *Zoom* (at the right of the
timeline's toolbar) go from the whole song (100%) to about 100 pixels per second, and a
tap on the percentage goes back to the whole song.
The overview, the grey strip above the bars, shows the whole song, the part in
view and the loop: dragging the frame of the view or of the loop moves it (the loop by
the finest step the overview's scale allows: the bar, mostly), a tap elsewhere brings the
view there.

**The clips of the tracks** (2.10.0, on a computer). Every track, stems, Original Track
and takes alike, is played as its clips: at first one, the track whole. The strip at the
top of its row has a block for each clip, over the part of the waveform it plays. A click
on a block selects that clip (shift-click, or Ctrl-click, ⌘-click on a Mac, 2.17: more of
them, on any track, a click again on one of them leaving it out; **Ctrl+A**, ⌘A: every
clip of every track, 2.17; *Escape* lets them go; clips and bars selected for their chords
never go together). Whatever is done to one of the clips selected is done to all of them
together: moved, trimmed and faded (2.17 for these two), cut, deleted, copied. **C**, or *Cut* in the
tab *Tracks* (2.14: the tools of the clips there, each with its key under its name, and
how to use them beside them), cuts the clips selected at the playhead: place it with a
click in the waveform, which keeps the clip selected, then C; the part after the playhead
stays selected, to cut it again further on. **X**, *Delete* or *Backspace*, or *Delete*
in *Tracks*, deletes them: the track is silent there. Dragging a block moves the clips
selected together, by the eighth note as the loop's edges (Alt: freely), kept where they
were against the beats (a take played a little behind the beat stays as far behind it);
never before the song, and past its end the song grows. Clips may overlap (2.15; before,
a clip moved over others covered them): where they do, both play, added together, as two
tracks would, and the one moved last is on top. A click where they overlap takes the one on
top, a click again on it the one under it, and so on round; shortening one (its edges) is
the way to keep them apart. Dragging the
edges of a block shortens or lengthens the clip, to the eighth note, as far as the
track's audio goes; where an edge lies inside another clip, the edge is taken first. With
several clips selected (2.17), the same edge of each of them moves as much as the one
dragged, each as far as its own audio goes; the edge of a clip not selected trims that
clip alone, and selects it alone. The knobs under the strip, at the corners of the clip selected or of
the one under the mouse, fade it in and out: the curve and the part it lowers are drawn
over the waveform; with several selected (2.17), each of them gets the same fade, as long
as the one dragged. Every change is a step to undo (the clips of several tracks changed at
once are one step); the audio itself is never touched (a
take or a stem cut keeps its whole audio in the project, and the parts left out come back
with their edges). An edge that cuts the sound fades over 4 milliseconds, so that it does
not click; two clips that go on from one another, as a cut leaves them, play on without a
break. The song plays, exports (MP3: a cut Original Track alone is exported too) and is
saved with its clips, a separation gives the stems the cuts of the Original Track, and the
phone plays them and shows them in its waveform, without the strip, as it does not edit
them.

**Clips from one track to another** (2.23.0, on a computer). Dragged up or down, the clips
selected on one track go to the track the pointer is let go on, where they played in the
song (the eighth-note step and Alt as for any move): the best passages of several takes
gathered in one, pieces of the drums in a take. A clip keeps the audio it came with (the
track it was cut from: moved back there, it is that track's own audio again) and plays as
the track it is in now plays, when it is on and at its volume, but through the bus of its
audio, so a piece of the drums moved to a take is still not transposed. Its waveform is
that audio's, and its edges go as far as that audio goes. The Original Track neither gives
nor takes clips (the stems play in its place), and clips selected on several tracks move
only in time. The move is one step to undo, the clips of both tracks in it; the selection
follows the clips. A track deleted (✕) while clips moved from it play in other tracks stays
in the song as their source only, and a message says so: shown nowhere, silent, its audio
saved with the project; it leaves the song once none of them plays it any more (those
clips deleted, or their tracks), and an undo brings it back. The MP3 export and Copy play
the clips with the audio they came with.

**Copy and paste** (2.11.0, on a computer): tracks, or parts of them, from one song to
another, or within the same song. **Ctrl+C** (⌘C on a Mac), or the copy button of
*Clips*, copies the clips selected, on one track or several, as they sound: their fades
and the 4-millisecond edges are in the audio copied, and what lies between two clips of a
track is silence (and where they overlap, their sum). The copy stays in the page while other songs are opened (not after the
page is reloaded) and replaces the one before. **Ctrl+V** (⌘V), or the paste button
(its tip says what it pastes), puts it at the playhead of the song open, as takes: one
for each track copied, the first at the playhead and the others where they were against
it, named after the track and the song it comes from (*Bass (Autumn Leaves)*), with its
volume. A take pasted is a take like one recorded (its own MP3, saved in the project;
Sync, ✕, Undo; its clips are cut, moved and faded as any other), selected at once, to be
moved; pasted from the drums, it goes with them and is not transposed. It takes room
among the takes of the song, as a recording does. The audio is copied from the audio
thread a few seconds at a time, so the song goes on playing; the tempo and the key are
not changed (the takes play at the song's own, as recorded ones).

**The loop** (2.5): the bar numbers choose a stretch of the song for it. A tap or a click
on a number takes that bar; dragging along the numbers takes a stretch by the eighth note
(half a beat in 3/4 and 4/4, a beat in 6/8; with the song zoomed out so far that the
eighths are too close together, by the beat or by the bar: zooming in brings the eighths
back); shift-click takes in more bars. The stretch is marked in the lane of the numbers,
and *Loop*, in the transport (the key L on a computer), loops it; with the loop on, a new
stretch is the loop at once. Bars selected (a section, or bars of the chord lane) chosen
after the stretch are looped instead (2.20: a section selected, then *Loop*). *Loop* with no
stretch chosen, or one out of view, starts the
loop at the bar being played (or in the middle of the view if the playhead is elsewhere),
16 seconds long, at most half of what is in view, in whole bars; a loop already placed and
in view stays where it is. The edges of the loop are dragged, and the loop moved from
inside it, by the same step as the stretch along the numbers (2.6.1: the eighth note when
zoomed in enough, else the beat or the bar; before, they snapped to the nearest bar or
beat; Alt or Option moves them freely): with a finger by their handles on the edge of the
time scale by the waveform (its foot on a computer, its top on the phone), with a mouse also
anywhere along them; on a computer [ and ] put the start or
the end of the loop at the playhead. While the song plays, the view follows the playhead,
except for a few seconds after it was moved by hand.
The eye (*Show*, in the tab *Bars and chords* on a computer; on the phone over the
timeline, beside *Bars and chords*) shows or hides the sections, the grid lines and the
chords (open: shown and editable, closed: hidden, a closed eye on the tab; the choice is
kept with the song, in this browser, and saved in the project). On a computer the same eye
is also at hand in the timeline (2.17): a small square button before the one of the
notation (*DO RE MI…* or *C D E…*, beside *Chords* in the column of the tracks); with the
bars and chords hidden their lanes go, and the eye waits
beside the time scale, before *All stems*, to show them again (the focus of the keyboard
goes with it). On the phone, until 2.22, when nothing was over the waveforms, the line
under the timeline said why first (no bars yet, or hidden). Bar numbers start from the number saved by
EUTERIA (Python). Each chord is written where its beat is (2.7: a short mark under one that
starts inside its bar), and a name too long for its room uses the following empty bars.

**Editing the grid and the chords.** The editor of EUTERIA (Python) is in two places: the
grid in the *Song analysis* tab (*Tempo and grid*, beside *Detect tempo*, 2.14), the chords
in the tab *Bars and chords* on a computer (2.14; chords or a section clicked in the
timeline open it, the timeline staying where it was under the mouse) and over the timeline
on the phone.
Both are always at hand, with the chords selectable in the timeline as long as the eye is
open:

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
- **The chords** (2.7: beat by beat): a bar has a field for each beat a chord may start on,
  four in 4/4, three in 3/4, two in 6/8 (beats 1 and 4), side by side over the timeline,
  each with the number of its beat while empty. A tap or a click on a bar in the chord lane
  selects it with its first beat (2.20); a tap or a click again on the bar selected takes the
  beat it is on (lit in the bar and under its field; on a chord's name, that chord's beat,
  even where the name runs over the next beats), and on a smartphone opens the keyboard
  there (the first tap only selects). With a beat chosen so (or a field clicked, or Tab and
  ← → among the fields), Ctrl+C or ⌘C copies its chord alone, and Ctrl+V or ⌘V puts a chord
  copied alone on the beat of the field, in every bar selected; after a first click they
  copy and paste the bars, as before (*Copy* and *Paste* always do). Dragging
  along the chords (or shift-click) selects several bars (the bar numbers are for the
  loop). No bar is selected when a song opens, so the keys stay the transport's (← → five
  seconds) until a bar is chosen; ‹ and › start from the bar at the playhead, and Escape
  lets the selection go, as does *Deselect* on a computer (2.15: beside the name of the
  sections, in their orange, while bars are selected; beside *Bars*, in its light blue,
  another lets go of the stretch chosen on the bar numbers while the loop is off). A chord typed in a field goes on that beat of every bar selected
  (an emptied field removes the chord of its beat; where the bars selected differ, the
  field shows …). Chords typed one after the other in one field are spread over the rest
  of the bar, as a chart reads them: two typed in the field of beat 1 go on beats 1 and
  3, three on 1, 3 and 4, more than the beats left share the last ones. Return (*next*
  on the phone keyboard) goes on to beat 1 of the following bar, so a song is entered
  bar after bar without leaving the keyboard; on a computer Tab goes on to the next beat
  (from the last one, to the next bar; Shift+Tab back), and ← → at an end of the text
  to the field beside. *Copy* and *Paste* copy the chords of the bars selected, beat by
  beat: pasted into several bars they repeat to fill them, pasted into one bar they all
  go in from there. The sections wholly in the bars copied go with them (2.15: a section
  selected is copied with its name): pasted, they take the place of the sections in the
  bars pasted into, repeated with the chords, and are numbered again (*Verse 1* pasted
  after it becomes *Verse 2*); one step to undo. Part of a section copies its chords only.
  On a computer, Return with bars selected opens *Bars and chords* at their field. On a computer: a click puts the cursor in the field of the beat
  clicked, a key from A to G starts a chord on the beat lit, ← → move the selection
  (Shift: extend it), Delete clears it, Ctrl+C and Ctrl+V (⌘ on a Mac) copy and paste.
  With another meter the chords move to its beats, by where they fall in the bar (from
  4/4 to 6/8, beat 3 goes on beat 4 of 6/8; two landing on the same beat share it). A
  project saved before 2.7 has one text a bar (*C G*): it opens with its chords spread
  over the bar, the same way.
- **The tools of the chords**: on a computer the tab *Bars and chords* (2.14): *View* (the
  eye), *Chords of the bar* (the fields of the beats), *Bar* (‹ n ›), *Edit* (*Copy* and
  *Paste*, *Clear chords*: it removes every chord and keeps the grid, *Undo* brings them
  back; a grid not wanted is hidden with the eye) and *Note* (2.21, where *How to* was:
  its lines are in *Shortcuts* now, under *Chords*, *Sections* and *Notes*); on the phone
  (over the timeline, 2.5) the eye and *Zoom*, then the fields of the
  beats in a row of their own, then the field *Note*, then the bar with *Copy* and *Paste*,
  then the notation and *Clear chords*. What they do (chords copied, pasted, cleared, bars renumbered) is said in
  the band of the messages. A button beside *Chords*, in the column of the timeline (on the
  phone, beside *Clear chords*), switches every
  chord between letters and the Italian names, written in capitals so that the m of a minor
  chord stands out (*REm7*, *SOL7*): it says the notation it changes to (*DO RE MI…* while
  the chords are in letters, *C D E…* in Italian); the choice is kept in this browser, and
  the fields take either, the Italian names in any case (*DO7*, *Do7*, *do7*).
- **Detect chords** (the third button of *Song analysis*): the chords found (below) written in every
  bar, on the beat where each starts (2.7; before, one chord a bar or two on its halves):
  a change on beat 3 of 4/4 (beat 4 of 6/8) needs little evidence, on the other beats
  clearly more, so a chord heard for a moment does not change the bar; a bar without a
  clear chord stays empty. Pressed again, it
  writes them again as they were found, in place of the chords changed or typed since:
  the song keeps what was found, so this is at once, on the phone too, and after a
  change of tempo or first beat the chords go in the new bars. They are suggestions to check
  by ear: the model often writes a triad where a seventh is played (G for G7, Dm for
  Dm7), and the names are spelled in the key of the song.
- **The chords follow the key**: with the song transposed (*Key*), the timeline and the
  fields of the beats show the chords in the new key, and a line under them says so; a
  chord typed then is kept in the song's own key, so the project saved is the same in any
  key and the chords move again with the next change of key. Only chord names move: a
  root (C to B, or DO to SI), its sharp or flat, what follows it as it is (m7, maj7,
  7(b9), sus4, ø, 6/9…) and a bass after "/"; other words (N.C., %, x2, Coda, Solo) stay
  as they are. The new names are spelled from the key of the song, estimated from its
  chords: the notes of the key, then the others as b2, b3, b5, b6 and b7 (Bb7, not A#7,
  in G), raised for diminished and half-diminished chords (C#°7, F#ø7 in C), and a bass
  as a note of its chord (D7/F#). With the key at 0 the chords are shown as typed.
- **Bar numbers**: *Bar* shows the number of the bar selected; typing another number
  renumbers every bar from it (the bar number offset of EUTERIA (Python)), for a pickup
  bar or a song that starts in the middle.
- **The sections** (2.2): the form of the song, in a lane of its own at the top, over the
  chords (*Sections*, beside it on a computer), each section a coloured block along its bars with
  its name. The names are *Intro*, *Verse*, *Pre-chorus*, *Chorus*, *Bridge*, *Solo*,
  *Interlude* and *Outro* (in Italian *Intro*, *Strofa*, *Pre-ritornello*, *Ritornello*,
  *Bridge*, *Assolo*, *Interludio*, *Finale*), the letters *A* to *D* of a jazz form, or one
  typed (*Other…*, up to 24 characters); a name that comes back is numbered in order (*Verse
  1*, *Verse 2*; *A1*, *A2*, *B*, *A3*). The lane selects as the bars do, a section at a time:
  a click or a tap on a section selects all its bars, on a bar without one that bar; dragging
  along the lane, or shift-click, takes in more. A click or a tap on the bars selected opens
  the menu of the names (under the click on a computer; a panel at the bottom of the screen on
  the phone, the page moving up so that the bars selected stay in view over it), with *Remove
  section* when they hold one. Bars selected on their chords are named the same way, by a
  click on them in the lane of the sections: so a section can be given to part
  of another one, which keeps the rest of its bars. With the loop on, a section clicked or
  tapped is looped, from the first beat of its first bar to the end of its last one;
  shift-click takes in more sections, and a click on a section among several selected loops
  that one alone (the menu opens once the loop is on the bars selected). A stretch chosen on
  the bar numbers is the loop at once too (shift-click there takes in more bars), and
  shift-click on the time scale moves the edge of the loop on its side to the nearest beat
  (inside the loop, the nearer edge comes in). The loop's handles are dragged as before. The sections stay with their bars when the grid is rebuilt
  (BPM, ×2, ÷2, meter, first beat, a new tempo found), as the chords do, and are saved in the
  project as `music.sections` (`first_bar`, `last_bar`, and `kind` or `label`), which EUTERIA
  (Python) leaves alone.
- **The notes** (2.21): a text over a bar or a run of bars (*play it loud, with
  distortion*), in a lane of its own at the very top, over the sections (*Notes*, beside it
  on a computer), with a line where each bar starts, always. Each note is a block along its
  bars with its text, cut to fit; notes may overlap (one for a section, one for a bar of it,
  never two on the same bars), and the lane then grows a row, the longer note over the
  shorter. A click on a bar in the lane selects it and puts the cursor in the field *Note*
  (the tab *Bars and chords*; on the phone, under the chord fields, where the first tap
  selects and a tap again opens the keyboard); dragging along the lane, or shift-click,
  selects more bars; a click on a note takes its bars. A section selected (in its lane: that
  click leaves the keys free, Space still plays) and then a click on its bars in the lane of
  the notes gives the note of the whole section; a click again there, the note of one bar.
  The field shows and takes the note of the bars selected, those exactly, and says which;
  Return keeps it, Escape gives back the one before, an empty note is taken away (one step
  to undo, said in the band of the messages). The notes stay with their bars when the grid
  is rebuilt, are saved in the project as `music.notes` (`first_bar`, `last_bar`, `text`,
  up to 2000 characters), and stay in EUTERIA: *Copy* and *Paste* leave them, and the chord
  chart for MuseScore has none. On a computer the mouse resting a moment on the lanes shows
  what they say, whole, in a box beside it: the notes of the bar (each with its bars), its
  chords with their beats (*Bar 12: Dm7 (1), G7 (3)*), the name of its section with its
  bars; useful when the song is zoomed out and the lanes cut them short.

Every edit is kept in the browser at once, so nothing is lost if the page closes; until
it is saved, a dot on *Save* says so (on the phone, the line under the grid in *Song analysis* too). Leaving the song for the
Library or another song then asks, as EUTERIA (Python) does: *Save*, *Don't save* (the
song goes back to what its file has) or *Cancel*. A song opens with the name its file
gives it (an audio file, its file name); a click or a tap on the name at the top turns it
into a field to rename the project (Return or leaving the field keeps the new name,
Escape the old one). A new name is a change to save, as the bars and chords are, and
on *Save* the file takes it too (2.5.2): in its folder in Chrome and Edge (the browser
moves the file to the new name; not onto a file EUTERIA may write there, and if the
browser cannot move it or refuses, the file keeps its name and the message says so), in
the library on the phone, and in a copy downloaded or shared. Chrome, as it is now,
renames a file only for a page that may write the file's folder (the feature
`FileSystemAccessRenameRequiresParentWritePermission`, on by default; earlier Chrome
asked only for a click just before), and EUTERIA holds the file alone: the rename is
mostly refused (`NotAllowedError`). *Save* then opens the save dialog in the file's
folder, with the new name filled in (2.6.2): confirmed, the project is written there
whole and read back, then the old file is removed (a rename in two steps; the same
project, its settings and its place in the songs opened kept); cancelled, or the same file
chosen, the project is saved in its file as before, the message says the file keeps its
name, and the dialog is not opened again for that name until the page is. Should the
dialog not open in the click of *Save* (Chrome opens it only right after a click, and a
permission asked for first may use that up), the project is saved in its file and the
message offers *Rename…* (2.6.3), whose own click opens the dialog and does the same;
were the dialog refused again, the message says why. Where Chrome
allows it, the file is simply renamed first, right after the click, then written
(2.6.1). A file whose name is not the project's (renamed before 2.5.2, or by hand) takes
it at any *Save*, even with nothing else changed.
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

Every song reopens as it was left (tracks, volumes, tempo, key and fine tuning, loop, position, zoom,
the part in view, the grid shown or hidden, the edits not saved yet): the settings are
kept in the browser. A project opened for the first time starts from the practice
settings saved in it: tempo, transposition (if the project was left transposed), the fine
tuning, loop, volumes and the tracks that are on.

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
means nothing is coming in. The input is chosen in the tab **Recording** (the panel
*Recording input* on the phone): the menu lists the microphone of the
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
✕ that deletes it at once (*Undo* brings it back; on the phone it sits between the grip
and the name) and **Sync**. The take is lined up with the
song from what the engine was playing while each sample came in, minus the delay of the
devices that the browser reports (the sound on its way to the ears, the input on its way
to the page). What it does not report, as the delay of Bluetooth headphones or speakers
(a few hundred milliseconds), or the buffers of a guitar processor on USB (about 100 ms
with a Tone Master Pro), is corrected with *Sync*: it moves the take earlier (−) or
later (+), in milliseconds, and the next takes from the same input get the same *Sync*,
so it is set once per setup. Wired headphones, or the outputs of an audio interface,
keep the delay small and known.

**Align** (2.6.0) finds that *Sync* by itself. A take holds only what was played, not the
song, so it cannot be lined up as the stems are, by comparing it with the mix; it is
lined up with the bars instead. Once a take is recorded in a song with bars, the attacks
of its notes are found (the energy of the signal's slope rising by about 7 dB within
8 ms) and set against the beats of the grid: a part played in time puts most of them at
the same distance from a beat, or from an eighth note between two beats, straight or
swung, and that distance is the delay. It is looked for between 100 ms early and 300 ms
late, within one beat, so that a whole beat cannot be mistaken for it. When the take is
20 ms or more out, the message after it says by how much, with **Align**: one tap puts the
take (with the loop on, all its passes) in time and keeps that *Sync* for the next takes
from the same input, which then come in on time. The answer is given only when one
distance clearly wins: a solo full of syncopations, or eighth notes as strong on the beat
as off it, may give none, and the take is then lined up by hand as before; a take is lined
up with the grid, so a grid off the music puts the take off it too (`src/take-sync.js`).
Tested on synthetic takes (quarter notes, straight and swung eighths, comping, from 96 to
240 BPM, from 40 ms early to 220 ms late, a distorted sound) and on the test songs moved
by known amounts: found within 2 ms, or no answer.

With the loop on, each pass is a take, and the recording goes on until it is stopped
(2.20; before, the song stopped after the third pass): the last three whole passes are
kept, and the message says how many were recorded. A pass cut short (the first, when
*Record* is pressed inside the loop; the last, by *Stop*) is kept only if no pass is whole;
the audio of the passes that can no longer be kept is let go as the recording goes on. While recording, jumps, tempo, key and the loop wait,
as they would move the song under the take; volumes and tracks on stay free. A take can
be recorded with the song slower or transposed: it is then brought back to the song's
own tempo and key, so that it follows tempo and key afterwards as the stems do, and
stays with them (with the light colouring of a stretched sound). Takes recorded, deleted
or moved are changes to the song, as the bars and chords: *Save* writes them in the
project, *Share project* sends them, and leaving the song asks first. A phone keeps
about 15 minutes of takes per song in memory, a computer much more, the takes deleted
that *Undo* can bring back included (a take being recorded takes their room first); when
there is no more room the take ends and the app says so.

On an iPhone the audio session plays and records while the input is open, and plays only
once it is closed (some seconds after the last take). Chrome and the other browsers of
the iPhone use Safari's engine, so they behave as Safari. With Bluetooth headphones, iOS
may switch them to their call mode while the microphone is open: wired headphones or an
audio interface sound better. EUTERIA (Python) does not show the takes.

**Separating the instruments** (computer, Chrome or Edge). A song without stems (an
audio file, or a project holding only the Original Track) shows *Separate instruments*
first in the *Song analysis* tab; once the song has its stems the button stays there,
grey, and says the instruments are separated already. Where the project goes is settled
first, so that a separation left to run on its own is saved when it ends (2.19.2): a song
that is already a project saved in a folder gets its stems in that same file, written once
the separation is over (EUTERIA asks once for the permission to write it); an audio file,
or a project of the library, asks where to save the EUTERIA project (`.euteria`) it is
going to make. Meanwhile the song's file is read whole: Chrome empties the file chosen in
the save dialog as soon as the choice is confirmed, and the name suggested is the
project's own, so a project renamed and saved, then separated, could be emptied before it
was read ("The requested file could not be read") and then removed. Now the file chosen,
if it is the song's own, gets the stems, or what it had back if the separation does not
end; a separation that fails in place leaves the file as it was. The first time, it
downloads the separation model
(336 MB, or 669 MB for graphics cards without 16-bit floats), which then stays in the
browser. A bar in the *Song analysis* panel shows the progress, the speed and the time left
(the band of the messages, under the transport, shows them too, and the tab its percentage);
*Stop* ends it and saves nothing. The stems are written as MP3 at 320 kbps, with the
Original Track (kept as it is if it is an MP3 or AAC file, else written as MP3 too), the
grid, the chords, the practice settings and the takes recorded over the song, and the
project opens in the player with every stem on. A stem that comes out empty, because its
instrument is not in the song (louder than −40 dB, 1% of full scale, for half a second at
most in all, in windows of 50 ms: the faint leftovers of the other instruments), is left
out, and the message at the end names it; an instrument that plays, even softly or for a
moment, stays (`src/silence.js`). The song keeps playing while it is
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
  separate it. Since 2.6.0 a phone or a tablet plays the projects a computer prepared:
  the bars, chords and sections are seen and edited there, but not detected (see
  below).

**Tempo and chord detection** (computers, on request, as the separation). A computer with
Chrome or Edge and a graphics card WebGPU can use finds the beats with the full model of
Beat This! on it; another browser, or a computer whose graphics card WebGPU cannot use
(asked when a detection starts), with its small model on the CPU (about 10 MB to download
the first time instead of 191, the same steps, a few seconds more; a first downbeat found
wrong is more likely there, and is put right with *Set first beat*). The chords are found
by the same model everywhere. A phone or a tablet has no *Detect tempo* nor *Detect
chords* (2.6.0; from 2.3.0 to 2.5.2 it ran the small model): Safari on iPhone cannot
give ONNX Runtime the WebAssembly memory it asks for (`RangeError: Out of memory`, then
`no available backend found`), so the project is prepared on a computer and played
there with its grid, chords and sections, which can still be edited by hand.
**Detect tempo**, in the *Song analysis* tab (2.14: its three parts are *Stem separation*,
with *Separate instruments*, on a computer, *Tempo and grid*, with *Detect tempo* beside the
grid it makes, and *Chords*, with *Detect chords*, in the order they are used), finds the beats and the
downbeats of the song with Beat This! (see *How the tempo detection works*) and makes
the grid from them: the tempo, the meter (4/4 or 3/4; two beats a bar become a 6/8) and
the first beat, the first downbeat. Under the buttons come the tempo of the grid and its
meter; a meter found wrong is changed there, and a first beat found wrong is put right with
*Set first beat*. **Detect chords** finds the chords with BTC (see *How the chord recognition works*) and writes
them in the bars, finding the tempo first for a song without a grid. The song plays
meanwhile; the band of the messages, under the transport, tells the progress with a bar, the grid and the chords wait for the end, and a separation started meanwhile waits too. The new grid replaces
the one the song had (bars numbered from 1, chords kept with their bars) and is shown.
The tempo found is said, with a warning when it varies in the song, and how many bars
got a chord. The song is analysed as it was recorded, whatever the tempo set to play
it: the grid is right at 100% and follows any tempo; at another tempo a grey line beside the
BPM says the tempo played (`96 BPM at this speed` at 80%). What was found is kept in this browser and written in the
project by *Save* and by the separation, so a song is analysed once: pressed again,
the buttons bring back the grid or the chords as they were found, at once (what they
replace comes back with *Undo*). The changes they make are changes to
save. Only in a browser without workers or WebAssembly does a song never analysed have no
buttons: its grid is the one it brings, or one made by hand.

**The metronome** (a tab of its own, after *Tempo and key*, every device, and a round
button with a metronome in the transport, between *Loop* and *Rec*, M on a computer) is
only the click: the tempo and the bars of the song stay those of *Song analysis*. It clicks on the beats of the grid, each on the beat found in the
song when there is one near it (*Detect tempo*), so it stays with a recording whose tempo
moves, a live one above all, as one steady tempo would not; it follows the tempo set,
the loop and every jump. Its first group, *Click*, has *On*/*Off*, its tempo in BPM, a
button per beat of the bar and the *Volume* up to 200% (a slider on a computer, and the
value, as for the tracks; 100% is as loud as the click was up to 0.10); the buttons per beat,
for the meter of the grid: a click makes a beat an accent (a higher click), then
silent, then a beat again, for example the first beat accented, or only 2 and 4. The
tempo field says the song's tempo; changed, the click goes steadily at its own tempo,
from the first bar, and *Follow the song* brings it back (a new tempo of the grid does
too). A song without bars clicks at the metronome's own tempo from its start, with the
meter in *Song analysis*. The second group has the *Count-in* (*Off*, *Auto*, 1 or 2 bars;
*Auto* by default, 2.20: two bars when the song comes in more than a quarter of a beat
before the downbeat the count-in ends on, a pickup or a start inside a bar, else one) of
clicks before the song starts, before playback and before a take, with the
beats as set, heard only with the metronome *On* (the same for the key M and the round
button), and *Plays*, *Count-in only* (the default, 2.7.1: the metronome counts the bars
in, then goes quiet) or *Whole song*. *Silent bars* is a group of its own in the tab,
a mode of the metronome as *Speed training* under it is (2.5.1), for the whole song only
(dimmed with the count-in only): its switch *On*/*Off* (2.5; *Off* with every song, the rest
of its row dimmed), then *Clicks for* N *bars, then mute for* M *bars* (*bar* for 1),
*Random 💀*, and *What to mute* over its menu: *Mute metronome and tracks* (the default: the
band drops out, to keep the time alone), *Mute metronome only* or *Mute tracks only* (the
click goes on; 2.14, the names before were without *Mute*).
*Random* makes the muted bars come unannounced, as many on the whole, the first N bars
always on; while it is on, a line under the row says so with the numbers set. The bars
are counted from where the song starts (those of the count-in are not). The count-in is on
the bars of the grid (2.5): it ends on a downbeat, and the song comes in where it is in
that bar. From before the sound of the song, the silence before it is skipped and the
count-in ends on the downbeat of the bar the sound begins in: a song that starts with a
pickup (a note on beat 4, or an upbeat) has it sound with the last beats of the count-in,
and bar 1 comes in on the next downbeat. From the playhead later in the song, or from the
start of a loop, it ends on the downbeat of the bar that starts there, or else of the next
one, going on over the song up to it (from beat 3, beats 1 and 2 alone, then the song with
3 and 4). A moment of silence (0.4 s) comes before its first click (2.5.1), so that the
click is heard even when the way out to the ears wakes up a little late (Bluetooth
earphones, a phone): otherwise the first click could be lost, and the count-in would seem to
end on the song's first downbeat. The volume, the metronome's own tempo, the beats (per meter) and *What to mute* are
kept in this browser, the same for every song. The rest is not: every song opens with the
metronome *Off*, the count-in *Auto* (2.20; before, 1 bar), *Count-in only* (2.7.1; *Whole song* from 2.5 to 2.7)
and the silent bars *Off* (when switched
on: *Clicks for* 4 *bars, then mute for* 2, *Random* off), whatever was set before (2.1.2: a
*Random* left on from an earlier session no longer silences bars unannounced). (The settings kept before 2.0
go back to *Mute metronome and tracks*, the new default.)

**Speed training**, the last group of the metronome's tab, under its own title: *On*/*Off*
(as the metronome's) and the *Passes per step* on the first row; *From*, *Up to* and *Step*
on the second. Switching it on sets the speed to the one it starts from (*From*, 70% to
start with, changed while it is on it sets the speed again), without a step to undo.
Then, with the loop on, the speed changes by its *Step* (5%) every so many passes of the
loop, *Up to* the speed set (100%), and says when it gets there: a hard passage comes up
to tempo, or a little over it, a little at a time, with no need to slow the whole song
first (2.19). A line under it says how it works, and another one asks for the loop while it
is off. Its settings are kept in this browser; it is off whenever a song opens. On the
computer its fields have no arrows (the keys and the number do), so that the tab keeps its
one band at 1280 px.

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
  the input, the date, and the tempo and key they were recorded at (the key with the fine
  tuning, in hundredths of a semitone, 2.18); `audio.tracks` gives
  their exact length, delay and padding as for the stems, and `practice` their volume
  and switch (keys `take-<id>`). A take pasted (2.11) has no input and gives the song
  it was copied from (`pasted_from`), and `bus: "drums"` when it comes from the drums
  (it plays with them, not transposed). EUTERIA (Python) ignores them.
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
- **The chords of the bars**: `music.chords` keys each bar with chords by its index
  (`"0"` is the first bar of the grid) and gives its slots (2.7): a text for each beat a
  chord may start on, four in 4/4, three in 3/4, two in 6/8, `""` where none starts, for
  example `"6": ["Dm7", "", "G7", ""]`. Before 2.7 a bar had one text (`"Dm7 G7"`); such
  a project opens with its chords spread over the bar (two on beats 1 and 3) and is saved
  with slots.
- **The clips** (2.10): `audio.clips` keys every track cut in EUTERIA Web (`"original"`,
  a stem, `"take-<id>"`) to its clips, in the order they were placed (2.15: they may
  overlap, the last one on top; before, they never did and were in the order they play):
  `from` and `to` (the part
  of the track's own audio, seconds), `at` (where `from` plays, seconds from the track's
  start: a take's Sync moves its clips with it; 2.23: it may be negative, a clip moved to a
  take placed before the take begins), `fade_in` and `fade_out` (seconds), and `src` for a
  clip moved from another track (2.23): the key of the track whose audio it plays, `from`
  and `to` being in that audio. A track whole is not listed; an empty list is a track that
  plays nothing. The audio members stay as they are.
- **Tracks kept as sources** (2.23): `practice.track_sources_only` lists the tracks
  deleted whose audio clips of other tracks still play. Their audio members and entries
  stay in the project; they open hidden, off, with no clips of their own.
- **Stems and the Original Track deleted** (2.13): a stem deleted with ✕, or left out by
  the separation as empty, is `null` in `audio.stems`; the Original Track deleted leaves
  `audio.original_member` `null`. Their audio members, their entries in `audio.tracks`
  and their volume and switch in `practice` go with them. A project without the Original
  Track opens with its stems on, unless `practice.track_enabled` says otherwise.
- **The order of the tracks**: `practice.stem_order` keeps the order of the six stems,
  as EUTERIA (Python) reads it; `practice.track_order`, written by EUTERIA Web, lists
  every track in its order, the Original Track and the takes too. A project without
  `track_order` opens with the Original Track first, the stems in the order of
  `stem_order`, then the takes.
- **The names given to the tracks** (2.15): `practice.track_names`, written by EUTERIA
  Web, maps a track's key to the name given to it (one line, up to 40 characters); a
  track not listed shows its own name.
- **The details of the chord chart** (2.16): `music.chart_credits`, written by EUTERIA Web,
  holds those given of `title` (only when it is not the project's name), `subtitle`,
  `composer`, `arranger`, `lyricist` and `copyright` (one line each, up to 120
  characters); without it the chart is titled with the project's name.
- **The recording** (3.0): `music.recording`, written by EUTERIA Web, holds those given of
  `performer`, `album` and `year` (one line each); without it, the tags of the Original
  Track's file give them, if it has any.

**The community** (3.3.0, `src/community.js`, `app/community-flow.js`). *Search the
community…*, in the group *Import* of *Song analysis*, and *Publish to the community…*, in the
group *Project* of *File export and sharing*, open one window with four views. Nothing of the
community is asked for before the window opens (no search when a song opens): then the SDK of
Firebase is loaded from Google's site (13.3.0: Firebase Authentication and the Lite SDK of Cloud
Firestore, some 400 KB, cross-origin modules that `sw.js` leaves alone). *Search*: the title and
the performer of the song (*Song*, in *File export and sharing*) searched at once, the words free
to change. Each record holds the words of its title and performer (lower case, no accents, no
brackets, no featured artist, no track number, no little words: `wordsOf()`), and a search reads
those holding the longest word typed (at most 50), then keeps those holding them all, the same
title and performer first, then those of about the same length as the song (within 3 s), then
the most liked, then the newest. Each analysis shows its song and recording, its length beside
the song's, as on the record or an arrangement, who published it (the public name) and when,
its likes and what its author says of it; *Import* pastes it onto the song's bars (as *Analysis
from a file*, its arrows too), ♡ likes it, *Report* sends a reason and a word, *Delete* (one's
own) removes it after asking. *Publish*: off without bars or without the performer (the tooltip
says which); the song, what it holds (bars, sections, chords), as on the record or *My own
arrangement*, a description, the public name (the one used last, or the account's); what goes
online is the analysis as *Share analysis* makes it (never audio, never the notes) with the
details of the song. The same song published again by its author, of the same kind, updates it
(*Update*, with the date it was published). *Sign in*: with Google (its window opens straight
from the click, the SDK being loaded as the view opens), or an email and a password: a new
account gets a link to check its address (*I opened the link* reads the account again), needed
to publish; *Forgot the password?* sends a link to choose a new one. Searching and importing need
no account. *Account*: who is signed in, *Sign out*, *Delete the account* (with what it
published; Firebase deletes only an account signed in a few minutes before, otherwise the window
says to sign in again first). Errors are said in words (no connection, the free quota of the day
used up, a refusal of the rules, a wrong password, Google's window blocked).

The data, in Cloud Firestore: `analyses/{id}` `{v, title, performer, album, year, words,
titleKey, duration, bpm, meter, kind ("record" or "arrangement"), note, analysis (the
`.euteria-analysis` as JSON text), owner, ownerName, created, updated, likes}`,
`analyses/{id}/likes/{uid}`, `reports/{id}` `{analysis, by, reason, at}` and `users/{uid}`
`{name, lastPublish}`. The rules (`firestore.rules`, pasted in the console of Firebase): anyone
reads the analyses; only someone signed in with an address checked (a Google account always is)
writes, and only their own; every field checked (sizes, kinds); a new analysis at most a minute
after the previous one (the user's `lastPublish`, written in the same batch); a like at most per
person, its count moved by one with the like itself; reports written by whoever is signed in and
read only in the console, where the owner of the project deletes what must go. The web settings
of Firebase in `src/community.js` are public by design: the rules guard the data. The free plan
(Spark) is enough: 50,000 reads and 20,000 writes a day. The tests stand a fake driver in for
Firebase, whose servers they cannot reach, and load the real SDK from its npm copy to check that
the Firebase driver starts.

**The analysis file** (3.1, `.euteria-analysis`) is JSON: `format` (`"euteria-analysis"`),
`version` (1), `app`, `created`, `details` (those given of the details of the song, the
title always), `duration` (seconds), `music` (as `manifest.music` has them: `bpm`,
`time_signature`, `first_beat`, `beats`, `bars`, `bar_number_offset`, `chords`,
`sections`; never `notes`). A file of 3.1 also has a `fingerprint` of the recording,
left unread since 3.2. A file of a newer version is refused, with the advice to update
the app.
- **The fine tuning** (2.18): `practice.transpose_cents`, written by EUTERIA Web when the
  song is moved by some cents (−50 to 50, on top of the key of `transpose_semitones`);
  without it, none. The song's own tuning, measured, is not saved: it is measured again.

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
EUTERIA (Python). A track cut in clips (`src/clips.js`) is mixed part by part, each from
where it is placed, with its fades (a raised cosine), and with 4 ms at each edge that cuts
the sound (a part moved from another track, 2.23, reads that track's audio and goes
through that audio's bus); a part that goes on from the one before, as a cut leaves it, has no fade
(checked offline, rendered with the engine: silence where a part is left out, a fade half
way at half the level, no dip at a cut). Copy (2.11) asks the audio thread for the
audio of the clips (a copy, about ten seconds a message, the track playing on) and makes
of them one piece as the engine plays them (`bake()` in `src/clips.js`). During playback the sum goes through a limiter: where it would go over
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
output time before the song starts: the clicks of the bars before the downbeat it ends on
(`Player._countStart()`: the first downbeat of the clicks from half a beat before where the
song comes in), with the beats as set, the song silent up to the start point, then the song
on time with them, the clicks still to come going on over it up to that downbeat (with the
metronome off too, checked offline: a pickup on beat 4 with the fourth click, within 4 ms),
after 0.4 s of silence (the clicks of the grid before the count-in's first beat left out);
a take recorded with it begins where playback starts. The start point of a count-in that
begins before the song's sound is moved to 50 ms before it (`Player.firstSound()`: the first
three consecutive 5 ms envelope buckets above 4% of the 99th percentile of the tracks, takes
left out), and the count-in ends on the downbeat of the bar the sound is in, which the clicks
of the grid, two bars of them before the song, lead into. A silent bar that takes the tracks fades them out over
6 ms, ending 10 ms before its bar line (the engine knows the bar coming), so that its
first beat is silent too, and back in the same way, so that the first beat after it is
whole. The engine counts the passes of the loop, for the speed trainer. While a take is
recorded it plays on past the end of the song (silence, and the clicks), and it measures
the level of what plays before the clicks are added, so that the take's level follows
the song, not the metronome; the song lasts as long as its longest track, takes
included, or the length an empty project was given.

**The fine tuning** (2.18) is not left to Signalsmith's transposition, which moves each
partial by a step worked out from the peak of the spectrum around it: for steps of a few
cents that is a few cents wrong, and differently for each partial (measured: a tone of
220 Hz moved by −23 cents came out −15, −23 and −21 cents in its first three partials, a
tune once in tune no longer quite in tune with itself). The pitched bus is read through a
resampler instead (`_vs…` in `src/engine-core.js`: a windowed sinc of 24 taps, Kaiser,
tabulated at 256 fractions of a sample), a little faster or slower along the playback path,
so that every partial moves by exactly as much, and its stretcher makes up the time; the
whole semitones stay with the stretcher. Each block the pitched bus takes as many song
samples as the drums, so the two keep together. Signalsmith also takes the frame before as
the one an interval earlier when the input moved by an interval give or take a sample
(`reanalysePrev`): with a time ratio that near 1 the pitch follows the time, as on tape,
and a correction of a cent or two at 100% was lost. Within 3 samples an interval of 1 the
song moves at the resampler's own step, as a tape does, a hair off the tempo asked (0.2% at
most: 1 cent down at 100% plays at 99.94%), and the pitched stretcher keeps time exactly as
it is. Checked offline, rendered with the engine: every partial within 0.05 cents of the
cents asked, at 50% to 150% and near a ratio of 1; the clicks of the two buses within a
millisecond of each other, round the loop too; a tone as loud, the highs of noise kept; a
change of the cents while it plays without a jump. Without a fine tuning the pitched bus
is read as before.

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
2024, MIT License). A computer with Chrome or Edge and WebGPU runs its `final0` model
converted to ONNX with a fixed window of 1500 frames (`musetric/beat-this-onnx`, about
191 MB, downloaded from Hugging Face the first time and kept in the browser's private
storage, as the separation model; it is not part of this repository), on the graphics card.
The graphics card is asked for when a detection first starts, as for the separation; where
WebGPU finds none it can use, or only its software stand-in, the computer runs the small
model, as the other browsers do: its `small0` model (2.1 million parameters,
about 10 MB, in `models/beat-this`, with where it comes from and the fix it needed) on the
CPU with the WebAssembly build of ONNX Runtime Web (`ort.wasm.min.mjs`, half the download of
the WebGPU one), in the same windows of 1500 frames; its beats count from a logit of −1.

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
- a beat (or downbeat) is a frame whose logit is above 0 (a beat of the small model: −1)
  and the highest within 3 frames, adjacent ones merged; each downbeat moves to the
  nearest beat.

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
outputs (an onset detector) on songs of known tempo, meter and first downbeat; the full
model itself was not reachable from the test machine. The small model was run for real, on
the CPU as a computer without WebGPU runs it: a band at 96 BPM, clicks at 120 and 100 BPM and a waltz of clicks
at 93.5 BPM each got the right tempo, meter and first downbeat (the figures are in
`models/beat-this/README.md`); a synthetic swing at 140 and 200 BPM the right tempo with the
first downbeat two beats off; a synthetic slow swing ballad (70 BPM) a wrong tempo, 228 BPM.

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
  it cannot, and wherever the tempo runs on the small model), the probability of each
  chord per frame; checked in the browser against the
  same chain in Python to 2e-6.

`src/chords.js` keeps them as segments: the probabilities averaged over 5 frames (half
a second), the most likely chord of each frame, frames in a row with the same chord
joined. In the bars (2.7), the chords are put on the beats a chord may start on (four in
4/4, three in 3/4, two in 6/8) and weighed by family (a root and its triad: C, C6, Cmaj7
and C7 are one family; Cm, Cm6, Cm7 and Cm(maj7) another), as BTC shares its belief among
them. Each bar is cut into runs of whole beats, each given the family that covers most of
it, the cut that fits best once each change of chord has paid its cost (a small dynamic
programme over the beats): 0.6 beats of evidence on beat 3 of 4/4 (0.3 on beat 4 of 6/8,
the half of a bar), 0.8 on the other beats (0.7 on beat 3 of 3/4), so that a chord
changes on a weak beat only when the new one clearly covers it. A run shorter than the
bar must be clear (its family over 60% of it, BTC's mean probability of it at least 0.3),
a whole bar needs a family over 40% of it; each run's chord is written on the beat where
it starts, as the chord of its family BTC is surest of. BTC finds a change about a tenth
of a second early (its frames hear what comes): the segments are read 0.08 s later. The
names are spelled in the key of the song, estimated from all its chords
(`src/chordnames.js`). On synthesised songs with changes on every beat (80, 120 and 160
BPM, the real model in the browser), 74 of 78 chords landed on the right beat with the
right root, none on a wrong beat; the misses were chords lasting one beat.

Tested in the browser on synthesised chord sequences with the real model; the tempo
model there was the stand-in. BTC was trained on pop and rock songs: it finds roots
and major or minor well, sevenths and the rarer chords less often.

## How the tuning is measured

`src/tuning.js` (2.18) finds how far the notes of a song lie from those of the equal
temperament with A at 440 Hz. It listens to the stems that are not the drums, or else to
the Original Track (never to the takes): the whole song up to 96 seconds, a longer one in
twelve excerpts of 8 seconds spread over it, copied from the audio thread four seconds at
a time while the song plays on. In frames of about 0.19 s (8192 samples at 44.1 kHz, a
Hann window, each half over the one before; quiet frames left out) it takes the peaks of
the spectrum between 80 Hz and 2 kHz within 40 dB of the strongest, and refines the
frequency of each with a parabola through the log magnitudes of its bin and of the two
beside it (less the small bias a Hann window gives the parabola). Each peak's distance from
the nearest note, in cents, goes into a histogram of tenths of a cent that wraps around (a
note 50 cents sharp is the next one 50 cents flat), weighted by the peak's strength against
the frame's strongest. The highest point of the histogram, smoothed over 6 cents, is the
tuning, refined by the mean of the distances within 10 cents of it (again from the mean
found, five times). The overtones of a note in tune are in tune too, but for the 5th and
the 7th (14 and 31 cents flat), which make smaller bumps out of the way. The confidence is
the share of the weight near the tuning, against what an even spread would put there:
drums and noise spread their peaks evenly; under 0.12 there is no tuning to give (white
noise gives about 0.01), under 0.3 it is *about*. Checked offline: notes made out of tune
on purpose (chords, vibrato, inharmonic overtones, noise, drums) found within 0.6 cents;
eight recordings moved by known amounts (resampled) followed within 0.8 cents; about a
quarter of a second of work for two minutes of music on a computer.

## Visit counter

`index.html` loads the counter of GoatCounter (`euteria.goatcounter.com`), which counts
page loads without cookies and without personal data. The app also counts, as events
with a name only, what is done with it (`app/counter.js`): `song-opened-audio` and
`song-opened-project`, `separation-done`, `separation-stopped` and `separation-failed`,
`mp3-exported`, `take-recorded`, `tracks-pasted`, `project-shared` and `project-downloaded`. They appear
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
takes were recorded or deleted, or stems or the Original Track deleted; it never reads
the audio into memory to write it. In place (the
library, or a file Chrome and Edge may write), the new manifest and a new zip directory
replace the end of the file, a few kilobytes: the manifest saved before as well when it
is the last member, so that saving again and again does not make the file grow (the
first time, the manifest written by EUTERIA (Python) at the start of the file stays
there, unlisted). A copy, or a song whose takes changed, is assembled by the browser
from slices of the file (and the MP3 files of the new takes) as it is written, so the
file shrinks again when a take, a stem or the Original Track is deleted. The file written is read back before the app
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

Undo and redo (`app/history.js`) see the song as a state: the grid (an object that every
edit replaces, never changes), the analysis, the name, the tracks (keys, on, volume,
*Sync*), tempo, key, loop, the metronome and the speed training. A step is the state before
it and the names of what it changed; the step is made once the action is over, at the end
of the event that made it and not before a press of the pointer is let go, and changes of
the same continuous value less than 0.9 s apart make one step. Undo puts back only what
the step changed, so what changed by itself since (the speed training) stays; what follows
on the page in the next two frames is taken in, not a step. A take out of the song (deleted,
or its recording undone) keeps its audio: the audio thread gives it back, as for the
export, and it waits in `player.stash` while a step can bring it back; the steps that
nobody can reach any more let go of it. A *Save* tells every state kept whether it differs
from what is saved now, so that each says rightly whether there are changes to save once
it is back; a take of the file that a *Save* took out of it is encoded again from that
audio when it comes back. A stem or the Original Track deleted waits in `player.stash` the
same way; before a *Save* takes it out of the file, the bytes of its MP3 are read from the
file and kept (`app.baseFiles`), and they go back in as they were if it comes back.

## Repository layout

- `index.html`, `app/`: the app (page, styles, `app.js`, the timeline in `timeline.js`,
  the editor of the grid and the chords in `editor.js`, undo and redo in `history.js`,
  the tabs of the song's tools (the ribbon) in `ribbon.js`
  (the clips of the tracks are edited in `timeline.js` and `app.js`),
  the separation in `separate.js`,
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
  (`grid.js`), the clips of the tracks (`clips.js`), chord names read and transposed (`chordnames.js`), the chord chart in
  MusicXML (`musicxml.js`), what an audio file says of itself in its tags (`tags.js`), the analysis shared on its own, pasted onto the song's bars and moved by the arrows (`shared.js`), the tuning of a song measured (`tuning.js`), the metronome's
  settings and clicks (`metronome.js`), waveform envelopes (`peaks.js`), the recording of takes (`recorder.js`)
  and their level (`level.js`),
  the separation (`separation.js`, `separate-worker.js`, `stft.js`, `resample.js`,
  `onnx-rewrite.js`; the stems left empty found by `silence.js`), the tempo and chord detection (`beats.js`, `beats-worker.js`,
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
  on every device, saved in the project (version 0.5, online, being tested). Step 3: the
  chords beat by beat (2.7), the chord chart exported for MuseScore (MusicXML, 2.8; its
  title, composer and other details, 2.16), undo and redo (2.9), cutting, moving and fading
  the tracks on a computer (2.10; several clips together, on several tracks, 2.17; from one
  track to another, 2.23), copying
  and pasting them from one project to another (2.11), the fine tuning in cents, with the
  song's own tuning measured (2.18).
- **Phase 3** (version 3): a repository shared by the community, of the analyses of songs
  (bars, sections, chords; never audio), on Firebase. Step 1: the details of the song and
  of its recording, read from the tags of its file (3.0). Step 2: the analysis exported
  and imported on its own (3.1), pasted onto the song's own bars and moved by its arrows,
  and an audio file imported as a project at once (3.2). Step 3: the community (3.3):
  searching it (only when asked), importing, publishing (open to everyone, with a sign-in:
  Google, or email and password), as on the record or as an arrangement; likes and reports.
  Then band features.

## Licence

Copyright (c) 2026 Pierangelo Gobbo. All rights reserved. No licence is granted:
using, copying or modifying this software requires the written permission of the
copyright holder. See [LICENSE](LICENSE). Third-party components keep their own
licences, listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
