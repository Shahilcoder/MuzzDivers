// =============================================================================
// TerrainGenerator.js — endless ground that scrolls forever to the right.
//
// The world is built one tile-column at a time as the camera advances. We never
// create/destroy tiles during play: a fixed pool of ground sprites is recycled —
// tiles that scroll off the left edge are reused to build new ground on the
// right. This keeps the framerate steady on mobile.
//
// Some columns are intentionally left empty to form PITS (gaps) the player must
// jump over; falling into one ends the run (GameScene checks player.y).
// =============================================================================

import Phaser from 'phaser';
import { CONFIG } from '../config.js';

export default class TerrainGenerator {
  constructor(scene) {
    this.scene = scene;
    const t = CONFIG.terrain;
    this.tileSize = t.tileSize;

    // A static physics group — ground doesn't move under physics, but we move
    // tiles manually (with refreshBody) when recycling them.
    this.group = scene.physics.add.staticGroup();

    // The ground's top surface sits `groundRows` tiles up from the bottom.
    this.groundTopY = CONFIG.height - t.groundRows * t.tileSize;

    // Anything below this world-Y counts as "fell into a pit".
    this.worldBottom = CONFIG.height + t.tileSize * 2;

    // World-X up to which ground has been generated (next column starts here).
    this.cursorX = 0;
    // How many tile-columns we've produced so far (for the safe-start zone).
    this.columnsGenerated = 0;
    // Prevent two pits in a row so gaps are always crossable.
    this.lastWasPit = false;

    // Pre-fill enough ground to cover the first screen. The view width is now
    // dynamic (matches the device aspect), so read the live scale width.
    this.generateUntil(scene.scale.width + t.generateAhead);
  }

  // Grab a recycled (inactive) tile if one exists, else make a new one.
  placeTile(x, y) {
    let tile = this.group.getFirstDead(false);
    if (tile) {
      tile.setActive(true).setVisible(true).setPosition(x, y);
      tile.body.enable = true;
    } else {
      tile = this.group.create(x, y, 'ground').setOrigin(0, 0);
    }
    tile.refreshBody(); // sync the static body to the tile's new position
    return tile;
  }

  // Put tiles back in the pool (still members of the group, just dormant).
  recycleTile(tile) {
    tile.setActive(false).setVisible(false);
    tile.body.enable = false;
  }

  // Fill one solid chunk: `chunkTiles` columns, each `groundRows` tiles tall.
  generateSolidChunk() {
    const t = CONFIG.terrain;
    for (let c = 0; c < t.chunkTiles; c++) {
      const x = this.cursorX;
      for (let r = 0; r < t.groundRows; r++) {
        const y = this.groundTopY + r * t.tileSize;
        this.placeTile(x, y);
      }
      this.cursorX += t.tileSize;
      this.columnsGenerated += 1;
    }
    this.lastWasPit = false;
  }

  // Leave a gap: advance the cursor past a few columns without placing tiles.
  generatePit() {
    const t = CONFIG.terrain;
    const widthTiles = Phaser.Math.Between(t.pitTilesMin, t.pitTilesMax);
    this.cursorX += widthTiles * t.tileSize;
    this.columnsGenerated += widthTiles;
    this.lastWasPit = true;
  }

  // Decide what the next stretch of terrain is and build it.
  generateNextChunk() {
    const t = CONFIG.terrain;
    const inSafeZone = this.columnsGenerated < t.safeStartTiles;
    const roll = Phaser.Math.FloatBetween(0, 1);

    if (inSafeZone || this.lastWasPit || roll > t.pitChance) {
      this.generateSolidChunk();
    } else {
      this.generatePit();
    }
  }

  // Keep generating chunks until the world extends to `targetX`.
  generateUntil(targetX) {
    while (this.cursorX < targetX) {
      this.generateNextChunk();
    }
  }

  // Called every frame: extend ground ahead of the camera, recycle behind it.
  update(scrollX) {
    const t = CONFIG.terrain;
    this.generateUntil(scrollX + this.scene.scale.width + t.generateAhead);

    const leftEdge = scrollX - this.tileSize * 2;
    this.group.children.iterate((tile) => {
      if (!tile || !tile.active) return true;
      if (tile.x + this.tileSize < leftEdge) this.recycleTile(tile);
      return true;
    });
  }
}
