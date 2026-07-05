// =============================================================================
// VirtualJoystick.js — a reusable on-screen thumb-stick for touch devices.
//
// One instance owns one half of the screen (left or right). When a finger
// presses inside its zone, the joystick "floats" to that spot, and dragging
// moves the thumb. Releasing resets it. It exposes a single output:
//
//     this.vector = { x, y, angle, force, isActive }
//
//   x, y   : normalized direction, each in [-1, 1] (y negative = up)
//   angle  : direction in radians (atan2(y, x))
//   force  : 0..1 how far the stick is pushed (after dead-zone)
//   isActive : true while a finger controls this stick
//
// This is the SAME shape DesktopControls produces, so the Player treats touch
// and keyboard/mouse identically.
// =============================================================================

import Phaser from 'phaser';
import { CONFIG } from '../config.js';

export default class VirtualJoystick {
  // zone: { x, y, width, height } — the screen rectangle (in camera/screen
  // coords) this stick listens to. Use the left half for movement, right for aim.
  constructor(scene, zone) {
    this.scene = scene;
    this.zone = zone;

    // The output other code reads. Starts neutral.
    this.vector = { x: 0, y: 0, angle: 0, force: 0, isActive: false };

    // Which pointer (finger) currently owns this stick. null when released.
    this.pointerId = null;

    // Where the stick's base is anchored this touch (set on press).
    this.baseX = 0;
    this.baseY = 0;

    // Visuals — fixed to the camera (scrollFactor 0) so they stay on-screen as
    // the world scrolls. Hidden until a finger presses the zone.
    this.base = scene.add
      .image(0, 0, 'joyBase')
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);
    this.thumb = scene.add
      .image(0, 0, 'joyThumb')
      .setScrollFactor(0)
      .setDepth(1001)
      .setVisible(false);

    this.registerInput();
  }

  registerInput() {
    const input = this.scene.input;

    input.on('pointerdown', (pointer) => {
      // Ignore if this stick is already owned, or the touch is outside its zone.
      if (this.pointerId !== null) return;
      if (!this.inZone(pointer)) return;

      this.pointerId = pointer.id;
      this.baseX = pointer.x;
      this.baseY = pointer.y;
      this.base.setPosition(this.baseX, this.baseY).setVisible(true);
      this.thumb.setPosition(this.baseX, this.baseY).setVisible(true);
      this.updateFromOffset(0, 0);
    });

    input.on('pointermove', (pointer) => {
      if (pointer.id !== this.pointerId) return;
      // Offset of the finger from the base center.
      const dx = pointer.x - this.baseX;
      const dy = pointer.y - this.baseY;
      this.updateFromOffset(dx, dy);
    });

    const release = (pointer) => {
      if (pointer.id !== this.pointerId) return;
      this.reset();
    };
    input.on('pointerup', release);
    input.on('pointerupoutside', release);
  }

  // Update the active screen rectangle (called on resize). inZone reads
  // this.zone live, so a fresh finger-press just uses the new bounds.
  setZone(zone) {
    this.zone = zone;
  }

  // Is this pointer inside the stick's screen rectangle?
  inZone(pointer) {
    const z = this.zone;
    return (
      pointer.x >= z.x &&
      pointer.x <= z.x + z.width &&
      pointer.y >= z.y &&
      pointer.y <= z.y + z.height
    );
  }

  // Convert the finger's pixel offset from the base center into the normalized
  // control output (x, y in [-1,1], force in [0,1], angle in radians) and move
  // the thumb sprite to follow the finger, clamped inside the ring. A dead-zone
  // ignores tiny offsets so a resting thumb doesn't drift the player.
  updateFromOffset(dx, dy) {
    const rawDistance = Math.hypot(dx, dy);

    if (rawDistance < CONFIG.joystick.deadZone * CONFIG.joystick.baseRadius) {
      this.vector.x = 0;
      this.vector.y = 0;
      this.vector.force = 0;
      // Snap the knob back to the base center while in the dead-zone.
      this.thumb.setPosition(this.baseX, this.baseY);

      return;
    }

    const clampedDistance = Math.min(rawDistance, CONFIG.joystick.baseRadius);
    const clampedOffset = rawDistance !== 0 ? clampedDistance / rawDistance : 0;
    const clampedDx = dx * clampedOffset;
    const clampedDy = dy * clampedOffset;

    this.vector.x = clampedDx / CONFIG.joystick.baseRadius;
    this.vector.y = clampedDy / CONFIG.joystick.baseRadius;
    this.vector.force = clampedDistance / CONFIG.joystick.baseRadius;
    this.vector.angle = Math.atan2(clampedDy, clampedDx);
    this.vector.isActive = true;

    // Move the knob to follow the finger, clamped inside the ring.
    this.thumb.setPosition(this.baseX + clampedDx, this.baseY + clampedDy);
  }

  // Finger lifted: hide visuals and zero the output so the player stops/idles.
  reset() {
    this.pointerId = null;
    this.base.setVisible(false);
    this.thumb.setVisible(false);
    this.vector.x = 0;
    this.vector.y = 0;
    this.vector.angle = 0;
    this.vector.force = 0;
    this.vector.isActive = false;
  }
}
