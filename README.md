# MuzzDivers

An endless twin-aim platformer shooter for mobile browsers, built with
[Phaser 3](https://phaser.io/) + [Vite](https://vitejs.dev/).

Run forever to the right across procedurally generated ground, jump the pits,
and gun down enemies with a 360° twin-stick aim. Score = distance traveled +
kills. Best score is saved in your browser.

**Super mode is driven by the music.** Mark the drops in a track and the player
gets double speed and a 6x fire rate for exactly those stretches. Bring your own
song, drag out the windows on its waveform, and it's remembered next time.

## Run it

```bash
npm install
npm run dev
```

Open the printed **Local** URL on a computer, or the **Network** URL on a phone
connected to the same Wi-Fi.

```bash
npm run build     # production build into dist/
npm run preview   # serve the production build
```

## Controls

**Touch (primary):**
- **Left half of screen** — movement joystick. Push up to jump.
- **Right half of screen** — aim joystick. Wherever you aim, the gun fires.
- Both thumbs work at once (move + shoot simultaneously).

**Desktop (dev fallback):**
- **WASD / Arrow keys** — move; up = jump.
- **Mouse** — aim. **Hold left mouse button** — fire.

## Your own music

The game opens on a track list. Row one is the bundled track, ready to play. To
use your own:

1. **+ UPLOAD TRACK** — pick any audio file (20 MB limit).
2. **EDIT** on the new row — the waveform editor opens.
3. **Drag across the waveform** to paint a super-mode window. Drag its edges to
   resize; tap a window to select it, then use the `-0.5` / `+0.5` buttons to
   place each edge exactly. The strip *below* the waveform seeks the preview —
   the waveform body only ever paints, so the two gestures can't be confused.
4. **PLAY** the preview and watch the `SUPER` pill: it uses the same check the
   game does, so what lights up here is what happens in the run.
5. **SAVE WINDOWS**, then **BACK** → **PLAY**.

Tracks and their windows live in IndexedDB, so they survive a reload. In private
browsing the list says so and uploads last for the session only. The bundled
track is not editable — its windows are hardcoded in `CONFIG.music.superWindows`.

## How it's organized

Every file does one job and reads its numbers from `src/config.js` — change the
game's feel by editing that one file.

```
src/
  main.js                 Phaser.Game config (scaling, gravity, scene list)
  config.js               ALL tunable constants — start here to rebalance
  scenes/
    BootScene.js          generates placeholder art (one swap-point for sprites)
    TrackSelectScene.js   track list: bundled default, upload, play, edit, delete
    TrackEditorScene.js   waveform editor: preview playback + window authoring
    GameScene.js          orchestrates systems, colliders, scoring, game-over
    GameOverScene.js      score + best (localStorage), RETRY / CHANGE TRACK
  objects/
    Player.js             move, jump, aim, fire, health, i-frames
  systems/
    VirtualJoystick.js    reusable dual-stick touch control
    DesktopControls.js    keyboard/mouse fallback (same shape as a joystick)
    TerrainGenerator.js   endless recycled ground + pits
    EnemyManager.js       pooled enemies: spawn ahead, chase, contact damage
    BulletPool.js         pooled bullets: fire along an angle, recycle off-screen
    SuperModeEffects.js   aura/trail/tint/squash juice while super is active
    trackSource.js        the ONE place "bundled track" vs "upload" differs
    TrackStore.js         IndexedDB CRUD for saved tracks + selected-track pointer
    AudioPeaks.js         decode an upload into a drawable loudness silhouette
    SuperWindows.js       pure region math (clamp / merge / hit-test) — no Phaser
    WaveformView.js       Phaser waveform widget: draws + owns the drag gestures
    UiButton.js           minimal tap-target button
```

Scene flow:

```
BootScene ──▶ TrackSelectScene ──▶ GameScene ──▶ GameOverScene
                   │  ▲                               │
                   ▼  └───────────── RETRY / CHANGE ───┘
            TrackEditorScene
```

The chosen track lives in Phaser's game-wide **registry**, not in scene init
data — that's what makes `RETRY` after death replay the same song, since
`GameOverScene` restarts `GameScene` with no arguments.

## Swapping in real sprites later

All placeholder art is generated at runtime in **`src/scenes/BootScene.js`**.
There is a single clearly-commented `SWAP POINT` there: replace the generated
textures with `this.load.image('player', 'assets/player.png')` etc., keeping the
same texture keys (`player`, `enemy`, `bullet`, `ground`). No other file
references raw art, so nothing else changes.
