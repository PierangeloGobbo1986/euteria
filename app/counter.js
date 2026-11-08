// The visit counter (GoatCounter, loaded by index.html). Besides the page
// loads, it counts what is done with EUTERIA as events that carry a name
// only, nothing about the song or the person. A device can be left out of
// the count, so that its owner's own use does not add to the numbers: five
// taps on the version number switch it, as #toggle-goatcounter at the end of
// the address does in a browser (GoatCounter's own switch, kept in this
// browser's storage).

const SKIP = "skipgc"; // GoatCounter's switch: "t", this device is not counted

const TITLES = {
  "song-opened-audio": "Audio file opened",
  "song-opened-project": "Project opened",
  "separation-done": "Separation done",
  "separation-stopped": "Separation stopped",
  "separation-failed": "Separation failed",
  "mp3-exported": "MP3 exported",
  "take-recorded": "Take recorded",
  "project-shared": "Project shared",
  "project-downloaded": "Project downloaded",
};

// Counts one event (a name of TITLES). Nothing happens if the counter could
// not be loaded (offline, or blocked by the browser or an extension).
export function countEvent(name) {
  try {
    const gc = window.goatcounter;
    if (gc && typeof gc.count === "function") gc.count({ path: name, title: TITLES[name] || name, event: true });
  } catch (_) {}
}

export function counted() {
  try {
    return localStorage.getItem(SKIP) !== "t";
  } catch (_) {
    return true;
  }
}

// Leaves this device out of the count, or counts it again. Returns whether
// it is counted now.
export function toggleCounting() {
  try {
    if (localStorage.getItem(SKIP) === "t") localStorage.removeItem(SKIP);
    else localStorage.setItem(SKIP, "t");
  } catch (_) {}
  return counted();
}
