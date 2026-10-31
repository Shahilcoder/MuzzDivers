// =============================================================================
// WaveformView.js — the drag-to-paint waveform widget.
//
// Drawn in Phaser, not the DOM. index.html sets `touch-action: none` globally so
// that both thumbs feed the joysticks without the browser hijacking the gesture
// as a scroll — which also means no DOM overlay (and so no <canvas> waveform
// library) can receive a drag. Everything here is Graphics on the game canvas,
// hit-tested by hand, in the same style as VirtualJoystick.
//
// Three stacked zones, top to bottom:
//
//     ┌──────────────────────────────────────┐
//     │ 0:00      0:30      1:00      1:30   │  ruler    (labels only)
//     ├──────────────────────────────────────┤
//     │  ╷╷ ╷▐▌╷╷  ▐████▌  ╷╷╷ ▐███▌  ╷╷    │  waveform (PAINT regions)
//     ├──────────────────────────────────────┤
//     │ ████████████●                        │  scrub    (SEEK only)
//     └──────────────────────────────────────┘
//
// Gesture separation is by ZONE, not by mode. The waveform body only ever
// creates and edits regions; the strip below it only ever seeks. There is no
// long-press, no modifier, and no slop threshold deciding "was that a scrub or a
// paint?" — which is the failure everyone has hit in a mobile audio editor.
//
// Rendering is split across three Graphics objects on purpose:
//   waveG   — the silhouette + ruler. ~1100 fillRects. Redrawn only on layout.
//   regionG — the windows. Redrawn when they change.
//   headG   — the playhead. Redrawn EVERY FRAME during preview.
// Sharing one would re-tessellate the whole waveform 60 times a second.
// =============================================================================

import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import {
  findEdgeAt,
  findWindowIndexAt,
  formatDuration,
  normalizeWindows,
} from './SuperWindows.js';

const RULER_HEIGHT = 26;
const GAP = 8;
const MAX_RULER_LABELS = 14;
// Candidate spacings, in seconds, for the ruler ticks. The first one that keeps
// the label count sane wins.
const TICK_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300];

export default class WaveformView {
  // rect: { x, y, width } — height is derived from CONFIG.tracks.editor.
  constructor(scene, rect, depth = 20) {
    this.scene = scene;
    this.ed = CONFIG.tracks.editor;

    this.x = rect.x;
    this.y = rect.y;
    this.width = rect.width;

    this.duration = 0;
    this.peaks = null;
    this.windows = [];
    this.selectedIndex = -1;
    this.playhead = 0;

    // Drag state. dragMode is null | 'create' | 'resize'.
    this.dragMode = null;
    this.dragPointerId = null;
    this.dragIndex = -1;
    this.dragEdge = null;
    this.anchorTime = 0;
    // Which pointer, if any, is currently scrubbing the strip.
    this.seekPointerId = null;

    // Consumer hooks — assigned by the owning scene.
    this.onWindowsChanged = null;
    this.onSelectionChanged = null;
    this.onSeek = null;

    this.waveG = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    this.regionG = scene.add.graphics().setScrollFactor(0).setDepth(depth + 1);
    this.headG = scene.add.graphics().setScrollFactor(0).setDepth(depth + 2);

    // Pool the ruler labels: they are repositioned on layout change, never
    // created per redraw.
    this.rulerLabels = [];
    for (let i = 0; i < MAX_RULER_LABELS; i += 1) {
      this.rulerLabels.push(
        scene.add
          .text(0, 0, '', {
            fontFamily: 'monospace',
            fontSize: '14px',
            color: this.ed.rulerTextColor,
          })
          .setOrigin(0, 0)
          .setScrollFactor(0)
          .setDepth(depth + 1)
          .setVisible(false)
      );
    }

    this.destroyed = false;
    this.registerInput();
  }

  // --- Geometry --------------------------------------------------------------

  get waveTop() {
    return this.y + RULER_HEIGHT;
  }

  get waveHeight() {
    return this.ed.waveformHeight;
  }

  get waveBottom() {
    return this.waveTop + this.waveHeight;
  }

  get scrubTop() {
    return this.waveBottom + GAP;
  }

  get scrubHeight() {
    return this.ed.scrubHeight;
  }

  // Total vertical space the widget occupies, so the scene can lay out beneath.
  get height() {
    return RULER_HEIGHT + this.waveHeight + GAP + this.scrubHeight;
  }

