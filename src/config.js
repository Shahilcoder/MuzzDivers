// =============================================================================
// config.js — ALL tunable game constants live here.
//
// Want the game to feel different? Change a number in this file. No game logic
// is hidden anywhere else — every system reads its knobs from here. This is the
// single place to balance difficulty, speed, and "game feel".
// =============================================================================

export const CONFIG = {
  // --- World / rendering -----------------------------------------------------
  // The internal resolution the game renders at. Phaser's Scale Manager fits
  // this to the device screen (letterboxing as needed), so logic never has to
  // care about the real pixel size. Landscape-shaped on purpose.
  width: 1280,
  height: 720,
  backgroundColor: '#1a1a2e',

  // --- Physics ---------------------------------------------------------------
  gravity: 1400, // downward pull (px/s^2). Higher = heavier, snappier falls.

  // --- Player ----------------------------------------------------------------
  player: {
    size: 48, // width & height of the placeholder square
    moveSpeed: 320, // max horizontal speed (px/s) at full stick deflection
    jumpVelocity: -680, // upward impulse on jump (negative = up)
    jumpThreshold: 0.5, // left-stick Y must exceed this (pushed up) to jump
    maxHealth: 100,
    contactDamage: 25, // HP lost per enemy touch
    invincibleMs: 1000, // i-frames after a hit (stops instant death)
    startX: 200, // spawn position
    startY: 300,
  },

  // --- Bullets ---------------------------------------------------------------
  bullet: {
    size: 12,
    speed: 1200, // travel speed (px/s)
    fireRateMs: 540, // minimum gap between shots (cooldown)
    poolSize: 40, // how many bullets exist in the recycle pool
    lifespanMs: 1500, // auto-recycle after this long in flight
  },

  // --- Super mode (toggle) ---------------------------------------------------
  superMode: {
    speedMultiplier: 2.0, // moveSpeed 320 -> 640 px/s while active
    fireRateDivisor: 6.0, // fireRateMs 540 -> 90 ms while active (higher = faster)
  },

  // --- Enemies ---------------------------------------------------------------
  enemy: {
    size: 44,
    speed: 110, // walk speed toward the player (px/s)
    poolSize: 20,
    health: 1, // hits to kill
    spawnIntervalMs: 1200, // minimum time between spawn attempts
    spawnAheadMin: 500, // spawn this far ahead of the player (min)
    spawnAheadMax: 900, // ...to this far ahead (max)
    despawnBehind: 700, // recycle once this far behind the camera
  },

  // --- Terrain (endless ground + pits) --------------------------------------
  terrain: {
    tileSize: 64, // one ground tile is this wide & tall
    groundRows: 3, // how many tile rows thick the ground is
    chunkTiles: 6, // tiles generated per "chunk" step
    pitChance: 0.18, // probability a chunk is a pit (gap) instead of ground
    pitTilesMin: 2, // a pit is this many tiles wide (min)
    pitTilesMax: 3, // ...to this many (max)
    generateAhead: 1600, // keep ground generated this far past the camera edge
    safeStartTiles: 14, // guaranteed solid tiles at the start (no early pits)
  },

  // --- Scoring ---------------------------------------------------------------
  scoring: {
    distanceDivisor: 50, // score = floor(maxDistance / this) + kills * killPoints
    killPoints: 10,
    bestScoreKey: 'muzzdivers.bestScore', // localStorage key
  },

  // --- Virtual joysticks -----------------------------------------------------
  joystick: {
    baseRadius: 70, // outer ring radius (the area you can drag within)
    thumbRadius: 35, // inner draggable knob radius
    deadZone: 0.15, // ignore tiny deflections (0..1 of base radius)
    baseAlpha: 0.35, // translucency so the joystick doesn't hide gameplay
  },
};
