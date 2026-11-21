/** Comic reactions are presentation only: they never alter score, timing, or input. */
const ONSET = 0.42;
const clamp01 = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const finite = (value, fallback) => Number.isFinite(value) ? value : fallback;

export class ReactionMeter {
  constructor({ decayPerSecond = 0.18 } = {}) {
    this.decayPerSecond = Number.isFinite(decayPerSecond) && decayPerSecond >= 0 ? decayPerSecond : 0.18;
    this.reset();
  }

  reset() {
    this.heat = 0;
    this.hits = 0;
    this.lastHitAt = null;
    return this;
  }

  get tier() {
    return this.heat > 0.78 ? 'wild' : this.heat > ONSET ? 'surprised' : 'calm';
  }

  /** Call for accepted face hits only. The frame update owns elapsed-time decay. */
  hit(power = 0, nowMs = 0) {
    this.heat = Math.min(1, clamp01(this.heat) + 0.13 + 0.12 * clamp01(power));
    this.hits += 1;
    this.lastHitAt = Number.isFinite(nowMs) ? nowMs : null;
    return { heat: this.heat, tier: this.tier };
  }

  update(dtSec, { paused = false } = {}) {
    if (!paused && Number.isFinite(dtSec) && dtSec > 0) {
      this.heat = Math.max(0, clamp01(this.heat) - this.decayPerSecond * dtSec);
    }
    return { heat: this.heat, tier: this.tier };
  }
}

/** Logical pixels relative to the face pose; reduced motion keeps a static expression. */
export function eyeReaction(heat, reduceMotion = false) {
  const normalized = clamp01(heat);
  const raw = Math.max(0, (normalized - ONSET) / (1 - ONSET));
  const amount = raw * raw * (3 - 2 * raw);
  return {
    active: normalized > ONSET,
    amount,
    extension: reduceMotion ? 0 : amount * 38,
    scale: 1 + amount * 0.42,
    wobble: reduceMotion ? 0 : amount * 2.4,
  };
}

/** Draw over the surprised sprite, after translating/rotating to its face pose. Time is seconds. */
export function drawComicEyes(ctx, {
  heat,
  time = 0,
  reduceMotion = false,
  eyes = [{ x: -48, y: -42 }, { x: 33, y: -42 }],
} = {}) {
  const reaction = eyeReaction(heat, reduceMotion);
  if (!reaction.active) return reaction;
  const seconds = finite(time, 0);
  ctx.save();
  // Fade into the illustration rather than suddenly replacing the painted eyes.
  ctx.globalAlpha *= Math.min(1, reaction.amount * 8);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  eyes.forEach((eye, index) => {
    const x = finite(eye.x, index ? 33 : -48);
    const y = finite(eye.y, -42);
    const rx = Math.max(4, finite(eye.rx, 17));
    const ry = Math.max(4, finite(eye.ry, 13));
    const direction = index % 2 === 0 ? -1 : 1;
    const wobble = Math.sin(seconds * 17 + index * 1.8) * reaction.wobble;
    const ex = x + direction * (reaction.extension + wobble * 0.55);
    const ey = y - reaction.extension * 0.27 + wobble;
    const radiusX = rx * reaction.scale;
    const radiusY = ry * reaction.scale;

    // A small warm socket covers the original white, keeping eyebrows visible.
    ctx.fillStyle = eye.skin || '#c58a61';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, rx + 3, ry + 2, 0, 0, Math.PI * 2);
    ctx.fill();

    if (reaction.extension > 0.2) {
      // Rounded, cream comic connectors keep the eyes attached without injury imagery.
      ctx.fillStyle = '#fff1d7';
      ctx.strokeStyle = '#38251f';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x, y - ry * 0.62);
      ctx.quadraticCurveTo((x + ex) / 2, y - ry * 0.9, ex, ey - radiusY * 0.68);
      ctx.lineTo(ex, ey + radiusY * 0.68);
      ctx.quadraticCurveTo((x + ex) / 2, y + ry * 0.85, x, y + ry * 0.62);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    ctx.fillStyle = '#fffdf4';
    ctx.strokeStyle = '#28201f';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.ellipse(ex, ey, radiusX, radiusY, direction * reaction.amount * 0.09, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    const pupilX = ex + direction * radiusX * 0.25;
    const pupilY = ey + radiusY * 0.05;
    const iris = Math.max(4, radiusY * 0.55);
    ctx.fillStyle = '#88512d';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(pupilX, pupilY, iris * 0.86, iris, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#211b1a';
    ctx.beginPath();
    ctx.ellipse(pupilX, pupilY, iris * 0.43, iris * 0.64, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(pupilX - iris * 0.22, pupilY - iris * 0.3, iris * 0.22, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
  return reaction;
}

/** Optional little arcade stars above the hair at the strongest comic reaction. */
export function drawDizzyStars(ctx, { heat, time = 0, reduceMotion = false, x = 0, y = -165 } = {}) {
  const intensity = Math.max(0, (clamp01(heat) - 0.78) / 0.22);
  if (intensity === 0) return;
  const seconds = reduceMotion ? 0 : finite(time, 0);
  ctx.save();
  ctx.globalAlpha *= Math.min(1, intensity * 3);
  ctx.fillStyle = '#ffda52';
  ctx.strokeStyle = '#352e32';
  ctx.lineWidth = 1.8;
  for (let i = 0; i < 3; i += 1) {
    const angle = seconds * 2.2 + i * Math.PI * 2 / 3;
    const sx = finite(x, 0) + Math.cos(angle) * 57;
    const sy = finite(y, -165) + Math.sin(angle) * 9;
    ctx.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const a = point * Math.PI / 5 - Math.PI / 2;
      const radius = point % 2 === 0 ? 8 : 3.7;
      const px = sx + Math.cos(a) * radius;
      const py = sy + Math.sin(a) * radius;
      if (point === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}
