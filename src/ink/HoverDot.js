// The dot that shows where the Pencil is while it hovers above the screen
// (or the eraser circle). With an Apple Pencil Pro the iPad reports the hover
// position up to 240 times a second, for as long as you write, so this has to
// be cheap: the dot is moved at most once per frame, with a transform (no
// layout, no repaint of what's under it), and only what changed is written.
export class HoverDot {
  constructor(el, container) {
    this.el = el;
    this.container = container;
    this.box = null; // where the container is on screen
    this.frame = 0;
    this.next = null; // { x, y, look } or null (hidden)
    this.shown = { visible: false, cls: '', size: 0, color: null };
  }

  /**
   * look: null to hide it, { eraser: true }, or { diameter, color } (screen px).
   */
  show(clientX, clientY, look) {
    this.next = look && clientX !== null ? { x: clientX, y: clientY, look } : null;
    if (!this.frame) this.frame = requestAnimationFrame(() => this.apply());
  }

  hide() {
    this.show(null, null, null);
  }

  // The container moved or changed size (e.g. the iPad was rotated).
  invalidate() {
    this.box = null;
  }

  apply() {
    this.frame = 0;
    const { el, next, shown } = this;
    if (!next) {
      if (shown.visible) {
        el.style.display = 'none';
        shown.visible = false;
      }
      return;
    }
    // Measured when the dot appears, not on every move (that forces a layout).
    if (!this.box || !shown.visible) this.box = this.container.getBoundingClientRect();
    const { look } = next;
    const cls = look.eraser ? 'hover-dot eraser' : 'hover-dot';
    if (cls !== shown.cls) el.className = shown.cls = cls;
    const size = look.eraser ? 24 : Math.max(4, Math.round(look.diameter * 2) / 2);
    if (size !== shown.size) {
      el.style.width = el.style.height = `${size}px`;
      shown.size = size;
    }
    const color = look.eraser ? '' : look.color;
    if (color !== shown.color) el.style.background = shown.color = color;
    const x = next.x - this.box.left - size / 2;
    const y = next.y - this.box.top - size / 2;
    el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    if (!shown.visible) {
      el.style.display = 'block';
      shown.visible = true;
    }
  }

  destroy() {
    cancelAnimationFrame(this.frame);
  }
}
