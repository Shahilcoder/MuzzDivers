// =============================================================================
// EnemyManager.js — a recycled pool of enemies that spawn ahead of the player
// and walk toward them.
//
// Each enemy is an arcade sprite with gravity, so it drops onto the ground and
// can fall into pits. Steering is deliberately simple: move horizontally toward
// the player; gravity + the ground collider handle the rest. Enemies that fall
// in a pit or scroll far behind the camera are recycled back into the pool.
// =============================================================================

import Phaser from 'phaser';
import { CONFIG } from '../config.js';

export default class EnemyManager {
  constructor(scene, terrain) {
    this.scene = scene;
    this.terrain = terrain;

    // Physics group with gravity ON (enemies fall onto terrain).
    this.group = scene.physics.add.group({
      defaultKey: 'enemy',
      maxSize: CONFIG.enemy.poolSize,
    });

    // Pre-create the pool, parked and disabled.
    for (let i = 0; i < CONFIG.enemy.poolSize; i++) {
      const enemy = this.group.create(0, 0, 'enemy');
      enemy.setActive(false).setVisible(false);
      enemy.body.enable = false;
    }

    this.lastSpawnTime = 0; // timestamp of the most recent spawn
  }

  // How many enemies are currently alive on-screen.
  countActive() {
    return this.group.countActive(true);
  }

  // Activate a pooled enemy at world-x `x`. The y is chosen above the ground so
  // the enemy drops in and lands. Returns the enemy, or null if the pool is full.
  spawnAt(x) {
    const enemy = this.group.getFirstDead(false);
    if (!enemy) return null;

    const y = this.terrain.groundTopY - CONFIG.enemy.size - 120; // drop-in height
    enemy.setActive(true).setVisible(true).setPosition(x, y);
    enemy.body.enable = true;
    enemy.body.setSize(CONFIG.enemy.size, CONFIG.enemy.size);
    enemy.setVelocity(0, 0);
    enemy.health = CONFIG.enemy.health;
    return enemy;
  }

  // Recycle an enemy back into the dormant pool.
  recycle(enemy) {
    enemy.setActive(false).setVisible(false);
    enemy.body.enable = false;
    enemy.setVelocity(0, 0);
  }

  // Damage an enemy; recycle (and report a kill) when its health hits 0.
  // Returns true if the enemy died from this hit.
  damage(enemy, amount = 1) {
    enemy.health -= amount;
    if (enemy.health <= 0) {
      this.recycle(enemy);
      return true;
    }
    return false;
  }

  // Decide whether to spawn a new enemy this frame and, if so, where. Throttled
  // by spawnIntervalMs and capped by the pool size; spawns appear a random
  // distance ahead of the player so they never materialize on top of them.
  maybeSpawn(time, player) {
    if (time - this.lastSpawnTime < CONFIG.enemy.spawnIntervalMs) {
      return;
    }

    if (this.countActive() >= CONFIG.enemy.poolSize) {
      return;
    }

    const spawnDistance = Phaser.Math.Between(CONFIG.enemy.spawnAheadMin, CONFIG.enemy.spawnAheadMax);
    const spawnX = player.x + spawnDistance;

    this.spawnAt(spawnX);
    this.lastSpawnTime = time;
  }

  // Called every frame: spawn (your logic), steer enemies toward the player,
  // and recycle any that fell into a pit or fell far behind the camera.
  update(time, player, scrollX) {
    this.maybeSpawn(time, player);

    const leftEdge = scrollX - CONFIG.enemy.despawnBehind;
    this.group.children.iterate((enemy) => {
      if (!enemy || !enemy.active) return true;

      // Walk horizontally toward the player; gravity handles the vertical.
      const dir = player.x < enemy.x ? -1 : 1;
      enemy.setVelocityX(dir * CONFIG.enemy.speed);

      // Recycle if it fell in a pit or dropped well behind the camera.
      if (enemy.y > this.terrain.worldBottom || enemy.x < leftEdge) {
        this.recycle(enemy);
      }
      return true;
    });
  }
}
