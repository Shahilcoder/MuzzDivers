# MuzzDivers

An endless twin-aim platformer shooter for mobile browsers, built with
[Phaser 3](https://phaser.io/) + [Vite](https://vitejs.dev/).

Run forever to the right across procedurally generated ground, jump the pits,
and gun down enemies with a 360° twin-stick aim. Score = distance traveled +
kills. Best score is saved in your browser.

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

## How it's organized

Every file does one job and reads its numbers from `src/config.js` — change the
game's feel by editing that one file.

```
src/
  main.js                 Phaser.Game config (scaling, gravity, scene list)
  config.js               ALL tunable constants — start here to rebalance
  scenes/
    BootScene.js          generates placeholder art (one swap-point for sprites)
    GameScene.js          orchestrates systems, colliders, scoring, game-over
    GameOverScene.js      score + best (localStorage), tap to restart
  objects/
    Player.js             move, jump, aim, fire, health, i-frames
  systems/
    VirtualJoystick.js    reusable dual-stick touch control
    DesktopControls.js    keyboard/mouse fallback (same shape as a joystick)
    TerrainGenerator.js   endless recycled ground + pits
    EnemyManager.js       pooled enemies: spawn ahead, chase, contact damage
    BulletPool.js         pooled bullets: fire along an angle, recycle off-screen
```

## Swapping in real sprites later

All placeholder art is generated at runtime in **`src/scenes/BootScene.js`**.
There is a single clearly-commented `SWAP POINT` there: replace the generated
textures with `this.load.image('player', 'assets/player.png')` etc., keeping the
same texture keys (`player`, `enemy`, `bullet`, `ground`). No other file
references raw art, so nothing else changes.
