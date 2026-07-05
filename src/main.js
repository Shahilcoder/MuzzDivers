// =============================================================================
// main.js — boots the Phaser game.
//
// This is the only file that constructs the Phaser.Game. It wires together:
//   - the render size + scaling strategy (fit any phone screen)
//   - the arcade physics world (gravity for the platformer)
//   - the ordered list of scenes (Boot runs first)
// =============================================================================

import Phaser from 'phaser';
import { CONFIG } from './config.js';
import BootScene from './scenes/BootScene.js';
import GameScene from './scenes/GameScene.js';
import GameOverScene from './scenes/GameOverScene.js';

// Fixed vertical design space (720). The width is derived from the device's
// aspect ratio so the canvas aspect matches the screen aspect — then FIT scales
// it edge-to-edge with no pillarbox bars and no cropping. See responsiveWidth().
function responsiveWidth() {
  return Math.round(CONFIG.height * (window.innerWidth / window.innerHeight));
}

const gameConfig = {
  type: Phaser.AUTO, // WebGL if available, else Canvas
  parent: 'game', // mount inside <div id="game">
  backgroundColor: CONFIG.backgroundColor,
  width: responsiveWidth(),
  height: CONFIG.height,

  // Scale Manager: render at (responsive width) x 720 internally, then FIT that
  // into the screen keeping aspect ratio, and CENTER the result. Because the
  // canvas aspect equals the screen aspect, FIT leaves no side bars.
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },

  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: CONFIG.gravity },
      debug: false, // flip to true to see physics bodies while developing
    },
  },

  // Scenes run/boot in array order; BootScene starts GameScene when ready.
  scene: [BootScene, GameScene, GameOverScene],
};

const game = new Phaser.Game(gameConfig);

// Keep the canvas aspect matched to the screen as it changes (window resize on
// desktop, rotating the phone on mobile). setGameSize re-fits the canvas AND
// fires the Scene 'resize' event that GameScene.layoutUI listens for.
function resizeToScreen() {
  game.scale.setGameSize(responsiveWidth(), CONFIG.height);
}
window.addEventListener('resize', resizeToScreen);
window.addEventListener('orientationchange', resizeToScreen);
