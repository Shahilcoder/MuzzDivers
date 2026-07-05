// =============================================================================
// GameOverScene — shown when the run ends. Displays the score and the best
// score (persisted in localStorage), and restarts the game on tap/click/key.
//
// The final score is passed in via scene.start('GameOverScene', { score }).
// =============================================================================

import Phaser from 'phaser';
import { CONFIG } from '../config.js';

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

    const prompt = this.add
      .text(cx, cy + 140, 'Tap / Click / Press to play again', {
        fontFamily: 'monospace',
        fontSize: '28px',
        color: '#22d3ee',
      })
      .setOrigin(0.5);

    // Gentle pulse so the restart prompt draws the eye.
    this.tweens.add({
      targets: prompt,
      alpha: 0.3,
      duration: 700,
      yoyo: true,
      repeat: -1,
    });

    // Restart on any pointer or key. Small delay stops the death-tap from
    // instantly restarting.
    this.time.delayedCall(400, () => {
      this.input.once('pointerdown', () => this.restart());
      this.input.keyboard.once('keydown', () => this.restart());
    });
  }

  restart() {
    this.scene.start('GameScene');
  }
}
