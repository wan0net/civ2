/**
 * Renderer — canvas setup and main render/update loop.
 *
 * Owns the <canvas> element, handles resize, dispatches to screen-specific
 * renderers (MapRenderer, CityScreen, etc.), and drives requestAnimationFrame.
 */



export class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {SpriteManager} spriteManager
   */
  constructor(canvas, spriteManager) {
    this.canvas  = canvas;
    this.ctx     = canvas.getContext('2d');
    this.sprites = spriteManager;

    /** Active screen renderer (set via setScreen) */
    this._screen = null;
    this._running = false;
    this._lastTs  = 0;

    this._onResize = this._onResize.bind(this);
    this._loop     = this._loop.bind(this);

    window.addEventListener('resize', this._onResize);
    this._onResize();
  }

  /**
   * Set the active screen renderer.  Must expose .update() and .render(ctx, w, h).
   * @param {object} screen
   */
  setScreen(screen) {
    this._screen = screen;
  }

  /** Start the render loop. */
  start() {
    if (this._running) return;
    this._running = true;
    requestAnimationFrame(this._loop);
  }

  /** Stop the render loop. */
  stop() {
    this._running = false;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  _onResize() {
    this.canvas.width  = window.innerWidth;
    this.canvas.height = window.innerHeight;

    // Disable smoothing for pixel-art crispness
    this.ctx.imageSmoothingEnabled = false;
  }

  _loop(ts) {
    if (!this._running) return;

    if (this._screen) {
      // Cap dt to avoid huge jumps on first frame (ts - 0 = page uptime)
      const dt = this._lastTs === 0 ? 0 : Math.min(ts - this._lastTs, 100);
      // Re-assert after any ctx.restore() that may have reset it
      this.ctx.imageSmoothingEnabled = false;
      this._screen.update(dt);
      this._screen.render(this.ctx, this.canvas.width, this.canvas.height);
    }

    this._lastTs = ts;
    requestAnimationFrame(this._loop);
  }
}
