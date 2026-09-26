// =============================================================================
// GameOverScene — shown when the run ends. Displays the score and the best
// score (persisted in localStorage), then offers two ways onward.
//
// This used to restart on a tap ANYWHERE, which was fine when the game had one
// hardcoded track. Now that the music is chosen, tap-anywhere would leave no
// route back to the track list short of reloading the page — so it is two real
// buttons instead:
//
//   RETRY        — same track. Works with no plumbing because the active track
//                  lives in the game-wide registry, not in scene init data.
//   CHANGE TRACK — back to TrackSelectScene.
//
// The final score is passed in via scene.start('GameOverScene', { score }).
// =============================================================================

import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import UiButton from '../systems/UiButton.js';

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOverScene');
  }

  init(data) {
    this.finalScore = data.score ?? 0;
  }

  create() {
    // Center on the live canvas size — the width is now device-dependent.
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;

    // Read & update the best score in localStorage.
    const key = CONFIG.scoring.bestScoreKey;
    const prevBest = Number(localStorage.getItem(key) ?? 0);
    const best = Math.max(prevBest, this.finalScore);
    localStorage.setItem(key, String(best));
    const isNewBest = this.finalScore > prevBest && this.finalScore > 0;

    this.add
      .text(cx, cy - 140, 'GAME OVER', {
        fontFamily: 'monospace',
        fontSize: '72px',
        color: '#ef4444',
        fontStyle: 'bold',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy - 30, `Score: ${this.finalScore}`, {
        fontFamily: 'monospace',
        fontSize: '44px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy + 30, `Best: ${best}${isNewBest ? '  ★ NEW!' : ''}`, {
        fontFamily: 'monospace',
        fontSize: '32px',
        color: isNewBest ? '#fde047' : '#94a3b8',
      })
      .setOrigin(0.5);

    // Which track this run used, so RETRY is unambiguous.
    const track = this.registry.get('activeTrack');
    if (track) {
      this.add
        .text(cx, cy + 80, `\u266a ${track.name}`, {
          fontFamily: 'monospace',
          fontSize: '20px',
          color: '#64748b',
        })
        .setOrigin(0.5);
    }

    // Built disabled, then enabled after 400ms. Creating them late instead
    // would make them pop into an already-settled layout; this keeps the
    // layout stable while still stopping the death-tap — which is very often
    // still travelling when this scene appears — from firing one instantly.
    const gap = 24;
    const retryW = 240;
    const changeW = 320;
    const rowLeft = cx - (retryW + gap + changeW) / 2;
    const rowY = cy + 130;

    this.retryBtn = new UiButton(this, {
      x: rowLeft,
      y: rowY,
      width: retryW,
      height: 64,
      label: 'RETRY',
      fontSize: '26px',
      variant: 'accent',
      enabled: false,
      onTap: () => this.scene.start('GameScene'),
    });

    this.changeBtn = new UiButton(this, {
      x: rowLeft + retryW + gap,
      y: rowY,
      width: changeW,
      height: 64,
      label: 'CHANGE TRACK',
      fontSize: '24px',
      enabled: false,
      onTap: () => this.scene.start('TrackSelectScene'),
    });

    this.time.delayedCall(400, () => {
      this.retryBtn.setEnabled(true);
      this.changeBtn.setEnabled(true);
    });

    this.events.once('shutdown', () => {
      this.retryBtn.destroy();
      this.changeBtn.destroy();
    });
  }
}
