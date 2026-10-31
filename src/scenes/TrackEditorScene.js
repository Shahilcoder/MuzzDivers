// =============================================================================
// TrackEditorScene — mark the parts of a track where super mode should fire.
//
// Drag on the waveform to paint a window; drag its edges to resize; tap it to
// select it and then nudge either edge in half-second steps. The strip below the
// waveform seeks the preview, so you can hear what you are marking.
//
// The SUPER pill at the top-right runs the exact same predicate the game does
// (SuperWindows.isInAnyWindow, which GameScene.isInSuperWindow mirrors), so
// what you see light up here is what will happen in the run.
//
// Nothing is written to storage until SAVE. Coarse dragging gets you close; the
// nudge buttons make it exact, which is the only way this is usable on a phone —
// Scale.FIT shrinks the design space to roughly half size on a handset.
// =============================================================================

import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import UiButton from '../systems/UiButton.js';
import WaveformView from '../systems/WaveformView.js';
import { trackStore } from '../systems/TrackStore.js';
import { ensureTrackAudio } from '../systems/trackSource.js';
import {
  formatTime,
  isInAnyWindow,
  nudgeEdge,
  removeWindow,
} from '../systems/SuperWindows.js';

const WAVE_TOP = 78;
const TRANSPORT_Y = 400;
const PANEL_Y = 470;
const FOOTER_Y = 636;

export default class TrackEditorScene extends Phaser.Scene {
  constructor() {
    super('TrackEditorScene');
  }

  init(data) {
    this.trackId = data?.trackId ?? null;
    // Set only by onResize() below, which restarts this scene to rebuild a
    // width-dependent layout. Carries unsaved windows across the restart.
    this.pendingWindows = data?.pendingWindows ?? null;
    this.pendingDirty = data?.pendingDirty ?? false;
  }

  create() {
    this.alive = true;
    this.record = null;
    this.waveform = null;
    this.preview = null;
    this.dirty = false;
    this.confirmingBack = false;
    this.superActive = false;

    // Phaser's WebAudioSound.seek getter returns 0 whenever the sound is
    // stopped, and its setter is a no-op unless the sound is playing or paused
    // (node_modules/phaser/src/sound/webaudio/WebAudioSound.js:967-1018). So
    // scrubbing a stopped preview cannot be expressed through the Sound at all.
    // The editor keeps the authoritative position here and hands it to
    // play({ seek }) when playback starts.
    this.previewSeek = 0;

    this.builtForWidth = this.scale.width;
    this.buttons = [];
    this.buildChrome();
    this.scale.on('resize', this.onResize, this);

    this.events.once('shutdown', () => {
      this.alive = false;
      this.scale.off('resize', this.onResize, this);
      this.buttons.forEach((b) => b.destroy());
      this.waveform?.destroy();
      // Sounds live on the global manager, not the scene, so a preview left
      // playing would follow the player into the game and stack with the music.
      if (this.preview) {
        this.preview.stop();
        this.preview.destroy();
        this.preview = null;
      }
    });

    this.loadTrack();
  }

  // Every position in this scene derives from the canvas width, which changes
  // when a phone rotates. Rather than re-place two dozen elements, restart —
  // but carry the unsaved windows through, because silently discarding someone's
  // authored regions because they turned their phone would be unforgivable.
  onResize(gameSize) {
    if (!this.alive) return;
    if (Math.round(gameSize.width) === Math.round(this.builtForWidth)) return;

    this.scene.restart({
      trackId: this.trackId,
      pendingWindows: this.waveform ? this.waveform.windows : this.pendingWindows,
      pendingDirty: this.dirty || this.pendingDirty,
    });
  }

  get contentWidth() {
    return Math.min(this.scale.width - 60, 1180);
  }

  get contentLeft() {
    return (this.scale.width - this.contentWidth) / 2;
  }

  // --- Chrome ----------------------------------------------------------------

