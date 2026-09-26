// =============================================================================
// UiButton.js — a minimal tap target. The game had none.
//
// Before this file, src/ contained zero setInteractive() calls: GameOverScene
// listened scene-wide for any tap, and VirtualJoystick hit-tests pointers by
// hand against a rectangle. This follows the joystick's shape rather than
// introducing Phaser's interactive-object system for the first time — same
// manual hit-test, same "owns its own Graphics" structure — because the
// waveform editor has to hit-test manually regardless (a region's edge is not
// a game object), and one pattern in the codebase beats two.
//
//     new UiButton(scene, { x, y, width, height, label, onTap, variant })
//
// x, y is the TOP-LEFT corner. A button ignores taps while disabled, and
// cancels if the finger slides off before release — the behaviour people
// already expect from every other button they've ever pressed.
// =============================================================================

const VARIANTS = {
  primary: { fill: 0x0e7490, fillPressed: 0x155e75, text: '#e0f2fe', border: 0x22d3ee },
  neutral: { fill: 0x334155, fillPressed: 0x1e293b, text: '#cbd5e1', border: 0x475569 },
  danger: { fill: 0x7f1d1d, fillPressed: 0x601515, text: '#fecaca', border: 0xef4444 },
  accent: { fill: 0x166534, fillPressed: 0x14532d, text: '#dcfce7', border: 0x22c55e },
};

export default class UiButton {
  constructor(scene, opts) {
    this.scene = scene;
    this.x = opts.x;
    this.y = opts.y;
    this.width = opts.width;
    this.height = opts.height ?? 56;
    this.radius = opts.radius ?? 8;
    this.onTap = opts.onTap ?? (() => {});
    this.style = VARIANTS[opts.variant ?? 'neutral'];

    this.enabled = opts.enabled !== false;
    this.pressed = false;
    this.pointerId = null;
    this.destroyed = false;

    const depth = opts.depth ?? 10;

    this.g = scene.add.graphics().setScrollFactor(0).setDepth(depth);
    this.text = scene.add
      .text(0, 0, opts.label ?? '', {
        fontFamily: 'monospace',
        fontSize: opts.fontSize ?? '22px',
        color: this.style.text,
        fontStyle: 'bold',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(depth + 1);

    this.registerInput();
    this.redraw();
  }

  registerInput() {
    const input = this.scene.input;

    // Keep bound references so destroy() can detach them. Rebuilding the track
    // list destroys and recreates a page of buttons; leaked listeners would
    // fire against a destroyed Graphics and throw.
    this.onDown = (pointer) => {
      if (this.destroyed || !this.enabled || !this.visible()) return;
      if (this.pointerId !== null) return;
      if (!this.contains(pointer.x, pointer.y)) return;

      this.pointerId = pointer.id;
      this.pressed = true;
      this.redraw();
    };

    this.onUp = (pointer) => {
      if (this.destroyed || pointer.id !== this.pointerId) return;

      const inside = this.contains(pointer.x, pointer.y);
      this.pointerId = null;
      this.pressed = false;
      this.redraw();

      // Fire LAST: onTap often starts another scene, which tears this button
      // down mid-handler.
      if (inside && this.enabled) this.onTap();
    };

    this.onUpOutside = (pointer) => {
      if (this.destroyed || pointer.id !== this.pointerId) return;
      this.pointerId = null;
      this.pressed = false;
      this.redraw();
    };

    // iOS/Android CANCEL touches that system UI steals (the file picker the
    // UPLOAD button opens is exactly that case). Without this, pointerId stays
    // set forever and onDown's `pointerId !== null` guard makes the button
    // permanently dead — the "frozen after selecting a file" bug. Never fires
    // onTap, same as an up-outside.
    this.onCancel = this.onUpOutside;

    input.on('pointerdown', this.onDown);
    input.on('pointerup', this.onUp);
    input.on('pointerupoutside', this.onUpOutside);
    input.on('pointercancel', this.onCancel);
  }

  contains(px, py) {
    return (
      px >= this.x &&
      px <= this.x + this.width &&
      py >= this.y &&
      py <= this.y + this.height
    );
  }

  visible() {
    return this.g.visible;
  }

  redraw() {
    const s = this.style;
    const fill = this.pressed ? s.fillPressed : s.fill;
    const alpha = this.enabled ? 1 : 0.35;

    this.g.clear();
    this.g.fillStyle(fill, alpha);
    this.g.fillRoundedRect(this.x, this.y, this.width, this.height, this.radius);
    this.g.lineStyle(2, s.border, alpha);
    this.g.strokeRoundedRect(this.x, this.y, this.width, this.height, this.radius);

    // Nudge the label down 1px while pressed — the cheapest possible "this
    // registered" feedback, and on a phone the only one that isn't hidden by
    // the thumb pressing it.
    this.text.setPosition(
      this.x + this.width / 2,
      this.y + this.height / 2 + (this.pressed ? 1 : 0)
    );
    this.text.setAlpha(alpha);
  }

  setLabel(label) {
    this.text.setText(label);
    return this;
  }

  setEnabled(enabled) {
    this.enabled = enabled;
    if (!enabled) {
      this.pressed = false;
      this.pointerId = null;
    }
    this.redraw();
    return this;
  }

  setVisible(visible) {
    this.g.setVisible(visible);
    this.text.setVisible(visible);
    if (!visible) {
      this.pressed = false;
      this.pointerId = null;
    }
    return this;
  }

  setPosition(x, y) {
    this.x = x;
    this.y = y;
    this.redraw();
    return this;
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    const input = this.scene.input;
    input.off('pointerdown', this.onDown);
    input.off('pointerup', this.onUp);
    input.off('pointerupoutside', this.onUpOutside);
    input.off('pointercancel', this.onCancel);

    this.g.destroy();
    this.text.destroy();
  }
}
