// =============================================================================
// BootScene — the FIRST scene. Its only job is to make every texture the game
// needs, then hand off to GameScene.
//
// Right now all art is generated at runtime as simple colored shapes using
// Phaser's Graphics API. Nothing else in the codebase references raw art — so
// this is the ONE place you swap in real sprites later (see SWAP POINT below).
// =============================================================================

import Phaser from 'phaser';
import { CONFIG } from '../config.js';

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  preload() {
    // ---------------------------------------------------------------------
    // SWAP POINT — replacing placeholder art with real sprites.
    //
    // When you have real images, delete createPlaceholderTextures() below and
    // load files here instead, keeping the SAME texture keys:
    //
    //   this.load.image('player', 'assets/player.png');
    //   this.load.image('enemy',  'assets/enemy.png');
    //   this.load.image('bullet', 'assets/bullet.png');
    //   this.load.image('ground', 'assets/ground.png');
    //
    // The joystick UI ('joyBase' / 'joyThumb') can stay generated. Because
    // every system refers to textures only by these keys, no other file changes.
    // ---------------------------------------------------------------------
  }

  create() {
    this.createPlaceholderTextures();
    this.scene.start('GameScene');
  }

  // Build all placeholder textures as labeled colored shapes. Each call draws
  // into an off-screen Graphics object, bakes it into a reusable texture under
  // a string key, then clears the Graphics for the next one.
  createPlaceholderTextures() {
    const g = this.make.graphics({ x: 0, y: 0, add: false });

    // Player — a bright cyan rounded square.
    const ps = CONFIG.player.size;
    g.fillStyle(0x22d3ee, 1);
    g.fillRoundedRect(0, 0, ps, ps, 8);
    g.lineStyle(3, 0x0e7490, 1);
    g.strokeRoundedRect(0, 0, ps, ps, 8);
    g.generateTexture('player', ps, ps);
    g.clear();

    // Enemy — a red diamond-ish square so it reads as "danger".
    const es = CONFIG.enemy.size;
    g.fillStyle(0xef4444, 1);
    g.fillRoundedRect(0, 0, es, es, 6);
    g.lineStyle(3, 0x7f1d1d, 1);
    g.strokeRoundedRect(0, 0, es, es, 6);
    g.generateTexture('enemy', es, es);
    g.clear();

    // Bullet — a small yellow circle.
    const bs = CONFIG.bullet.size;
    g.fillStyle(0xfde047, 1);
    g.fillCircle(bs / 2, bs / 2, bs / 2);
    g.generateTexture('bullet', bs, bs);
    g.clear();

    // Ground tile — a dark slab with a lighter top edge (reads as grass/dirt).
    const ts = CONFIG.terrain.tileSize;
    g.fillStyle(0x3f3f5e, 1);
    g.fillRect(0, 0, ts, ts);
    g.fillStyle(0x6d6d9c, 1);
    g.fillRect(0, 0, ts, 8); // top highlight strip
    g.generateTexture('ground', ts, ts);
    g.clear();

    // Joystick base — a translucent ring.
    const baseR = CONFIG.joystick.baseRadius;
    g.fillStyle(0xffffff, CONFIG.joystick.baseAlpha);
    g.fillCircle(baseR, baseR, baseR);
    g.generateTexture('joyBase', baseR * 2, baseR * 2);
    g.clear();

    // Joystick thumb — a brighter solid knob.
    const thumbR = CONFIG.joystick.thumbRadius;
    g.fillStyle(0xffffff, 0.7);
    g.fillCircle(thumbR, thumbR, thumbR);
    g.generateTexture('joyThumb', thumbR * 2, thumbR * 2);
    g.clear();

    g.destroy();
  }
}