  buildChrome() {
    const left = this.contentLeft;
    const width = this.contentWidth;

    this.titleText = this.add.text(left, 18, 'Loading...', {
      fontFamily: 'monospace',
      fontSize: '26px',
      color: '#e2e8f0',
      fontStyle: 'bold',
    });

    this.statusText = this.add.text(left, 50, '', {
      fontFamily: 'monospace',
      fontSize: '17px',
      color: '#94a3b8',
      wordWrap: { width: width - 280 },
    });

    // Same look as the in-game HUD indicator, driven by the same predicate.
    this.superPill = this.add
      .text(left + width, 20, 'SUPER: OFF', {
        fontFamily: 'monospace',
        fontSize: '22px',
        color: '#ffffff',
        backgroundColor: '#444',
        padding: { x: 12, y: 8 },
      })
      .setOrigin(1, 0);

    // --- Transport ---------------------------------------------------------
    this.playBtn = this.track(
      new UiButton(this, {
        x: left,
        y: TRANSPORT_Y,
        width: 160,
        height: 56,
        label: '> PLAY',
        variant: 'primary',
        onTap: () => this.togglePreview(),
      })
    );

    this.stopBtn = this.track(
      new UiButton(this, {
        x: left + 170,
        y: TRANSPORT_Y,
        width: 130,
        height: 56,
        label: 'STOP',
        onTap: () => this.stopPreview(),
      })
    );

    this.timeText = this.add.text(left + 316, TRANSPORT_Y + 16, '0:00.0', {
      fontFamily: 'monospace',
      fontSize: '24px',
      color: '#f472b6',
      fontStyle: 'bold',
    });

    this.countText = this.add
      .text(left + width, TRANSPORT_Y + 18, '', {
        fontFamily: 'monospace',
        fontSize: '19px',
        color: '#94a3b8',
      })
      .setOrigin(1, 0);

    this.buildRegionPanel();
    this.buildFooter();
  }

  // The panel that makes phone use possible: exact readouts plus half-second
  // nudges for each edge, so a thumb-width drag only has to get close.
  buildRegionPanel() {
    const left = this.contentLeft;
    const width = this.contentWidth;

    this.panelG = this.add.graphics();
    this.panelG.fillStyle(0x111827, 1);
    this.panelG.fillRoundedRect(left, PANEL_Y, width, 130, 10);
    this.panelG.lineStyle(2, 0x334155, 1);
    this.panelG.strokeRoundedRect(left, PANEL_Y, width, 130, 10);

    this.panelLabel = this.add.text(left + 16, PANEL_Y + 12, 'NO WINDOW SELECTED', {
      fontFamily: 'monospace',
      fontSize: '17px',
      color: '#64748b',
    });

    this.startText = this.add.text(left + 16, PANEL_Y + 54, 'START --', {
      fontFamily: 'monospace',
      fontSize: '23px',
      color: '#e2e8f0',
    });

    this.endText = this.add.text(left + 380, PANEL_Y + 54, 'END --', {
      fontFamily: 'monospace',
      fontSize: '23px',
      color: '#e2e8f0',
    });

    const nudge = CONFIG.tracks.editor.nudgeSec;
    const mk = (x, label, edge, delta) =>
      this.track(
        new UiButton(this, {
          x,
          y: PANEL_Y + 44,
          width: 76,
          height: 54,
          label,
          fontSize: '19px',
          onTap: () => this.nudge(edge, delta),
        })
      );

    this.startMinus = mk(left + 196, `-${nudge}`, 'start', -nudge);
    this.startPlus = mk(left + 280, `+${nudge}`, 'start', nudge);
    this.endMinus = mk(left + 560, `-${nudge}`, 'end', -nudge);
    this.endPlus = mk(left + 644, `+${nudge}`, 'end', nudge);

    this.deleteRegionBtn = this.track(
      new UiButton(this, {
        x: left + width - 236,
        y: PANEL_Y + 44,
        width: 220,
        height: 54,
        label: 'DELETE WINDOW',
        fontSize: '18px',
        variant: 'danger',
        onTap: () => this.deleteSelected(),
      })
    );
  }

