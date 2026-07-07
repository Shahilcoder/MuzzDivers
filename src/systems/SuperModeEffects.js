// =============================================================================
// SuperModeEffects.js — owns the entire "powered-up" LOOK.
//
// Player.js stays about gameplay; this module reads the player each frame and
// mutates its appearance (tint, scale) plus draws the aura + afterimage trail
// and shakes the camera on fire. Everything is driven by a single `intensity`
// (0 = off, 1 = fully super) that ramps on toggle, so effects scale together
// and the off-state restores the plain player cleanly.
//
// Pooling philosophy matches BulletPool/EnemyManager: the trail "ghosts" are
// pre-created once and recycled — no per-frame allocation, mobile-friendly.
// =============================================================================

import Phaser from 'phaser';
import { CONFIG } from '../config.js';

const Color = Phaser.Display.Color;

export default class SuperModeEffects {
  constructor(scene, player) {
    this.scene = scene;
    this.player = player;
    const fx = CONFIG.superMode.effects;

    this.active = false; // the intent (button state)
    this.intensity = 0; // ramped 0<->1; drives every effect's strength
    this.pulse = 0; // 0..1 oscillator for the gentle "breathe"
    this.lastTrailTime = 0;

    // Depth: aura(8) + trails(9) sit behind the player(10) but above the
    // world (enemies/bullets/terrain default to 0). HUD lives at 900+.
    player.setDepth(10);

    // --- Aura: one soft additive glow that follows + pulses --------------
    this.aura = scene.add
      .image(player.x, player.y, 'superGlow')
      .setBlendMode(Phaser.BlendModes.ADD) // works on WebGL AND Canvas
      .setTint(fx.accent)
      .setDepth(8)
      .setVisible(false);
    // Base scale so the 256px glow texture spans auraScale * player size.
    this.auraBaseScale = (CONFIG.player.size * fx.auraScale) / 256;

    // --- Afterimage trail pool ------------------------------------------
    this.trail = [];
    for (let i = 0; i < fx.trailPoolSize; i++) {
      const ghost = scene.add
        .image(0, 0, 'player')
        .setTint(fx.accent)
        .setDepth(9)
        .setActive(false)
        .setVisible(false);
      this.trail.push(ghost);
    }

    // --- Tint pulse colors (kept as Color objects for interpolation) -----
    this.colorFrom = Color.IntegerToColor(fx.tintFrom);
    this.colorTo = Color.IntegerToColor(fx.tintTo);

    // The breathe oscillator runs forever; it only becomes visible when
    // intensity > 0 multiplies it in.
    scene.tweens.add({
      targets: this,
      pulse: 1,
      duration: fx.pulseMs,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
  }

  // Toggle called from GameScene.toggleSuperMode(). Ramps intensity so the
  // whole look eases in/out over rampMs instead of snapping.
  setActive(active) {
    this.active = active;
    if (this.rampTween) this.rampTween.stop();
    this.rampTween = this.scene.tweens.add({
      targets: this,
      intensity: active ? 1 : 0,
      duration: CONFIG.superMode.effects.rampMs,
      ease: 'Sine.easeInOut',
      onComplete: () => {
        if (!this.active && this.intensity <= 0.001) this.deactivateFully();
      },
    });
  }

  // Fired on every shot (GameScene wires player 'fire' -> here). Only shakes
  // while super is active so normal fire stays calm.
  onFire() {
    if (!this.active) return;
    const fx = CONFIG.superMode.effects;
    this.scene.cameras.main.shake(fx.shakeMs, fx.shakeIntensity);
  }

  // Called each frame from GameScene.update AFTER the player has moved, so
  // position/velocity are current.
  update(time) {
    // Fully off: nothing to draw; deactivateFully() already cleaned up.
    if (this.intensity <= 0.001 && !this.active) return;

    this.updateAura();
    this.updateTint();
    this.applyDeform();
    this.maybeSpawnTrail(time);
  }

  updateAura() {
    const fx = CONFIG.superMode.effects;
    const a = this.aura;
    a.setVisible(true);
    a.setPosition(this.player.x, this.player.y);
    // Pulse nudges scale + alpha a little; intensity gates the whole thing.
    const pulseScale = 0.92 + 0.08 * this.pulse;
    a.setScale(this.auraBaseScale * pulseScale * (0.6 + 0.4 * this.intensity));
    const pulseAlpha = 0.8 + 0.2 * this.pulse;
    a.setAlpha(fx.auraAlpha * this.intensity * pulseAlpha);
  }

  updateTint() {
    // Breathe between the two cyans, then blend from "no tint" (white) up to
    // that color by intensity — so a partial ramp is a partial tint.
    const pulseCol = Color.Interpolate.ColorWithColor(
      this.colorFrom,
      this.colorTo,
      100,
      this.pulse * 100
    );
    const r = Phaser.Math.Linear(255, pulseCol.r, this.intensity);
    const g = Phaser.Math.Linear(255, pulseCol.g, this.intensity);
    const b = Phaser.Math.Linear(255, pulseCol.b, this.intensity);
    this.player.setTint(Color.GetColor(r, g, b));
  }

  // Squash & stretch: deform the sprite based on how it's moving. This is the
  // classic "game feel" decision, left as the Learn-by-Doing contribution.
  applyDeform() {
    const p = this.player;
    const body = p.body;
    const vx = body.velocity.x;
    const vy = body.velocity.y;
    // Max deformation available right now (fades in/out with intensity).
    const maxStretch = CONFIG.superMode.effects.maxStretch * this.intensity;

    // Normalize speed to 0..1 against the super top speed so the deform
    // saturates instead of exploding when falling accelerates past it.
    const speed = Math.hypot(vx, vy);
    const referenceSpeed =
      CONFIG.player.moveSpeed * CONFIG.superMode.speedMultiplier;
    const t = Phaser.Math.Clamp(speed / referenceSpeed, 0, 1);

    // Constant-volume horizontal deform: stretch wide, pinch tall (and vice
    // versa near rest). Reads as "moving fast" for this horizontal runner.
    const s = maxStretch * t;
    const scaleX = 1 + s;
    const scaleY = 1 - s;

    p.setScale(scaleX, scaleY);

    // Squash/stretch is PURELY cosmetic — but Arcade bodies scale with their
    // sprite (body.height = sourceHeight * scaleY), so without this the
    // collision box would grow through the ground on un-squash and Arcade would
    // wedge the player into it. Counter the scale on the body's source size and
    // re-center the offset so the collision box stays a constant SIZE x SIZE
    // box centered on the player, no matter how the sprite deforms.
    const S = CONFIG.player.size;
    const half = S / 2;
    p.body.setSize(S / scaleX, S / scaleY, false);
    p.body.setOffset(half * (1 - 1 / scaleX), half * (1 - 1 / scaleY));
  }

  maybeSpawnTrail(time) {
    const fx = CONFIG.superMode.effects;
    if (this.intensity < 0.5) return; // only trail once mostly ramped in
    if (time - this.lastTrailTime < fx.trailSpawnMs) return;

    const body = this.player.body;
    const speed = Math.hypot(body.velocity.x, body.velocity.y);
    if (speed < fx.trailMinSpeed) return; // no ghosts while standing still

    this.lastTrailTime = time;
    this.spawnTrail();
  }

  spawnTrail() {
    const fx = CONFIG.superMode.effects;
    const ghost = this.trail.find((g) => !g.active);
    if (!ghost) return; // pool exhausted this instant — skip

    const p = this.player;
    ghost.setPosition(p.x, p.y);
    ghost.setRotation(p.rotation);
    ghost.setScale(p.scaleX, p.scaleY); // copy current squash/stretch
    ghost.setFlipX(p.flipX);
    ghost.setActive(true).setVisible(true);
    ghost.setAlpha(fx.trailAlpha * this.intensity);

    this.scene.tweens.add({
      targets: ghost,
      alpha: 0,
      duration: fx.trailFadeMs,
      onComplete: () => ghost.setActive(false).setVisible(false),
    });
  }

  // Called once intensity has fully reached 0: hide/stop everything and put
  // the player back to a plain cyan square.
  deactivateFully() {
    this.aura.setVisible(false);
    this.trail.forEach((g) => {
      this.scene.tweens.killTweensOf(g);
      g.setActive(false).setVisible(false);
    });
    this.player.clearTint();
    this.player.setScale(1);
    // Restore the collision body to its plain, unscaled 48x48 (center=true
    // resets the offset), undoing the per-frame compensation from applyDeform.
    this.player.body.setSize(CONFIG.player.size, CONFIG.player.size, true);
  }
}
