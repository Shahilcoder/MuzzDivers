// =============================================================================
// BulletPool.js — a fixed pool of reusable bullet sprites.
//
// Why a pool? Creating and destroying sprites every shot causes garbage-
// collection hitches on mobile. Instead we make CONFIG.bullet.poolSize bullets
// once, keep them all alive but inactive/invisible, and "fire" simply recycles
// an idle one. Nothing is ever destroyed mid-game.
// =============================================================================

import Phaser from 'phaser';
import { CONFIG } from '../config.js';

export default class BulletPool {
  constructor(scene) {
    this.scene = scene;

    // A physics group with gravity disabled — bullets fly straight, no arc.
    this.group = scene.physics.add.group({
      defaultKey: 'bullet',
      maxSize: CONFIG.bullet.poolSize,
      allowGravity: false,
    });

    // Pre-create the whole pool up front, all parked and disabled.
    for (let i = 0; i < CONFIG.bullet.poolSize; i++) {
      const bullet = this.group.create(0, 0, 'bullet');
      bullet.setActive(false).setVisible(false);
      bullet.body.setAllowGravity(false);
    }
  }

  // Fire a bullet from (x, y) traveling along `angle` (radians).
  fire(x, y, angle) {
    // get() hands back the first inactive bullet, or null if all are in flight.
    const bullet = this.group.get(x, y, 'bullet');
    if (!bullet) return; // pool exhausted this instant — skip the shot

    bullet.setActive(true).setVisible(true);
    bullet.setPosition(x, y);
    bullet.body.setAllowGravity(false);
    bullet.body.enable = true;

    // Velocity components from the angle.
    const speed = CONFIG.bullet.speed;
    bullet.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);

    // Remember when it was fired so update() can expire it.
    bullet.firedAt = this.scene.time.now;
  }

  // Recycle a bullet back into the idle pool.
  recycle(bullet) {
    bullet.setActive(false).setVisible(false);
    bullet.body.enable = false;
    bullet.setVelocity(0, 0);
  }

  // Called each frame: expire bullets that have lived too long or flown far
  // off-screen behind the camera.
  update(scrollX) {
    const now = this.scene.time.now;
    const leftEdge = scrollX - 200;
    const rightEdge = scrollX + this.scene.scale.width + 200;

    this.group.children.iterate((bullet) => {
      if (!bullet || !bullet.active) return true;
      const expired = now - bullet.firedAt > CONFIG.bullet.lifespanMs;
      const offScreen = bullet.x < leftEdge || bullet.x > rightEdge;
      if (expired || offScreen) this.recycle(bullet);
      return true;
    });
  }
}
