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
// Imported as a URL so Vite bundles + fingerprints the file for production
// builds. A bare path would only resolve for files placed in public/.
import musicUrl from '../assets/audio/PROVANT_Fatestrange_Fake.mp3';

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

    // Soundtrack — GameScene plays this on a loop and uses its playback
    // position to drive super mode (see CONFIG.music).
    this.load.audio(CONFIG.music.key, musicUrl);
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

    // Super-mode aura — a soft radial glow that fades to transparent at the
    // edge. Graphics can't draw a true radial gradient, so this one texture is
    // painted on a Canvas via createRadialGradient. It's tinted at runtime by
    // SuperModeEffects, so the base color here is plain white.
    const glowD = 256; // texture is a square; larger = smoother when scaled up
    const glowTex = this.textures.createCanvas('superGlow', glowD, glowD);
    const gctx = glowTex.getContext();
    const r = glowD / 2;
    const grad = gctx.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); // solid core
    grad.addColorStop(0.5, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)'); // transparent rim
    gctx.fillStyle = grad;
    gctx.fillRect(0, 0, glowD, glowD);
    glowTex.refresh(); // push the canvas pixels into the GPU texture

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