  timeToX(t) {
    if (!this.duration) return this.x;
    return this.x + Phaser.Math.Clamp(t / this.duration, 0, 1) * this.width;
  }

  xToTime(px) {
    if (!this.duration) return 0;
    return Phaser.Math.Clamp((px - this.x) / this.width, 0, 1) * this.duration;
  }

  // The grab tolerance is defined in PIXELS (a thumb is a fixed physical size)
  // but edges live in SECONDS, so it has to be converted per track — 48px is a
  // 2-second tolerance on a 45s clip and a 0.4-second one on a 10-minute set.
  get grabToleranceSec() {
    if (!this.duration || !this.width) return 0;
    return (this.ed.handleGrabPx / this.width) * this.duration;
  }

  inWaveBody(px, py) {
    return (
      px >= this.x &&
      px <= this.x + this.width &&
      py >= this.waveTop &&
      py <= this.waveBottom
    );
  }

  inScrubStrip(px, py) {
    return (
      px >= this.x &&
      px <= this.x + this.width &&
      py >= this.scrubTop &&
      py <= this.scrubTop + this.scrubHeight
    );
  }

  // --- Data ------------------------------------------------------------------

  setTrack({ peaks, duration, windows }) {
    this.peaks = peaks;
    this.duration = duration || 0;
    this.windows = (windows ?? []).map((w) => ({ ...w }));
    this.selectedIndex = -1;
    this.playhead = 0;
    this.drawWave();
    this.drawRegions();
    this.drawPlayhead();
  }

  setLayout({ x, y, width }) {
    this.x = x ?? this.x;
    this.y = y ?? this.y;
    this.width = width ?? this.width;
    this.drawWave();
    this.drawRegions();
    this.drawPlayhead();
  }

  // Replace the region list from outside (nudge buttons, delete). Runs the same
  // commit rules a drag-release does, then re-finds the selection by TIME —
  // array indices are meaningless across a merge.
  applyWindows(next, anchorTime = null) {
    this.windows = normalizeWindows(next, this.duration);
    const anchor = anchorTime ?? this.selectedAnchor();
    this.selectedIndex =
      anchor === null ? -1 : findWindowIndexAt(this.windows, anchor);
    this.drawRegions();
    this.onWindowsChanged?.(this.windows);
    this.onSelectionChanged?.(this.selectedIndex);
  }

  getSelected() {
    return this.windows[this.selectedIndex] ?? null;
  }

  // Midpoint of the selected region — a stable handle for "the thing the player
  // was working on" that survives both edges moving.
  selectedAnchor() {
    const w = this.getSelected();
    return w ? (w.start + w.end) / 2 : null;
  }

  select(index) {
    if (index === this.selectedIndex) return;
    this.selectedIndex = index;
    this.drawRegions();
    this.onSelectionChanged?.(index);
  }

  setPlayhead(seconds) {
    this.playhead = seconds;
    this.drawPlayhead();
  }

  // --- Input -----------------------------------------------------------------

