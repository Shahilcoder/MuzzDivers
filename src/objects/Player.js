// =============================================================================
// Player.js — the controllable character.
//
// Extends an Arcade physics sprite so it has a velocity/gravity body. The scene
// calls player.update(leftStick, rightStick) every frame; this class turns those
// two input vectors into movement, jumping, aiming, and firing. It also owns
// health and the post-hit invincibility window.
// =============================================================================

import Phaser from 'phaser';
import { CONFIG } from '../config.js';

export default class Player extends Phaser.Physics.Arcade.Sprite {
  constructor(scene, x, y, bulletPool) {
    super(scene, x, y, 'player');
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.bulletPool = bulletPool;

    // Body setup: collide with world bounds is OFF on the sides (endless world),
    // gravity comes from the global arcade config.
    this.setCollideWorldBounds(false);
    this.body.setSize(CONFIG.player.size, CONFIG.player.size);

    // State
    this.maxHealth = CONFIG.player.maxHealth;
    this.health = this.maxHealth;
    this.aimAngle = 0; // radians; where the gun points (0 = right)
    this.lastFireTime = 0; // timestamp of last shot (for cooldown)
    this.invincibleUntil = 0; // timestamp; while now < this, immune to damage
    this.superMode = false; // when true, move + fire much faster (see CONFIG.superMode)
  }

  // Called every frame from GameScene.update.
  // leftStick / rightStick are {x, y, angle, force, isActive} from a joystick
  // (or the keyboard/mouse fallback shaped the same way).
  update(time, leftStick, rightStick) {
    this.handleMovement(leftStick);
    this.handleAimAndFire(time, rightStick);
    this.updateInvincibilityVisual(time);
  }

  handleMovement(leftStick) {
    // Horizontal: stick X (-1..1) scaled to max speed (boosted in super mode).
    const speed =
      CONFIG.player.moveSpeed *
      (this.superMode ? CONFIG.superMode.speedMultiplier : 1);
    this.setVelocityX(leftStick.x * speed);

    // Jump: pushing the stick up enough (y is negative when up) while standing.
    const pushingUp = leftStick.y < -CONFIG.player.jumpThreshold;
    if (pushingUp && this.body.onFloor()) {
      this.setVelocityY(CONFIG.player.jumpVelocity);
    }
  }

  handleAimAndFire(time, rightStick) {
    if (!rightStick.isActive) return;

    // Aim follows the right stick's angle.
    this.aimAngle = rightStick.angle;

    // Fire if the cooldown has elapsed (shortened in super mode).
    const cooldown =
      CONFIG.bullet.fireRateMs /
      (this.superMode ? CONFIG.superMode.fireRateDivisor : 1);
    if (time - this.lastFireTime >= cooldown) {
      this.lastFireTime = time;
      // Spawn the bullet just outside the player body in the aim direction.
      const spawnDist = CONFIG.player.size * 0.6;
      const bx = this.x + Math.cos(this.aimAngle) * spawnDist;
      const by = this.y + Math.sin(this.aimAngle) * spawnDist;
      this.bulletPool.fire(bx, by, this.aimAngle);
    }
  }

  // Apply damage unless currently in i-frames. Returns true if the hit landed.
  takeDamage(amount, time) {
    if (time < this.invincibleUntil) return false;
    this.health = Math.max(0, this.health - amount);
    this.invincibleUntil = time + CONFIG.player.invincibleMs;
    return true;
  }

  isDead() {
    return this.health <= 0;
  }

  // Flicker the sprite while invincible so the player can see the i-frame window.
  updateInvincibilityVisual(time) {
    if (time < this.invincibleUntil) {
      // Blink ~every 100ms.
      this.setAlpha(Math.floor(time / 100) % 2 === 0 ? 0.4 : 1);
    } else {
      this.setAlpha(1);
    }
  }
}
