// =============================================================================
// GameScene — the orchestrator. It owns nothing complicated itself; instead it
// creates the systems (player, bullets, terrain, enemies, controls), wires the
// colliders, and on each frame reads input → updates systems → updates HUD →
// checks lose conditions (fell in a pit, or health drained by enemy contact).
//
// Per-frame flow lives in update(): read input → drive player → update terrain,
// enemies, bullets → update score/HUD → check lose conditions.
// =============================================================================

import Phaser from 'phaser';
import { CONFIG } from '../config.js';
import Player from '../objects/Player.js';
import BulletPool from '../systems/BulletPool.js';
import DesktopControls from '../systems/DesktopControls.js';
import VirtualJoystick from '../systems/VirtualJoystick.js';
import TerrainGenerator from '../systems/TerrainGenerator.js';
import EnemyManager from '../systems/EnemyManager.js';
import SuperModeEffects from '../systems/SuperModeEffects.js';

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('GameScene');
  }

  create() {
    // --- Systems ---------------------------------------------------------
    this.bulletPool = new BulletPool(this);
    this.player = new Player(
      this,
      CONFIG.player.startX,
      CONFIG.player.startY,
      this.bulletPool
    );
    this.desktop = new DesktopControls(this);

    // Visual "juice" for super mode. Owns the aura/trail/tint/squash + camera
    // shake; the player emits 'fire' each shot so shake can react.
    this.superFx = new SuperModeEffects(this, this.player);
    this.player.on('fire', () => this.superFx.onFire());

    // --- Touch controls --------------------------------------------------
    // CRITICAL multi-touch step: by default Phaser tracks one pointer. Adding a
    // second lets both thumbs register at the same time (move + aim together).
    this.input.addPointer(2);

    // Left half of the screen drives movement, right half drives aim/fire.
    // Built from the live canvas size since width is now device-dependent;
    // layoutUI() keeps these halves correct across resizes.
    const halfW = this.scale.width / 2;
    this.leftStick = new VirtualJoystick(this, {
      x: 0,
      y: 0,
      width: halfW,
      height: this.scale.height,
    });
    this.rightStick = new VirtualJoystick(this, {
      x: halfW,
      y: 0,
      width: halfW,
      height: this.scale.height,
    });

    // --- Terrain (endless ground + pits) ---------------------------------
    this.terrain = new TerrainGenerator(this);

    // --- Enemies ---------------------------------------------------------
    this.enemies = new EnemyManager(this, this.terrain);
    this.kills = 0;

    // --- Colliders / overlaps -------------------------------------------
    this.physics.add.collider(this.player, this.terrain.group);
    this.physics.add.collider(this.enemies.group, this.terrain.group);

    // Bullet hits enemy → damage enemy, recycle bullet, count the kill.
    this.physics.add.overlap(
      this.bulletPool.group,
      this.enemies.group,
      (bullet, enemy) => {
        if (!bullet.active || !enemy.active) return;
        this.bulletPool.recycle(bullet);
        if (this.enemies.damage(enemy, 1)) this.kills += 1;
      }
    );

    // Enemy touches player → damage (respects i-frames inside takeDamage).
    this.physics.add.overlap(
      this.player,
      this.enemies.group,
      (player, enemy) => {
        if (!enemy.active) return;
        player.takeDamage(CONFIG.player.contactDamage, this.time.now);
        if (player.isDead()) this.endGame();
      }
    );

    // --- Camera ----------------------------------------------------------
    // Follow the player. A vertical dead-zone keeps the view steady during
    // small jumps instead of bobbing with every hop.
    const cam = this.cameras.main;
    cam.startFollow(this.player, true, 0.12, 0.12);
    cam.setDeadzone(0, CONFIG.height * 0.4);

    // --- Music ------------------------------------------------------------
    // Start the soundtrack looping. Its playback position (music.seek) is the
    // clock that drives super mode each frame in update(). Because the music is
    // the clock, this survives looping and browser autoplay-locks for free.
    this.music = this.sound.add(CONFIG.music.key, {
      loop: CONFIG.music.loop,
      volume: CONFIG.music.volume,
    });
    this.music.play();

    // --- Scoring + HUD ---------------------------------------------------
    this.isGameOver = false;
    this.superMode = false; // driven automatically by the music (see update)
    // Furthest rightward progress, in world px, ever reached. Score never drops
    // when you backtrack — only moving past your record counts.
    this.maxDistance = 0;
    this.createHUD();

    // Re-anchor HUD + joystick zones whenever the canvas is resized (window
    // resize on desktop, phone rotation). setGameSize in main.js fires this.
    // Call once now so the initial layout matches the starting canvas size.
    this.scale.on('resize', this.layoutUI, this);
    this.layoutUI(this.scale.gameSize);
  }

  // Re-position the size-dependent UI after the canvas dimensions change.
  // gameSize is a Phaser.Structs.Size with .width / .height (the new canvas
  // dimensions in the 720-tall design space).
  layoutUI(gameSize) {
    // Re-anchor the right-edge HUD to the new width and resize both joystick
    // zones so the left/right halves still split the new width.
    this.scoreText.x = gameSize.width - 24;
    this.superBtn.x = gameSize.width - 24;
    const halfW = gameSize.width / 2;

    this.leftStick.setZone({
      x: 0,
      y: 0,
      width: halfW,
      height: gameSize.height
    });

    this.rightStick.setZone({
      x: halfW,
      y: 0,
      width: halfW,
      height: gameSize.height
    });
  }

  // Build the heads-up display: a health bar (top-left) and score (top-right).
  // Everything is pinned to the camera with scrollFactor 0 so it never scrolls.
  createHUD() {
    // Graphics object we redraw each frame for the health bar.
    this.healthBar = this.add.graphics().setScrollFactor(0).setDepth(900);

    this.add
      .text(24, 18, 'HEALTH', {
        fontFamily: 'monospace',
        fontSize: '18px',
        color: '#cbd5e1',
      })
      .setScrollFactor(0)
      .setDepth(901);

    this.scoreText = this.add
      .text(this.scale.width - 24, 22, 'SCORE 0', {
        fontFamily: 'monospace',
        fontSize: '30px',
        color: '#fde047',
        fontStyle: 'bold',
      })
      .setOrigin(1, 0) // right-aligned
      .setScrollFactor(0)
      .setDepth(901);

    // Super mode indicator — top-right, tucked below the score text. Display
    // only (no interactivity): the music decides when super mode is on, so this
    // just reflects that state. Green while active, grey while off.
    this.superBtn = this.add
      .text(this.scale.width - 24, 62, 'SUPER: OFF', {
        fontFamily: 'monospace',
        fontSize: '24px',
        color: '#ffffff',
        backgroundColor: '#444',
        padding: { x: 12, y: 8 },
      })
      .setOrigin(1, 0) // top-right, below the score
      .setScrollFactor(0) // pin to camera
      .setDepth(1002); // above HUD/joysticks
  }

  // Single sync point for super mode. Idempotent: only touches state when the
  // value actually changes, so it's safe to call every frame from update().
  // Sets the flag, mirrors it onto the player, ramps the visual effects, and
  // updates the HUD indicator.
  setSuperMode(active) {
    if (active === this.superMode) return;
    this.superMode = active;
    this.player.superMode = active;

    this.superFx.setActive(active); // ramp the aura/trail/tint in/out to match

    this.superBtn.setText(`SUPER: ${active ? 'ON' : 'OFF'}`);
    this.superBtn.setBackgroundColor(active ? '#16a34a' : '#444');
  }

  // Given the current playback position (seconds), decide whether we are inside
  // any configured super-mode window. Drives setSuperMode() each frame.
  isInSuperWindow(seconds) {
    // CONFIG.music.superWindows (each has { start, end } in seconds).
    // Array.prototype.some() is a good fit here: it returns true if any element passes the test.
    // No Allocation: don't create any new arrays or objects; just check the existing CONFIG.music.superWindows.
    return CONFIG.music.superWindows.some((w) => seconds >= w.start && seconds <= w.end);
  }

  // Current score = distance progress + kill bonus.
  computeScore() {
    const distScore = Math.floor(
      this.maxDistance / CONFIG.scoring.distanceDivisor
    );
    return distScore + this.kills * CONFIG.scoring.killPoints;
  }

  // Redraw the health bar and refresh the score text.
  updateHUD() {
    const x = 24;
    const y = 44;
    const w = 260;
    const h = 26;
    const ratio = Phaser.Math.Clamp(
      this.player.health / this.player.maxHealth,
      0,
      1
    );

    // Color goes green → yellow → red as health drops.
    let color = 0x22c55e;
    if (ratio < 0.3) color = 0xef4444;
    else if (ratio < 0.6) color = 0xfacc15;

    this.healthBar.clear();
    this.healthBar.fillStyle(0x000000, 0.5); // track
    this.healthBar.fillRoundedRect(x, y, w, h, 6);
    if (ratio > 0) {
      this.healthBar.fillStyle(color, 1); // fill
      this.healthBar.fillRoundedRect(x, y, w * ratio, h, 6);
    }
    this.healthBar.lineStyle(2, 0xffffff, 0.5);
    this.healthBar.strokeRoundedRect(x, y, w, h, 6);

    this.scoreText.setText(`SCORE ${this.computeScore()}`);
  }

  update(time) {
    // 1. Read inputs. Touch wins when a thumb is on the stick; otherwise fall
    //    back to keyboard/mouse so the game is playable on a laptop too.
    const leftStick = this.leftStick.vector.isActive
      ? this.leftStick.vector
      : this.desktop.getLeftStick();
    const rightStick = this.rightStick.vector.isActive
      ? this.rightStick.vector
      : this.desktop.getRightStick(this.player);

    // 2. Drive the player, then update its super-mode look (needs current
    //    position/velocity, so it runs right after the player moves).
    this.player.update(time, leftStick, rightStick);
    this.superFx.update(time);

    // 3. Extend/recycle terrain ahead of and behind the camera.
    this.terrain.update(this.cameras.main.scrollX);

    // 4. Spawn/steer/recycle enemies.
    this.enemies.update(time, this.player, this.cameras.main.scrollX);

    // 5. Recycle spent bullets.
    this.bulletPool.update(this.cameras.main.scrollX);

    // 6. Drive super mode from the music's playback position. music.seek is
    //    0 until the browser unlocks audio on first gesture, so super mode
    //    simply stays off until the track is actually playing.
    this.setSuperMode(this.isInSuperWindow(this.music.seek));

    // 7. Update score (furthest rightward progress) and the HUD.
    const progress = this.player.x - CONFIG.player.startX;
    if (progress > this.maxDistance) this.maxDistance = progress;
    this.updateHUD();

    // 8. Lose condition: fell into a pit (below the world).
    if (this.player.y > this.terrain.worldBottom) {
      this.endGame();
    }
  }

  // End the run and hand the final score to the game-over screen.
  endGame() {
    if (this.isGameOver) return;
    this.isGameOver = true;
    this.scene.start('GameOverScene', { score: this.computeScore() });
  }
}
