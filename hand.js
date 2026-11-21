/** Keep the face, sound, and score on this shared moment of visible contact. */
export const HAND_CONTACT_MS = 100;
export const HAND_ASSET = './assets/hand/slapping-hand-v2.png';

const clamp01 = value => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const mix = (a, b, t) => a + (b - a) * t;
const smooth = value => value * value * (3 - 2 * value);
const normalMotion = options => !options.reduceMotion && !options.reducedMotion;
const normalize = ({ x, y, direction, power } = {}) => ({
  x: finite(x), y: finite(y), direction: direction < 0 ? -1 : 1, power: clamp01(power),
});

export class HandAnimator {
  constructor() {
    this.clear();
  }

  /** A smaller, edge-on hand follows a captured drag or keyboard charge. */
  follow(point = {}, nowMs = 0) {
    this.following = { ...normalize(point), at: finite(nowMs) };
    this.striking = null;
    return this;
  }

  /** Releasing pointer capture must not erase a strike that is in flight. */
  endFollow() {
    this.following = null;
    return this;
  }

  strike(point = {}, nowMs = 0, options = {}) {
    const target = normalize(point);
    const candidate = options.from || this.following;
    // A fast gesture can end beyond the cheek. Always approach from its incoming
    // side, rather than dragging the hand backward through the face.
    const sensibleFrom = Number.isFinite(candidate?.x) && Number.isFinite(candidate?.y)
      && (target.x - candidate.x) * target.direction >= 24
      && (target.x - candidate.x) * target.direction <= 240
      && Math.abs(target.y - candidate.y) <= 160;
    const from = sensibleFrom ? { x: candidate.x, y: candidate.y } : {
      x: target.x - target.direction * (120 + target.power * 24), y: target.y + 32,
    };
    this.following = null;
    this.striking = {
      ...target, from, at: finite(nowMs), reducedMotion: !normalMotion(options),
    };
    return this;
  }

  clear() {
    this.following = null;
    this.striking = null;
    return this;
  }

  /** Logical canvas coordinates. Direction +1 swings from left to right. */
  pose(nowMs = 0, options = {}) {
    const source = this.following || this.striking;
    if (!source) return null;
    const { x, y, direction, power } = source;
    const base = {
      x, y, direction, power, angle: direction * 0.92,
      scale: 1, scaleX: 1, scaleY: 1,
      alpha: 1, contact: false, trail: 0,
    };
    if (this.following) return {
      ...base, phase: 'following', angle: direction * 1.12,
      scale: 0.9, scaleX: 0.48, alpha: 0.76,
    };

    const age = finite(nowMs, source.at) - source.at;
    if (age < 0) return null;
    if (source.reducedMotion || !normalMotion(options)) {
      if (age >= 140) return null;
      return {
        ...base, phase: 'contact', contact: true, scaleX: 1,
        alpha: 1 - clamp01((age - 90) / 50),
      };
    }
    if (age >= 430) return null;

    if (age < 18) {
      const t = smooth(age / 18);
      return {
        ...base, phase: 'anticipation', x: source.from.x - direction * 7 * t,
        y: source.from.y + 3 * t, angle: direction * (1.12 + 0.05 * t),
        scaleX: 0.48, alpha: 0.86,
      };
    }
    if (age < HAND_CONTACT_MS) {
      const t = (age - 18) / (HAND_CONTACT_MS - 18);
      const travel = t * t; // Accelerate into the cheek; avoid a floating glide.
      return {
        ...base, phase: 'approach',
        x: mix(source.from.x - direction * 7, x, travel),
        y: mix(source.from.y + 3, y, travel),
        angle: direction * mix(1.17, 0.92, travel),
        scaleX: mix(0.48, 1, travel), alpha: mix(0.86, 1, travel),
      };
    }

    const reach = 33 + power * 17;
    if (age < 165) {
      const t = (age - HAND_CONTACT_MS) / 65;
      return {
        ...base, phase: age < 120 ? 'contact' : 'follow-through',
        x: x + direction * reach * t,
        y: y + 8 * t * t,
        angle: direction * mix(0.92, 0.8, t),
        scaleX: mix(1, 0.95, t), contact: age < 148,
      };
    }

    const t = (age - 165) / 265;
    return {
      ...base, phase: 'exit',
      // Continue across the cheek and down in one swing, never snap back.
      x: x + direction * (reach + (105 + power * 25) * t),
      y: y + 8 + 340 * t * t,
      angle: direction * mix(0.8, 0.3, smooth(t)),
      scaleX: mix(0.95, 0.48, t),
      alpha: 1 - smooth(clamp01((age - 235) / 195)),
    };
  }
}

