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

  // --- Super mode (how strong) ----------------------------------------------
  superMode: {
    speedMultiplier: 2.0, // moveSpeed 320 -> 640 px/s while active
    fireRateDivisor: 6.0, // fireRateMs 540 -> 90 ms while active (higher = faster)

    // Visual "juice" for the powered-up state. A single intensity (0->1) ramps
    // all of these in/out together so toggling off restores the plain player
    // cleanly. Owned entirely by src/systems/SuperModeEffects.js.
    effects: {
      rampMs: 200, // how long intensity takes to ramp 0<->1 on toggle
      pulseMs: 600, // period of the gentle "breathe" while active

      // Afterimage / motion trail (a recycled pool of tinted player ghosts).
      trailPoolSize: 12, // ghosts pre-created once, then recycled
      trailSpawnMs: 40, // min gap between spawning ghosts
      trailFadeMs: 300, // each ghost fades alpha->0 over this long
      trailMinSpeed: 40, // only trail when moving faster than this (px/s)
      trailAlpha: 0.5, // starting alpha of a fresh ghost (before intensity)

      // Aura — a soft additive glow that follows and pulses around the player.
      auraScale: 1.9, // aura diameter as a multiple of player size
      auraAlpha: 0.6, // peak aura alpha (before intensity)

      // Squash & stretch — how far velocity can deform the sprite (0..1).
      maxStretch: 0.25,

      // Tint pulse — player color breathes between these two cyans.
      tintFrom: 0x22d3ee, // base cyan (matches the player texture)
      tintTo: 0x67e8f9, // brighter cyan at the pulse peak

      // Camera shake fired on each shot while super is active.
      shakeMs: 60,
      shakeIntensity: 0.004,

      accent: 0x38bdf8, // aura + trail tint color
    },
  },

  // --- Music (the track + when it drives super mode) ------------------------
  // superMode above is "how strong"; this block owns "which track + when".
  music: {
    key: 'music',
    loop: true,
    volume: 0.6,
    // Playback-time windows (seconds) where super mode is active.
    // 00:38–01:17 and 02:08–02:46 of the current track.
    superWindows: [
      { start: 38, end: 77 },
      { start: 128, end: 166 },
    ],
  },

  // --- Custom tracks (upload your own music, author its super windows) ------
  // The block above owns the ONE bundled track. This block owns everything
  // about player-supplied tracks: where they're stored, how they're decoded
  // into a drawable waveform, and how the editor looks/feels.
  tracks: {
    // IndexedDB — holds the uploaded audio Blob, its cached peaks, and its
    // authored super windows. One object store keyed by track id.
    dbName: 'muzzdivers',
    dbVersion: 1,
    storeName: 'tracks',

    // Which track to play, remembered across sessions. Same localStorage
    // convention as scoring.bestScoreKey above. Holds a track id, or the
    // sentinel defaultId for the bundled track.
    selectedKey: 'muzzdivers.selectedTrackId',
    defaultId: 'default',

    // Rejected before we even try to decode — a huge file would blow memory
    // in decodeAudioData long before it became a playable track.
    maxFileMb: 20,

    // How many magnitude samples we reduce the whole song down to. One
    // symmetric value per bucket (the waveform is drawn mirrored about a
    // centerline, so a min/max pair buys nothing). 1600 always exceeds the
    // canvas width, so drawing downsamples per column rather than stretching.
    peakBuckets: 1600,

    // Track list is PAGED, not scrolled — see TrackSelectScene. index.html
    // sets `touch-action: none` globally, so there is no native scrolling to
    // lean on and a drag-scroll container would be new machinery for nothing.
    listPageSize: 3,

    // --- Waveform editor -----------------------------------------------------
    editor: {
      waveformHeight: 230, // the paintable waveform body
      scrubHeight: 46, // the seek-only strip beneath it

      // Scale.FIT shrinks the design space to the device (~0.54x on a typical
      // landscape phone), so this 48 becomes ~26 real px. Anything smaller is
      // not grabbable with a thumb. Pair with the nudge buttons for precision.
      handleGrabPx: 48,

      minWindowSec: 1.0, // shorter drags are discarded as accidental taps
      mergeGapSec: 0.05, // regions this close (or overlapping) fuse into one
      nudgeSec: 0.5, // how far one +/- button press moves a selected edge

      // Colors
      waveColor: 0x64748b, // the silhouette
      rulerColor: 0x475569,
      rulerTextColor: '#94a3b8',
      regionFill: 0x16a34a, // a super-mode window
      regionAlpha: 0.35, // translucent so the waveform reads through it
      regionEdge: 0x4ade80,
      selectedFill: 0xfde047, // the region currently in the nudge panel
      selectedAlpha: 0.3,
      playhead: 0xf472b6,
      scrubTrack: 0x334155,
      scrubFill: 0x22d3ee,
    },
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
