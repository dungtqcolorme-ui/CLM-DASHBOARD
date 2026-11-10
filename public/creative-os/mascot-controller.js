/* Standalone application-state controller. No DOM, canvas, or timer loop. */
(function (scope) {
  'use strict';
  const STATES = new Set(('IDLE BLINK CURIOUS LOOK_LEFT LOOK_RIGHT LOOK_UP THINKING LOADING PEEK HAPPY EXCITED SUCCESS WARNING OOPS SLEEPY CREATIVE CELEBRATE FOCUS_MODE').split(' '));
  const EVENTS = Object.freeze({
    DATA_LOADING: ['THINKING', 2, 0], DATA_READY: ['IDLE', 2, 0],
    NO_RESULTS: ['CURIOUS', 1, 0], ACTION_SUCCESS: ['SUCCESS', 3, 600],
    TASK_COMPLETED: ['SUCCESS', 3, 600], DEAL_SIGNED: ['CELEBRATE', 3, 800],
    DEADLINE_APPROACHING: ['WARNING', 4, 800], ERROR: ['OOPS', 5, 800],
    CREATIVE_ACTION: ['CREATIVE', 2, 580], FOCUS: ['FOCUS_MODE', 6, 0],
  });
  class MascotController {
    constructor(options = {}) {
      this.state = 'IDLE'; this.presence = 1; this.look = {x: 0, y: 0};
      this.reducedMotion = Boolean(options.reducedMotion);
      this.now = options.now || Date.now;
      this.schedule = options.schedule || ((callback, delay) => scope.setTimeout(callback, delay));
      this.cancel = options.cancel || (timer => scope.clearTimeout(timer));
      this.listeners = new Set(); this.priority = 0; this.timer = null;
      this.lastEvent = ''; this.lastAt = -Infinity; this.destroyed = false;
    }
    emit() {
      if (!this.destroyed) this.listeners.forEach(fn => fn(this));
    }
    clearReaction() {
      if (this.timer !== null) this.cancel(this.timer);
      this.timer = null;
    }
    setState(state) {
      state = String(state).toUpperCase();
      if (this.destroyed || !STATES.has(state) || (!this.presence && state !== 'FOCUS_MODE')) return false;
      this.clearReaction(); this.priority = 0; this.state = state; this.emit(); return true;
    }
    dispatch(event) {
      if (this.destroyed || !this.presence || !EVENTS[event]) return false;
      const [state, priority, duration] = EVENTS[event], now = this.now();
      if (priority < this.priority || (event === this.lastEvent && now - this.lastAt < 350)) return false;
      this.clearReaction(); this.lastEvent = event; this.lastAt = now;
      this.state = state; this.priority = duration ? priority : 0; this.emit();
      if (duration) this.timer = this.schedule(() => {
        this.timer = null; this.priority = 0;
        this.state = this.presence ? 'IDLE' : 'FOCUS_MODE'; this.emit();
      }, duration);
      return true;
    }
    lookAt(x, y) {
      if (this.destroyed || !this.presence || this.reducedMotion) return;
      const clamp = value => Math.max(-3, Math.min(3, Number(value) || 0));
      this.look = {x: clamp(x), y: clamp(y)}; this.emit();
    }
    peek(side = 'left') { this.peekSide = side === 'right' ? 'right' : 'left'; return this.setState('PEEK'); }
    celebrate() { return this.dispatch('DEAL_SIGNED'); }
    setPresence(level) {
      if (this.destroyed) return;
      const next = Math.max(0, Math.min(2, Number(level) || 0));
      if (next === this.presence) return;
      this.presence = next; this.clearReaction(); this.priority = 0;
      this.look = {x: 0, y: 0}; this.state = next ? 'IDLE' : 'FOCUS_MODE'; this.emit();
    }
    subscribe(listener) {
      if (this.destroyed) return () => {};
      this.listeners.add(listener); listener(this);
      return () => this.listeners.delete(listener);
    }
    destroy() { this.clearReaction(); this.listeners.clear(); this.destroyed = true; }
  }
  scope.CLMMascot = Object.freeze({MascotController, EVENTS});
})(globalThis);