  registerInput() {
    const input = this.scene.input;

    this.onDown = (pointer) => {
      if (this.destroyed || !this.duration) return;

      if (this.inScrubStrip(pointer.x, pointer.y)) {
        this.seekPointerId = pointer.id;
        this.onSeek?.(this.xToTime(pointer.x));
        return;
      }

      if (!this.inWaveBody(pointer.x, pointer.y)) return;
      if (this.dragMode !== null) return; // another finger already painting

      const t = this.xToTime(pointer.x);

      // Resolution order: edge, then interior, then empty space. Checking the
      // edge FIRST is what makes a region resizable at all — its edges are also
      // "inside" it, so the interior test would otherwise always win.
      const edge = findEdgeAt(this.windows, t, this.grabToleranceSec);
      if (edge) {
        this.dragMode = 'resize';
        this.dragPointerId = pointer.id;
        this.dragIndex = edge.index;
        this.dragEdge = edge.edge;
        this.select(edge.index);
        return;
      }

      const hit = findWindowIndexAt(this.windows, t);
      if (hit !== -1) {
        // Tap inside = select, not drag-to-move. Moving a whole region adds a
        // fourth meaning to the same gesture for very little gain: the nudge
        // buttons already reposition an edge precisely.
        this.select(hit);
        return;
      }

      this.dragMode = 'create';
      this.dragPointerId = pointer.id;
      this.anchorTime = t;
      this.windows.push({ start: t, end: t });
      this.dragIndex = this.windows.length - 1;
      this.select(this.dragIndex);
    };

    this.onMove = (pointer) => {
      if (this.destroyed) return;

      if (pointer.id === this.seekPointerId) {
        this.onSeek?.(this.xToTime(pointer.x));
        return;
      }

      if (this.dragMode === null || pointer.id !== this.dragPointerId) return;

      const t = this.xToTime(pointer.x);

      if (this.dragMode === 'create') {
        // Anchored at press, so dragging leftward is just as valid as right.
        const w = this.windows[this.dragIndex];
        w.start = Math.min(this.anchorTime, t);
        w.end = Math.max(this.anchorTime, t);
      } else {
        // Raw during the drag — the edge is allowed to cross its partner and
        // run off the ends. normalizeWindows sorts that out on release, which
        // is why the live shape can stay dumb.
        this.windows[this.dragIndex][this.dragEdge] = t;
      }

      this.drawRegions();
      this.onSelectionChanged?.(this.selectedIndex);
    };

    this.onRelease = (pointer) => {
      if (this.destroyed) return;

      if (pointer.id === this.seekPointerId) {
        this.seekPointerId = null;
        return;
      }

      if (this.dragMode === null || pointer.id !== this.dragPointerId) return;

      const dragged = this.windows[this.dragIndex];
      // Capture the anchor BEFORE committing: the commit may merge this region
      // into a neighbour or discard it, and either way dragIndex stops meaning
      // anything. A midpoint still lands inside the merged result.
      const anchor = dragged ? (dragged.start + dragged.end) / 2 : null;

      this.dragMode = null;
      this.dragPointerId = null;
      this.dragIndex = -1;
      this.dragEdge = null;

      this.applyWindows(this.windows, anchor);
    };

    // TouchCancel (system UI steals the gesture — the file picker, an iOS
    // notification, a swipe-back). treat it as a release: the half-painted
    // create region is committed, and normalizeWindows drops anything under
    // minWindowSec, so a cancelled stub costs the player nothing. Without this
    // dragMode/seekPointerId stay stuck and every later touch is ignored.
    input.on('pointercancel', this.onRelease);

    input.on('pointerdown', this.onDown);
    input.on('pointermove', this.onMove);
    input.on('pointerup', this.onRelease);
    input.on('pointerupoutside', this.onRelease);
  }

  // --- Drawing ---------------------------------------------------------------

  // The expensive one: ruler + background + silhouette. Only on layout change.
  drawWave() {
    const g = this.waveG;
    g.clear();

    // Panel background — darker than the scene so the waveform reads as a
    // distinct surface you can draw on.
    g.fillStyle(0x0b1120, 1);
    g.fillRect(this.x, this.y, this.width, RULER_HEIGHT + this.waveHeight);
    g.lineStyle(1, 0x1e293b, 1);
    g.strokeRect(this.x, this.y, this.width, RULER_HEIGHT + this.waveHeight);

    this.drawRuler();

    // Scrub strip track.
    g.fillStyle(this.ed.scrubTrack, 1);
    g.fillRoundedRect(this.x, this.scrubTop, this.width, this.scrubHeight, 6);

    if (!this.peaks || !this.duration) return;

    const cy = this.waveTop + this.waveHeight / 2;
    const maxH = this.waveHeight / 2 - 6;
    const columns = Math.max(1, Math.floor(this.width));
    const bucketsPerColumn = this.peaks.length / columns;

    // Centerline, so a quiet passage still shows something.
    g.fillStyle(this.ed.waveColor, 0.4);
    g.fillRect(this.x, cy, this.width, 1);

    g.fillStyle(this.ed.waveColor, 1);
    for (let col = 0; col < columns; col += 1) {
      const from = Math.floor(col * bucketsPerColumn);
      const to = Math.min(this.peaks.length, Math.ceil((col + 1) * bucketsPerColumn));

      // Peak (not average) across the column: averaging washes out exactly the
      // transients the player is trying to aim a window at.
      let peak = 0;
      for (let i = from; i < to; i += 1) {
        if (this.peaks[i] > peak) peak = this.peaks[i];
      }

      const h = (peak / 255) * maxH;
      if (h < 0.5) continue;
      g.fillRect(this.x + col, cy - h, 1, h * 2);
    }
  }

