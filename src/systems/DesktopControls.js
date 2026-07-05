// =============================================================================
// DesktopControls.js — keyboard + mouse fallback for development on a computer.
//
// It produces the EXACT same shape a VirtualJoystick exposes:
//   { x, y, angle, force, isActive }
// so the Player never knows or cares whether input came from thumbs or a laptop.
// This is the "code to an interface, not an implementation" idea in practice.
//
//   - Left stick  = WASD / arrow keys (up = jump)
//   - Right stick = mouse position relative to the player (aim); held button fires
// =============================================================================

import Phaser from 'phaser';

export default class DesktopControls {
  constructor(scene) {
    this.scene = scene;
    this.keys = scene.input.keyboard.addKeys({
      up: 'W',
      left: 'A',
      down: 'S',
      right: 'D',
      arrowUp: 'UP',
      arrowLeft: 'LEFT',
      arrowDown: 'DOWN',
      arrowRight: 'RIGHT',
    });
  }

  // Build the left-stick vector from the directional keys.
  getLeftStick() {
    const k = this.keys;
    let x = 0;
    let y = 0;
    if (k.left.isDown || k.arrowLeft.isDown) x -= 1;
    if (k.right.isDown || k.arrowRight.isDown) x += 1;
    if (k.up.isDown || k.arrowUp.isDown) y -= 1; // up is negative, like a joystick
    if (k.down.isDown || k.arrowDown.isDown) y += 1;

    const active = x !== 0 || y !== 0;
    return {
      x,
      y,
      angle: Math.atan2(y, x),
      force: active ? 1 : 0,
      isActive: active,
    };
  }

  // Build the right-stick vector by aiming from the player toward the mouse.
  // Firing happens while the mouse button is held (isActive true).
  getRightStick(player) {
    const pointer = this.scene.input.activePointer;
    // Convert pointer (screen space) to world space so aim is correct while the
    // camera scrolls.
    const world = pointer.positionToCamera(this.scene.cameras.main);
    const dx = world.x - player.x;
    const dy = world.y - player.y;
    const angle = Math.atan2(dy, dx);
    // Only a held MOUSE button fires. `wasTouch` guards against touch pointers:
    // on a phone the left-stick thumb is a "down" pointer too, and without this
    // check it would phantom-fire toward that thumb while you're just moving.
    const firing = pointer.isDown && !pointer.wasTouch;

    return {
      x: Math.cos(angle),
      y: Math.sin(angle),
      angle,
      force: 1,
      isActive: firing,
    };
  }
}
