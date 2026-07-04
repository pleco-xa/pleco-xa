//GibClock.js
export class GibClock {
  constructor(intervalMs) {
    this.intervalMs = intervalMs;
    /** @type {ReturnType<typeof setTimeout>|null} */
    this.timer = null;
    this.listeners = new Set();
    this.nextTime = 0;
  }

  onTick(callback) {
    if (typeof callback === 'function') this.listeners.add(callback);
  }

  offTick(callback) {
    this.listeners.delete(callback);
  }

  start(callback) {
    if (callback) this.onTick(callback);
    if (this.timer) return;
    this.nextTime = performance.now() + this.intervalMs;
    this.timer = setTimeout(() => this._tick(), this.intervalMs);
  }

  _tick() {
    for (const cb of this.listeners) cb();
    const now = performance.now();
    this.nextTime += this.intervalMs;
    const delay = Math.max(0, this.nextTime - now);
    this.timer = setTimeout(() => this._tick(), delay);
  }

  stop() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