  drawRuler() {
    const g = this.waveG;

    // Pick the coarsest spacing that still gives a readable number of labels.
    const step =
      TICK_STEPS.find((s) => this.duration / s <= MAX_RULER_LABELS - 1) ??
      TICK_STEPS[TICK_STEPS.length - 1];

    let label = 0;
    for (let t = 0; t <= this.duration && label < MAX_RULER_LABELS; t += step) {
      const px = Math.round(this.timeToX(t));

      g.fillStyle(this.ed.rulerColor, 1);
      g.fillRect(px, this.y + RULER_HEIGHT - 7, 1, 7);
      // A faint gridline down through the waveform helps line an edge up with
      // a beat you can count.
      g.fillStyle(this.ed.rulerColor, 0.25);
      g.fillRect(px, this.waveTop, 1, this.waveHeight);

      const text = this.rulerLabels[label];
      text
        .setText(formatDuration(t))
        .setPosition(Math.min(px + 3, this.x + this.width - 34), this.y + 4)
        .setVisible(true);
      label += 1;
    }

    for (let i = label; i < this.rulerLabels.length; i += 1) {
      this.rulerLabels[i].setVisible(false);
    }
  }

  // Cheap: at most a handful of regions.
  drawRegions() {
    const g = this.regionG;
    g.clear();
    if (!this.duration) return;

    this.windows.forEach((w, i) => {
      // Draw from the sorted extents so a mid-drag inverted edge still renders
      // as a rectangle rather than vanishing.
      const a = this.timeToX(Math.min(w.start, w.end));
      const b = this.timeToX(Math.max(w.start, w.end));
      const width = Math.max(1, b - a);
      const selected = i === this.selectedIndex;

      g.fillStyle(
        selected ? this.ed.selectedFill : this.ed.regionFill,
        selected ? this.ed.selectedAlpha : this.ed.regionAlpha
      );
      g.fillRect(a, this.waveTop, width, this.waveHeight);

      g.lineStyle(selected ? 3 : 2, selected ? this.ed.selectedFill : this.ed.regionEdge, 1);
      g.strokeRect(a, this.waveTop, width, this.waveHeight);

      // Edge handles. Drawn narrow but grabbable from handleGrabPx away — the
      // visual is a hint, the hit area is generous, and pretending otherwise
      // would mean an unusably thin target on a phone.
      const pad = 5;
      g.fillStyle(selected ? this.ed.selectedFill : this.ed.regionEdge, 1);
      g.fillRect(a - pad / 2, this.waveTop, pad, this.waveHeight);
      g.fillRect(b - pad / 2, this.waveTop, pad, this.waveHeight);

      // Grip nubs, so it reads as draggable rather than as a border.
      g.fillRect(a - 9, this.waveTop + this.waveHeight / 2 - 12, 18, 3);
      g.fillRect(b - 9, this.waveTop + this.waveHeight / 2 - 12, 18, 3);

      // Mirror each region into the scrub strip, so the strip doubles as an
      // overview of where the drops are while you seek.
      g.fillStyle(this.ed.regionFill, 0.8);
      g.fillRect(a, this.scrubTop + this.scrubHeight - 8, width, 6);
    });
  }

  // Per-frame during preview. Kept to two fillRects and a triangle.
  drawPlayhead() {
    const g = this.headG;
    g.clear();
    if (!this.duration) return;

    const px = this.timeToX(this.playhead);

    g.fillStyle(this.ed.playhead, 1);
    g.fillRect(px - 1, this.waveTop, 2, this.waveHeight);
    // A downward pip at the top so the line is findable at a glance.
    g.fillTriangle(px - 7, this.waveTop, px + 7, this.waveTop, px, this.waveTop + 10);

    // Progress fill + knob in the scrub strip.
    const cy = this.scrubTop + this.scrubHeight / 2;
    g.fillStyle(this.ed.scrubFill, 0.5);
    g.fillRect(this.x, cy - 2, px - this.x, 4);
    g.fillStyle(this.ed.scrubFill, 1);
    g.fillCircle(px, cy, 10);
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    const input = this.scene.input;
    input.off('pointerdown', this.onDown);
    input.off('pointermove', this.onMove);
    input.off('pointerup', this.onRelease);
    input.off('pointerupoutside', this.onRelease);
    input.off('pointercancel', this.onRelease);

    this.waveG.destroy();
    this.regionG.destroy();
    this.headG.destroy();
    this.rulerLabels.forEach((t) => t.destroy());
  }
}