  buildFooter() {
    const left = this.contentLeft;
    const width = this.contentWidth;

    this.backBtn = this.track(
      new UiButton(this, {
        x: left,
        y: FOOTER_Y,
        width: 180,
        height: 58,
        label: '< BACK',
        onTap: () => this.goBack(),
      })
    );

    this.saveBtn = this.track(
      new UiButton(this, {
        x: left + width - 280,
        y: FOOTER_Y,
        width: 280,
        height: 58,
        label: 'SAVE WINDOWS',
        variant: 'accent',
        onTap: () => this.save(),
      })
    );
  }

  track(button) {
    this.buttons.push(button);
    return button;
  }

  setStatus(message, color = '#94a3b8') {
    if (!this.alive) return;
    this.statusText.setColor(color).setText(message);
  }

  // --- Loading ---------------------------------------------------------------

  // Named loadTrack, NOT load: Phaser injects the LoaderPlugin into
  // `this.load` on every scene, which shadows a method named `load` —
  // calling it throws and kills scene creation.
  async loadTrack() {
    // The bundled track has no EDIT button, but guard anyway: its windows are
    // hardcoded in CONFIG and it has no stored record to write back to.
    if (!this.trackId || this.trackId === CONFIG.tracks.defaultId) {
      this.scene.start('TrackSelectScene');
      return;
    }

    const record = await trackStore.get(this.trackId);
    if (!this.alive) return;

    if (!record) {
      this.setStatus('That track is no longer stored.', '#ef4444');
      return;
    }
    this.record = record;
    this.titleText.setText(record.name);

    let descriptor;
    try {
      descriptor = await ensureTrackAudio(this, record);
    } catch (err) {
      if (!this.alive) return;
      this.setStatus(err.message ?? 'Could not decode this track.', '#ef4444');
      return;
    }
    if (!this.alive) return;

    // Same audio-cache key the game will use, from the same factory — so what
    // you preview here and what plays in the run cannot diverge.
    this.preview = this.sound.add(descriptor.key, {
      loop: false,
      volume: CONFIG.music.volume,
    });

    this.buildWaveform();
    this.setStatus(
      'Drag on the waveform to mark a window. Drag its edges to resize. Tap it to nudge.'
    );
    this.refreshPanel();
  }

  buildWaveform() {
    this.waveform = new WaveformView(
      this,
      { x: this.contentLeft, y: WAVE_TOP, width: this.contentWidth },
      20
    );

    this.waveform.onWindowsChanged = () => {
      this.dirty = true;
      this.refreshPanel();
    };
    this.waveform.onSelectionChanged = () => this.refreshPanel();
    this.waveform.onSeek = (t) => this.scrubTo(t);

    this.waveform.setTrack({
      peaks: this.record.peaks,
      duration: this.record.duration,
      windows: this.pendingWindows ?? this.record.windows ?? [],
    });
    this.dirty = this.pendingDirty;
  }

  // --- Preview transport -----------------------------------------------------

  togglePreview() {
    if (!this.preview) return;

    if (this.preview.isPlaying) {
      // Read the position BEFORE pausing — the getter's meaning changes with
      // the sound's state.
      this.previewSeek = this.preview.seek;
      this.preview.pause();
      return;
    }

    if (this.sound.locked) {
      // Autoplay lock: the browser only unlocks audio on a user gesture, and
      // this tap IS one, so Phaser will unlock during it and the next tap
      // plays. Say so rather than appearing broken.
      this.setStatus('Audio is locked by the browser — tap PLAY once more.', '#f97316');
      return;
    }

    if (this.preview.isPaused) {
      this.preview.resume();
    } else {
      // The only reliable way to start a stopped sound at a position.
      this.preview.play({ seek: this.previewSeek });
    }
  }

  stopPreview() {
    if (!this.preview) return;
    this.preview.stop();
    this.previewSeek = 0;
    this.waveform?.setPlayhead(0);
  }

  // Called by the scrub strip, both on press and continuously while dragging.
  scrubTo(seconds) {
    this.previewSeek = seconds;
    if (this.preview?.isPlaying || this.preview?.isPaused) {
      this.preview.setSeek(seconds);
    }
    this.waveform?.setPlayhead(seconds);
  }

  // --- Region editing --------------------------------------------------------

