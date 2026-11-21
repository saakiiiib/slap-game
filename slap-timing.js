// One gesture can have one pending contact. Rendering and audio share this gate.
const finitePoint = point => point && Number.isFinite(point.x) && Number.isFinite(point.y);

export class SlapTiming {
  constructor({ cooldown = 250 } = {}) {
    this.cooldown = Number.isFinite(cooldown) && cooldown >= 0 ? cooldown : 250;
    this.pending = null;
    this.lastScheduledAt = -Infinity;
    this.lastContactAt = -Infinity;
    this.pausedAt = null;
  }

  schedule(hit, now, { delayMs = 100 } = {}) {
    if (!hit || typeof hit !== 'object' || !finitePoint(hit.point) ||
        (hit.from !== undefined && !finitePoint(hit.from)) ||
        !Number.isFinite(hit.power) || hit.power < 0 || hit.power > 1 ||
        ![-1, 1].includes(hit.direction) || hit.valid === false ||
        !Number.isFinite(now) || !Number.isFinite(delayMs) || delayMs < 0 ||
        !Number.isFinite(now + delayMs) || this.pending || this.pausedAt !== null ||
        now - this.lastScheduledAt < this.cooldown ||
        now + delayMs - this.lastContactAt < this.cooldown) return false;

    // Inputs continue changing while the hand travels. Preserve this gesture's
    // contact and approach coordinates until its single impact is consumed.
    const snapshot = { ...hit, point: { ...hit.point } };
    if (hit.from !== undefined) snapshot.from = { ...hit.from };
    this.pending = { dueAt: now + delayMs, hit: snapshot };
    this.lastScheduledAt = now;
    this.lastContactAt = now + delayMs;
    return true;
  }

  take(now) {
    if (!Number.isFinite(now) || !this.pending || now < this.pending.dueAt) return null;
    const { hit } = this.pending;
    this.pending = null;
    return hit;
  }

  pause(now) {
    if (!Number.isFinite(now)) return false;
    this.pending = null;
    if (this.pausedAt === null) this.pausedAt = now;
    return true;
  }

  resume(now) {
    if (this.pausedAt === null || !Number.isFinite(now) || now < this.pausedAt) return false;
    if (Number.isFinite(this.lastScheduledAt)) this.lastScheduledAt += now - this.pausedAt;
    if (Number.isFinite(this.lastContactAt)) this.lastContactAt += now - this.pausedAt;
    this.pausedAt = null;
    return true;
  }

  clear({ resetCooldown = false } = {}) {
    this.pending = null;
    if (resetCooldown) {
      this.lastScheduledAt = -Infinity;
      this.lastContactAt = -Infinity;
      this.pausedAt = null;
    }
    return this;
  }
}
