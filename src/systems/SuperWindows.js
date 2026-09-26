// =============================================================================
// SuperWindows.js — pure region math for the super-mode windows.
//
// A "window" is { start, end } in seconds of playback time. GameScene asks once
// per frame whether the current playhead sits inside any of them; the waveform
// editor lets the player drag them into existence.
//
// This module is deliberately free of Phaser and of DOM: it is the logic most
// likely to be subtly wrong, and keeping it pure means every function here can
// be poked at directly from the browser console:
//
//     const SW = await import('/src/systems/SuperWindows.js');
//     SW.normalizeWindows([{start: 5, end: 3}, {start: 2.99, end: 4}], 100);
//
// Nothing in here mutates its arguments — every function returns fresh data.
// =============================================================================

import { CONFIG } from '../config.js';

// The gameplay predicate, and the reason this file exists. Mirrors
// GameScene.isInSuperWindow so the editor's preview highlight and the actual
// game agree by construction.
export function isInAnyWindow(windows, seconds) {
  return windows.some((w) => seconds >= w.start && seconds <= w.end);
}

// Force a window inside [0, duration] and make sure start <= end. A drag that
// began at 40s and ended at 12s arrives here as { start: 40, end: 12 }.
export function clampWindow(w, duration) {
  const a = Math.min(w.start, w.end);
  const b = Math.max(w.start, w.end);
  return {
    start: Math.max(0, Math.min(a, duration)),
    end: Math.max(0, Math.min(b, duration)),
  };
}

// Ascending by start time. Returns a new array.
export function sortWindows(windows) {
  return [...windows].sort((a, b) => a.start - b.start);
}

export function windowDuration(w) {
  return w.end - w.start;
}

// -----------------------------------------------------------------------------
// The commit rules for an authored region.
//
// Called on every pointer-up in the waveform, and after every nudge-button
// press, with the FULL list including whatever the player just dragged. What it
// returns is what the game runs on.
//
// Three rules, applied in a deliberate order:
//
//   1. Clamp   — drags routinely run off both ends of the waveform, and arrive
//                with start > end when dragged leftward.
//   2. Merge   — fuse windows that overlap or sit within mergeGapSec of each
//                other, because they are indistinguishable on screen.
//   3. Minimum — drop anything shorter than minWindowSec, which is almost
//                always a stray tap rather than an intent.
//
// @param  {{start:number,end:number}[]} windows  raw list, may be unsorted,
//                                                unclamped, overlapping
// @param  {number} duration  track length in seconds
// @return {{start:number,end:number}[]}  sorted, non-overlapping, all at least
//                                        minWindowSec long
// -----------------------------------------------------------------------------
export function normalizeWindows(windows, duration) {
  const { minWindowSec, mergeGapSec } = CONFIG.tracks.editor;

  if (!windows || windows.length === 0) return [];

  // Guard rather than clamp when the track length isn't known yet. Clamping to
  // [0, 0] would collapse every window to zero length, and step 3 would then
  // delete the player's entire authored list. Passing the list through
  // untouched is the only non-destructive answer to "normalize against what?".
  if (!Number.isFinite(duration) || duration <= 0) return windows;

  // 1. Clamp. Also drops any window with a non-finite edge: a NaN start would
  //    make every `seconds >= w.start` comparison false, so the window would be
  //    invisible to the game yet still occupy a row in the editor and a slot in
  //    storage — a ghost that can never fire and can never be seen to be wrong.
  const clamped = windows
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end))
    .map((w) => clampWindow(w, duration));

  // 2. Merge, BEFORE the minimum-length filter. This is the ordering decision.
  //
  //    Merging first means two adjacent 0.6s fragments become one valid 1.2s
  //    window instead of both being discarded as too short — a player who
  //    dragged twice side by side across a drop meant one region, and lifting a
  //    thumb mid-gesture shouldn't cost them the work.
  //
  //    The cost of this order: a stray zero-length tap landing within
  //    mergeGapSec of a real region is absorbed into it rather than discarded.
  //    That moves an edge by at most 0.05s, which is inaudible. The reverse
  //    order's cost — silently deleting a region the player can see themselves
  //    having drawn — is the one that produces a bug report.
  //
  //    Standard sweep: sorted by start, extend the run while the next window
  //    begins at or before the running end (plus the gap tolerance).
  const merged = [];
  for (const w of sortWindows(clamped)) {
    const last = merged[merged.length - 1];
    if (last && w.start <= last.end + mergeGapSec) {
      // max(), not just w.end: a short window fully contained inside a longer
      // one must not shorten it.
      last.end = Math.max(last.end, w.end);
    } else {
      merged.push({ ...w });
    }
  }

  // 3. Minimum length, on the merged result. An isolated stray tap has nothing
  //    to merge with and dies here.
  return merged.filter((w) => windowDuration(w) >= minWindowSec);
}

// Which region edge, if any, is within `tolSec` of `time`? Returns the closest
// match so overlapping tolerances near a short region resolve predictably.
// → { index, edge: 'start' | 'end' } or null
export function findEdgeAt(windows, time, tolSec) {
  let best = null;
  let bestDist = tolSec;

  windows.forEach((w, index) => {
    const dStart = Math.abs(w.start - time);
    if (dStart <= bestDist) {
      bestDist = dStart;
      best = { index, edge: 'start' };
    }
    const dEnd = Math.abs(w.end - time);
    if (dEnd <= bestDist) {
      bestDist = dEnd;
      best = { index, edge: 'end' };
    }
  });

  return best;
}

// Index of the region containing `time`, or -1. Used both for hit-testing a tap
// and for re-finding the selected region after a mutation may have merged or
// reordered the list (selection is tracked by time, not by array index).
export function findWindowIndexAt(windows, time) {
  return windows.findIndex((w) => time >= w.start && time <= w.end);
}

// Move one edge of one region by `delta` seconds. Returns the raw list — the
// caller passes it through normalizeWindows, so nudging one edge past its
// partner, or into a neighbour, resolves under the same rules as a drag.
export function nudgeEdge(windows, index, edge, delta) {
  return windows.map((w, i) =>
    i === index ? { ...w, [edge]: w[edge] + delta } : { ...w }
  );
}

export function removeWindow(windows, index) {
  return windows.filter((_, i) => i !== index);
}

// "2:07.4" — tenths matter, since a drop lands on a beat and the nudge buttons
// move in half seconds.
export function formatTime(seconds) {
  const s = Math.max(0, seconds || 0);
  const mins = Math.floor(s / 60);
  const rem = s - mins * 60;
  const whole = Math.floor(rem);
  const tenths = Math.floor((rem - whole) * 10);
  return `${mins}:${String(whole).padStart(2, '0')}.${tenths}`;
}

// "1:23" — for the track list, where tenths are noise.
export function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds || 0));
  const mins = Math.floor(s / 60);
  return `${mins}:${String(s % 60).padStart(2, '0')}`;
}