  nudge(edge, delta) {
    const view = this.waveform;
    if (!view || view.selectedIndex === -1) return;

    const next = nudgeEdge(view.windows, view.selectedIndex, edge, delta);
    // Anchor on the edge that did NOT move, so the selection survives even if
    // the nudge collapsed or merged the region.
    const other = edge === 'start' ? 'end' : 'start';
    const anchor = next[view.selectedIndex][other];
    view.applyWindows(next, anchor);
  }

  deleteSelected() {
    const view = this.waveform;
    if (!view || view.selectedIndex === -1) return;
    view.applyWindows(removeWindow(view.windows, view.selectedIndex), null);
    this.setStatus('Window deleted. SAVE to keep the change.');
  }

  refreshPanel() {
    const view = this.waveform;
    const selected = view?.getSelected() ?? null;
    const count = view?.windows.length ?? 0;

    this.countText.setText(
      `${count} WINDOW${count === 1 ? '' : 'S'}${this.dirty ? '  ·  UNSAVED' : ''}`
    );
    this.countText.setColor(this.dirty ? '#fde047' : '#94a3b8');

    if (!selected) {
      this.panelLabel.setText('NO WINDOW SELECTED — drag on the waveform to make one');
      this.startText.setText('START  --:--');
      this.endText.setText('END  --:--');
      [this.startMinus, this.startPlus, this.endMinus, this.endPlus, this.deleteRegionBtn].forEach(
        (b) => b.setEnabled(false)
      );
      return;
    }

    const length = selected.end - selected.start;
    this.panelLabel.setText(
      `SELECTED WINDOW  ·  ${length.toFixed(1)}s of super mode`
    );
    this.startText.setText(`START  ${formatTime(selected.start)}`);
    this.endText.setText(`END  ${formatTime(selected.end)}`);
    [this.startMinus, this.startPlus, this.endMinus, this.endPlus, this.deleteRegionBtn].forEach(
      (b) => b.setEnabled(true)
    );
  }

  // --- Persist / leave -------------------------------------------------------

  async save() {
    if (!this.record || !this.waveform) return;

    this.record.windows = this.waveform.windows.map((w) => ({ ...w }));
    try {
      await trackStore.put(this.record);
    } catch (err) {
      this.setStatus(err.message ?? 'Could not save.', '#ef4444');
      return;
    }
    if (!this.alive) return;

    this.dirty = false;
    this.refreshPanel();
    this.setStatus(
      `Saved ${this.record.windows.length} window(s) for "${this.record.name}".`,
      '#4ade80'
    );
  }

  goBack() {
    // One tap to leave when there is nothing to lose; two when there is.
    if (this.dirty && !this.confirmingBack) {
      this.confirmingBack = true;
      this.backBtn.setLabel('DISCARD?');
      this.setStatus('Unsaved windows. Tap DISCARD to leave anyway.', '#f97316');
      this.time.delayedCall(3000, () => {
        if (!this.alive || !this.confirmingBack) return;
        this.confirmingBack = false;
        this.backBtn.setLabel('< BACK');
        this.setStatus('');
      });
      return;
    }

    this.scene.start('TrackSelectScene');
  }

  update() {
    if (!this.waveform) return;

    if (this.preview?.isPlaying) {
      this.previewSeek = this.preview.seek;
      this.waveform.setPlayhead(this.previewSeek);
    }

    this.playBtn.setLabel(this.preview?.isPlaying ? '|| PAUSE' : '> PLAY');
    this.timeText.setText(formatTime(this.previewSeek));

    // The live check — identical to GameScene.isInSuperWindow.
    // Only touched on CHANGE: Text.setBackgroundColor re-renders the text
    // texture unconditionally, so calling it every frame would repaint a canvas
    // 60 times a second for nothing. GameScene.setSuperMode guards for the
    // same reason.
    const active = isInAnyWindow(this.waveform.windows, this.previewSeek);
    if (active !== this.superActive) {
      this.superActive = active;
      this.superPill.setText(`SUPER: ${active ? 'ON' : 'OFF'}`);
      this.superPill.setBackgroundColor(active ? '#16a34a' : '#444');
    }
  }
}