/** Preserve the hand's proportions, extending only its painted forearm offstage. */
export function drawSlappingHand(ctx, {
  image, pose, width = 145, pivot = { x: 0.5, y: 0.3 }, forearmSplit = 0.5, forearmLength = 650,
} = {}) {
  if (!pose || !Number.isFinite(pose.x) || !Number.isFinite(pose.y)) return;
  const alpha = clamp01(pose.alpha);
  if (alpha === 0) return;
  const drawWidth = Math.max(1, finite(width, 145));
  const imageWidth = finite(image?.naturalWidth, 0) || finite(image?.width, 0);
  const imageHeight = finite(image?.naturalHeight, 0) || finite(image?.height, 0);
  const hasImage = imageWidth > 0 && imageHeight > 0 && image?.complete !== false;
  const drawHeight = hasImage ? drawWidth * imageHeight / imageWidth : drawWidth * 3;
  const pivotX = Number.isFinite(pivot?.x) ? clamp01(pivot.x) : 0.5;
  const pivotY = Number.isFinite(pivot?.y) ? clamp01(pivot.y) : 0.3;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(pose.x, pose.y);
  ctx.rotate(finite(pose.angle));
  const scale = Math.max(0.01, finite(pose.scale, 1));
  ctx.scale((pose.direction < 0 ? -1 : 1) * scale * Math.max(0.01, finite(pose.scaleX, 1)),
    scale * Math.max(0.01, finite(pose.scaleY, 1)));
  if (hasImage) {
    const split = Math.max(0.35, Math.min(0.8, finite(forearmSplit, 0.5)));
    const sourceSplitY = imageHeight * split;
    const left = -drawWidth * pivotX, top = -drawHeight * pivotY;
    const upperHeight = drawHeight * split, seam = top + upperHeight;
    const lowerHeight = Math.max(drawHeight - upperHeight,
      Math.max(1, Math.min(1200, finite(forearmLength, 650))));
    // The source pixels meet at exactly the same seam. Only the long axis of
    // the lower slice stretches; no rectangular substitute or wrist join.
    ctx.drawImage(image, 0, sourceSplitY, imageWidth, imageHeight - sourceSplitY,
      left, seam, drawWidth, lowerHeight);
    ctx.drawImage(image, 0, 0, imageWidth, sourceSplitY,
      left, top, drawWidth, upperHeight);
  } else {
    drawFallbackHand(ctx, drawWidth);
  }
  ctx.restore();
}

/** A continuous hand-and-forearm silhouette remains usable without the PNG. */
function drawFallbackHand(ctx, width) {
  ctx.save();
  ctx.scale(width / 145, width / 145);
  ctx.fillStyle = '#ba805d';
  ctx.strokeStyle = '#51392f';
  ctx.lineWidth = 2;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-35, 700);
  ctx.bezierCurveTo(-31, 450, -24, 95, -27, 43);
  ctx.bezierCurveTo(-39, 28, -48, 13, -56, -3);
  ctx.bezierCurveTo(-64, -19, -56, -29, -48, -18);
  ctx.lineTo(-30, 6);
  ctx.lineTo(-34, -59);
  ctx.bezierCurveTo(-35, -75, -21, -78, -20, -61);
  ctx.lineTo(-17, -27);
  ctx.lineTo(-17, -81);
  ctx.bezierCurveTo(-17, -98, -2, -96, -2, -80);
  ctx.lineTo(0, -28);
  ctx.lineTo(2, -86);
  ctx.bezierCurveTo(3, -104, 18, -99, 17, -84);
  ctx.lineTo(16, -28);
  ctx.lineTo(22, -71);
  ctx.bezierCurveTo(24, -88, 38, -83, 36, -69);
  ctx.lineTo(33, -10);
  ctx.bezierCurveTo(36, 15, 32, 29, 23, 44);
  ctx.bezierCurveTo(24, 120, 36, 450, 47, 700);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}
