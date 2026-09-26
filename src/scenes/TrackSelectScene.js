// =============================================================================
// TrackSelectScene — the new front door. Boot lands here instead of straight in
// the game, so a player can bring their own music.
//
// Row 0 is always the bundled track, playable in one tap, so the shortest path
// to playing the game got one tap longer and no more. Below it sit the uploaded
// tracks, each with its own authored super-mode windows.
//
// The list is PAGED rather than scrolled. index.html sets `touch-action: none`
// globally (so both thumbs reach the joysticks), which means there is no native
// scrolling to lean on — a scroll container would need a masked drag container
// plus tap-vs-drag disambiguation on every row, and getting that wrong turns
// "play this track" into "delete this track". PREV/NEXT cannot misfire.
// =============================================================================

import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import UiButton from '../systems/UiButton.js';
import { trackStore } from '../systems/TrackStore.js';
import { decodeToPeaks, durationFromCache } from '../systems/AudioPeaks.js';
import { defaultTrackDescriptor, ensureTrackAudio } from '../systems/trackSource.js';
import { formatDuration } from '../systems/SuperWindows.js';

// Monospace, so a character count is a reliable width.
function truncate(text, maxChars) {
  if (maxChars < 4 || text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1)}\u2026`;
}

const ROW_HEIGHT = 88;
const ROW_GAP = 10;
const LIST_TOP = 148;

export default class TrackSelectScene extends Phaser.Scene {
  constructor() {
    super('TrackSelectScene');
  }

  create() {
    // Async work (IndexedDB reads, decodes) can outlive the scene if the player
    // taps PLAY mid-load. Every continuation checks this first.
    this.alive = true;
    this.busy = false;

    this.page = 0;
    this.records = [];
    this.pendingDeleteId = null;
    // Row-scoped objects, destroyed and rebuilt wholesale by renderList().
    this.rowObjects = [];

    this.builtForWidth = this.scale.width;
    this.buildChrome();
    this.buildFileInput();

    this.events.once('shutdown', () => {
      this.alive = false;
      this.rowObjects.forEach((o) => o.destroy());
      this.staticButtons.forEach((b) => b.destroy());
      this.fileInput?.remove();
      this.scale.off('resize', this.onResize, this);
    });

    this.scale.on('resize', this.onResize, this);

    this.refresh();
  }

  // --- Layout helpers --------------------------------------------------------

  // A centered column, capped so the list doesn't stretch absurdly wide on a
  // desktop window while still filling a phone.
  get contentWidth() {
    return Math.min(this.scale.width - 80, 1060);
  }

  get contentLeft() {
    return (this.scale.width - this.contentWidth) / 2;
  }

  buildChrome() {
    const cx = this.scale.width / 2;

    this.titleText = this.add
      .text(cx, 40, 'CHOOSE A TRACK', {
        fontFamily: 'monospace',
        fontSize: '46px',
        color: '#22d3ee',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 0);

    this.hintText = this.add
      .text(cx, 96, 'Super mode fires during the windows you mark on a track.', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#94a3b8',
      })
      .setOrigin(0.5, 0);

    this.statusText = this.add
      .text(cx, this.scale.height - 52, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#fde047',
        align: 'center',
        wordWrap: { width: this.contentWidth },
      })
      .setOrigin(0.5, 0);

    const listBottom = LIST_TOP + CONFIG.tracks.listPageSize * (ROW_HEIGHT + ROW_GAP);
    const left = this.contentLeft;
    const right = left + this.contentWidth;

    this.prevBtn = new UiButton(this, {
      x: left,
      y: listBottom + 6,
      width: 130,
      height: 54,
      label: '< PREV',
      onTap: () => this.setPage(this.page - 1),
    });

    this.pageText = this.add
      .text(cx, listBottom + 22, '', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#64748b',
      })
      .setOrigin(0.5, 0);

    this.nextBtn = new UiButton(this, {
      x: right - 130,
      y: listBottom + 6,
      width: 130,
      height: 54,
      label: 'NEXT >',
      onTap: () => this.setPage(this.page + 1),
    });

    this.uploadBtn = new UiButton(this, {
      x: cx - 150,
      y: listBottom + 74,
      width: 300,
      height: 58,
      label: '+ UPLOAD TRACK',
      variant: 'primary',
      onTap: () => this.openFilePicker(),
    });

    this.staticButtons = [this.prevBtn, this.nextBtn, this.uploadBtn];
  }

  // The ONE piece of DOM this feature uses. There is no way to open a file
  // picker from a canvas.
  //
  // Two mobile-specific traps are worked around here, both of which look
  // identical to the player ("I can't pick my music") and neither of which
  // reproduces on a desktop browser:
  //
  //  1. `accept` must list EXTENSIONS, not just MIME types. iOS maps a bare
  //     `audio/*` to a narrow set of uniform type identifiers and greys out
  //     everything else in the Files app — including ordinary .mp3s. Android's
  //     document picker likewise matches some entries by extension, and files
  //     arriving from a download or a messaging app frequently report a MIME
  //     type of "" or application/octet-stream, which `audio/*` never matches.
  //     Listing both is what makes real files on a real phone selectable.
  //
  //  2. The input must NOT be `display: none`. Safari on iOS refuses to open a
  //     picker for a programmatic .click() on an element that isn't rendered.
  //     Positioning it off-screen keeps it in the layout (so the click lands)
  //     while keeping it invisible.
  //
  // Nothing downstream trusts the file's declared MIME type: decodeToPeaks
  // hands the bytes to decodeAudioData, which sniffs the actual container. A
  // file with an empty `type` still works.
  buildFileInput() {
    const el = document.createElement('input');
    el.type = 'file';
    el.accept = [
      'audio/*',
      '.mp3',
      '.m4a',
      '.aac',
      '.wav',
      '.ogg',
      '.oga',
      '.opus',
      '.flac',
      '.weba',
      '.webm',
      '.mp4',
    ].join(',');

    el.style.position = 'fixed';
    el.style.left = '-9999px';
    el.style.top = '0';
    el.style.width = '1px';
    el.style.height = '1px';
    el.style.opacity = '0';

    el.addEventListener('change', () => {
      const file = el.files?.[0];
      if (file) this.handleFile(file);
    });
    document.body.appendChild(el);
    this.fileInput = el;
  }

  openFilePicker() {
    if (this.busy) {
      this.setStatus('Still working on the last track — one moment.', '#f97316');
      return;
    }
    // Clearing value first: without it, re-picking the SAME file fires no
    // 'change' event and the upload silently does nothing.
    this.fileInput.value = '';
    this.fileInput.click();
  }

  onResize(gameSize) {
    if (!this.alive) return;
    // Every element here is positioned from this.scale.width, so the simplest
    // correct response is to throw the layout away and rebuild it — this scene
    // is static UI with no per-frame state. Guarded on the width actually
    // changing, because dragging a desktop window fires a burst of resize
    // events and restarting on each one would thrash.
    if (Math.round(gameSize.width) === Math.round(this.builtForWidth)) return;
    this.scene.restart();
  }

  setStatus(message, color = '#fde047') {
    if (!this.alive) return;
    this.statusText.setColor(color).setText(message);
  }

  // --- Data ------------------------------------------------------------------

  async refresh() {
    const records = await trackStore.list();
    if (!this.alive) return;

    this.records = records;

    if (trackStore.available === false) {
      this.setStatus(
        `${trackStore.unavailableReason} Uploads will work but won't survive a reload.`,
        '#f97316'
      );
    }

    this.renderList();
  }

  // The bundled track and the uploaded ones, as one uniform list so paging has
  // nothing to special-case. `record` is null for the default entry, which is
  // exactly what ensureTrackAudio() expects.
  entries() {
    return [
      {
        id: CONFIG.tracks.defaultId,
        name: defaultTrackDescriptor().name,
        duration: durationFromCache(this, CONFIG.music.key),
        windowCount: CONFIG.music.superWindows.length,
        isDefault: true,
        record: null,
      },
      ...this.records.map((r) => ({
        id: r.id,
        name: r.name,
        duration: r.duration,
        windowCount: r.windows?.length ?? 0,
        isDefault: false,
        record: r,
      })),
    ];
  }

  get pageCount() {
    return Math.max(1, Math.ceil(this.entries().length / CONFIG.tracks.listPageSize));
  }

  setPage(page) {
    const next = Phaser.Math.Clamp(page, 0, this.pageCount - 1);
    if (next === this.page) return;
    this.page = next;
    this.pendingDeleteId = null;
    this.renderList();
  }

  // --- Rendering -------------------------------------------------------------

  renderList() {
    this.rowObjects.forEach((o) => o.destroy());
    this.rowObjects = [];

    const all = this.entries();
    const size = CONFIG.tracks.listPageSize;
    const start = this.page * size;
    const pageEntries = all.slice(start, start + size);
    const selectedId = trackStore.getSelectedId();

    pageEntries.forEach((entry, i) => {
      this.renderRow(entry, LIST_TOP + i * (ROW_HEIGHT + ROW_GAP), entry.id === selectedId);
    });

    this.pageText.setText(
      this.pageCount > 1
        ? `PAGE ${this.page + 1} / ${this.pageCount}`
        : `${all.length} TRACK${all.length === 1 ? '' : 'S'}`
    );
    this.prevBtn.setEnabled(this.page > 0);
    this.nextBtn.setEnabled(this.page < this.pageCount - 1);
  }

  renderRow(entry, y, isSelected) {
    const left = this.contentLeft;
    const width = this.contentWidth;
    const keep = this.rowObjects;

    const panel = this.add.graphics().setDepth(4);
    panel.fillStyle(isSelected ? 0x1e3a5f : 0x1e293b, 1);
    panel.fillRoundedRect(left, y, width, ROW_HEIGHT, 10);
    panel.lineStyle(2, isSelected ? 0x22d3ee : 0x334155, 1);
    panel.strokeRoundedRect(left, y, width, ROW_HEIGHT, 10);
    keep.push(panel);

    // Long filenames are the norm ("01 - Artist - Title (Extended Mix).mp3").
    // Truncating the string beats clipping the texture: monospace means a
    // character budget is an exact pixel budget, and the ellipsis tells the
    // player the name is longer than what they can see.
    const nameBudget = Math.floor((width - 420) / 14); // 14px per char at 24px monospace
    keep.push(
      this.add
        .text(left + 18, y + 14, truncate(entry.name, nameBudget), {
          fontFamily: 'monospace',
          fontSize: '24px',
          color: '#e2e8f0',
        })
        .setDepth(5)
    );

    const meta = entry.isDefault
      ? `${formatDuration(entry.duration)}  ·  ${entry.windowCount} built-in windows  ·  not editable`
      : `${formatDuration(entry.duration)}  ·  ${entry.windowCount} super window${entry.windowCount === 1 ? '' : 's'}`;

    keep.push(
      this.add
        .text(left + 18, y + 50, meta, {
          fontFamily: 'monospace',
          fontSize: '16px',
          color: isSelected ? '#7dd3fc' : '#94a3b8',
        })
        .setDepth(5)
    );

    // --- Row actions, right-aligned ----------------------------------------
    const btnY = y + (ROW_HEIGHT - 54) / 2;
    let right = left + width - 16;
    const place = (w) => {
      right -= w;
      const x = right;
      right -= 10;
      return x;
    };

    // Inline confirmation: a delete that fires on first tap, in a list where
    // PLAY sits 10px away, is a data-loss bug waiting to happen.
    if (this.pendingDeleteId === entry.id) {
      keep.push(
        new UiButton(this, {
          x: place(130),
          y: btnY,
          width: 130,
          height: 54,
          label: 'CANCEL',
          depth: 6,
          onTap: () => {
            this.pendingDeleteId = null;
            this.renderList();
          },
        })
      );
      keep.push(
        new UiButton(this, {
          x: place(190),
          y: btnY,
          width: 190,
          height: 54,
          label: 'DELETE FOREVER',
          fontSize: '17px',
          variant: 'danger',
          depth: 6,
          onTap: () => this.deleteTrack(entry),
        })
      );
      return;
    }

    if (!entry.isDefault) {
      keep.push(
        new UiButton(this, {
          x: place(110),
          y: btnY,
          width: 110,
          height: 54,
          label: 'DELETE',
          fontSize: '18px',
          variant: 'danger',
          depth: 6,
          onTap: () => {
            this.pendingDeleteId = entry.id;
            this.renderList();
          },
        })
      );
      keep.push(
        new UiButton(this, {
          x: place(110),
          y: btnY,
          width: 110,
          height: 54,
          label: 'EDIT',
          fontSize: '18px',
          depth: 6,
          onTap: () => this.editTrack(entry),
        })
      );
    }

    keep.push(
      new UiButton(this, {
        x: place(120),
        y: btnY,
        width: 120,
        height: 54,
        label: 'PLAY',
        variant: 'accent',
        depth: 6,
        onTap: () => this.playEntry(entry),
      })
    );
  }

  // --- Actions ---------------------------------------------------------------

  async playEntry(entry) {
    if (this.busy) {
      this.setStatus('Still working on the last track — one moment.', '#f97316');
      return;
    }
    this.busy = true;
    this.setStatus('Loading track...', '#94a3b8');

    try {
      // Same hang guard as handleFile: if the loader never resolves (a hung
      // mobile decode), busy must come back or the scene freezes silently.
      const loadTimeout = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Loading took too long — try again.')),
          30000
        )
      );
      const descriptor = await Promise.race([
        ensureTrackAudio(this, entry.record),
        loadTimeout,
      ]);
      if (!this.alive) return;

      trackStore.setSelectedId(descriptor.id);
      // The registry is game-wide and survives scene.start(), which is what
      // makes RETRY after death replay the same track for free.
      this.registry.set('activeTrack', descriptor);
      this.scene.start('GameScene');
    } catch (err) {
      this.busy = false;
      this.setStatus(err.message ?? 'Could not load that track.', '#ef4444');
    }
  }

  editTrack(entry) {
    if (this.busy) {
      this.setStatus('Still working on the last track — one moment.', '#f97316');
      return;
    }
    this.scene.start('TrackEditorScene', { trackId: entry.id });
  }

  async deleteTrack(entry) {
    this.pendingDeleteId = null;
    try {
      await trackStore.remove(entry.id);
    } catch {
      this.setStatus('Could not delete that track.', '#ef4444');
      return;
    }
    if (!this.alive) return;

    // Deleting the selected track has to move the pointer, or the next launch
    // would try to play a record that no longer exists.
    if (trackStore.getSelectedId() === entry.id) {
      trackStore.setSelectedId(CONFIG.tracks.defaultId);
    }

    this.setStatus(`Deleted "${entry.name}".`, '#94a3b8');
    await this.refresh();
    if (!this.alive) return;
    this.setPage(Math.min(this.page, this.pageCount - 1));
  }

  async handleFile(file) {
    if (this.busy) return;
    this.busy = true;

    const maxBytes = CONFIG.tracks.maxFileMb * 1024 * 1024;
    if (file.size > maxBytes) {
      const mb = (file.size / (1024 * 1024)).toFixed(1);
      this.busy = false;
      this.setStatus(
        `"${file.name}" is ${mb} MB — the limit is ${CONFIG.tracks.maxFileMb} MB.`,
        '#ef4444'
      );
      return;
    }

    this.setStatus(`Decoding "${file.name}"...`, '#94a3b8');
    // Peak extraction walks every sample on the main thread and can block for a
    // few hundred ms on a long track. Yield one frame first so the message the
    // player is about to stare at actually paints.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    if (!this.alive) return;

    try {
      const buffer = await file.arrayBuffer();
      // decodeToPeaks detaches `buffer`; that's fine, what we persist is the
      // File itself (a Blob), which is untouched by decoding.
      // The timeout: iOS Safari can hang decodeAudioData on some containers,
      // and a rejected chunk guard is the only way `busy` comes back —
      // otherwise every button on this scene stays ignored forever.
      const decodeTimeout = new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error('Decoding took too long — try a different file or format.')),
          30000
        )
      );
      const { peaks, duration } = await Promise.race([
        decodeToPeaks(this, buffer),
        decodeTimeout,
      ]);
      if (!this.alive) return;

      const record = await trackStore.add({
        name: file.name,
        mime: file.type,
        blob: file,
        duration,
        peaks,
      });
      if (!this.alive) return;

      this.busy = false;
      this.records.push(record);
      // Jump to the page the new track landed on so it isn't added off-screen.
      this.page = Math.floor(
        (this.entries().length - 1) / CONFIG.tracks.listPageSize
      );
      this.renderList();
      this.setStatus(
        `Added "${record.name}". Tap EDIT to mark where super mode fires.`,
        '#4ade80'
      );
    } catch (err) {
      this.busy = false;
      // Nothing was written: a file that fails to decode never reaches the put.
      this.setStatus(err.message ?? 'That file could not be used.', '#ef4444');
    }
  }
}
