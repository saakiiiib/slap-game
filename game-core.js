/** Deterministic game rules, independent of rendering, audio, and browser APIs. */
export const BEST_KEY = 'slap-game.best.v1';

const clock = () => globalThis.performance?.now?.() ?? Date.now();
const clampPower = (value) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;

function browserStorage() {
  try { return globalThis.localStorage; } catch { return undefined; }
}

export class GameSession {
  constructor({ duration = 30000, cooldown = 250, comboWindow = 1500, storage = browserStorage() } = {}) {
    this.duration = Number.isFinite(duration) && duration > 0 ? duration : 30000;
    this.cooldown = Number.isFinite(cooldown) && cooldown >= 0 ? cooldown : 250;
    this.comboWindow = Number.isFinite(comboWindow) && comboWindow >= 0 ? comboWindow : 1500;
    this.storage = storage;
    this.best = 0;
    try {
      const saved = Number(this.storage?.getItem(BEST_KEY));
      if (Number.isFinite(saved) && saved >= 0) this.best = Math.floor(saved);
    } catch { /* Private browsing or unavailable storage must not block play. */ }
    this.reset();
  }

  reset() {
    this.status = 'ready';
    this.mode = 'arcade';
    this.score = 0;
    this.slaps = 0;
    this.attempts = 0;
    this.targetHits = 0;
    this.strongest = 0;
    this.maxCombo = 1;
    this.combo = 1;
    this.targetSide = 'left';
    this.result = null;
    this.deadline = null;
    this._pausedAt = null;
    this._pausedRemaining = null;
    this._lastAttemptAt = -Infinity;
    this._lastTargetAt = null;
    return this;
  }

  start(mode = 'arcade', now = clock()) {
    this.reset();
    this.mode = mode === 'practice' ? 'practice' : 'arcade';
    this.status = 'playing';
    this.deadline = this.mode === 'arcade' ? now + this.duration : null;
    return this;
  }

  remaining(now = clock()) {
    if (this.mode === 'practice') return null;
    if (this.status === 'ready') return this.duration;
    if (this.status === 'over') return 0;
    if (this.status === 'paused') return this._pausedRemaining;
    return Math.max(0, this.deadline - now);
  }

  tick(now = clock()) {
    if (this.status !== 'playing') return this.status;
    if (this.mode === 'arcade' && now >= this.deadline) {
      this.finish(now);
    } else if (this._lastTargetAt !== null && now - this._lastTargetAt > this.comboWindow) {
      this.combo = 1;
      this._lastTargetAt = null;
    }
    return this.status;
  }

  pause(now = clock()) {
    this.tick(now);
    if (this.status !== 'playing') return false;
    this._pausedRemaining = this.remaining(now);
    this._pausedAt = now;
    this.status = 'paused';
    return true;
  }

  resume(now = clock()) {
    if (this.status !== 'paused') return false;
    const pausedFor = Math.max(0, now - this._pausedAt);
    if (this.mode === 'arcade') this.deadline = now + this._pausedRemaining;
    if (this._lastTargetAt !== null) this._lastTargetAt += pausedFor;
    if (Number.isFinite(this._lastAttemptAt)) this._lastAttemptAt += pausedFor;
    this._pausedAt = null;
    this._pausedRemaining = null;
    this.status = 'playing';
    return true;
  }

  attempt({ power = 0, targetHit = false, faceHit = true } = {}, now = clock()) {
    this.tick(now);
    if (this.status !== 'playing') return { accepted: false, reason: this.status };
    if (now - this._lastAttemptAt < this.cooldown) return { accepted: false, reason: 'cooldown' };

    const normalizedPower = clampPower(power);
    const hit = Boolean(faceHit);
    const onTarget = hit && Boolean(targetHit);
    this._lastAttemptAt = now;
    this.attempts += 1;
    let points = 0;

    if (onTarget) {
      const inWindow = this._lastTargetAt !== null && now - this._lastTargetAt <= this.comboWindow;
      this.combo = inWindow ? Math.min(5, this.combo + 1) : 1;
      this._lastTargetAt = now;
      this.targetHits += 1;
      this.targetSide = this.targetSide === 'left' ? 'right' : 'left';
    } else {
      this.combo = 1;
      this._lastTargetAt = null;
    }

    if (hit) {
      this.slaps += 1;
      this.strongest = Math.max(this.strongest, normalizedPower);
      points = (Math.round(20 + 80 * normalizedPower) + (onTarget ? 25 : 0)) * this.combo;
      this.score += points;
      this.maxCombo = Math.max(this.maxCombo, this.combo);
    }

    return { accepted: true, hit, points, power: normalizedPower, combo: this.combo, targetHit: onTarget, targetSide: this.targetSide };
  }

  finish(_now = clock()) {
    if (this.result) return this.result;
    if (this.status === 'ready') return null;
    this.status = 'over';
    const newBest = this.mode === 'arcade' && this.score > this.best;
    if (newBest) {
      this.best = this.score;
      try { this.storage?.setItem(BEST_KEY, String(this.best)); } catch { /* Keep the in-memory best. */ }
    }
    this.result = Object.freeze({
      score: this.score,
      best: this.best,
      newBest,
      accuracy: this.attempts ? this.targetHits / this.attempts * 100 : 0,
      strongest: this.strongest,
      slaps: this.slaps,
      maxCombo: this.maxCombo,
      mode: this.mode,
    });
    return this.result;
  }
}
