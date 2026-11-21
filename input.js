// Input geometry has no DOM dependencies so that it can be tested independently.
const EPSILON = 1e-9;
const finite = Number.isFinite;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

/** Inverse of translate → rotate → scale. Invalid geometry returns null. */
export function toLocal(point, { x = 0, y = 0, angle = 0, scale = 1 } = {}) {
  if (!point || ![point.x, point.y, x, y, angle, scale].every(finite) || scale <= 0) return null;
  const dx = point.x - x;
  const dy = point.y - y;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: (dx * cos + dy * sin) / scale, y: (-dx * sin + dy * cos) / scale };
}

/** First contact along a segment, including segments beginning inside an ellipse. */
export function segmentEllipseHit(a, b, { x = 0, y = 0, rx, ry } = {}) {
  if (!a || !b || ![a.x, a.y, b.x, b.y, x, y, rx, ry].every(finite) || rx <= 0 || ry <= 0) return null;
  const ax = (a.x - x) / rx;
  const ay = (a.y - y) / ry;
  const dx = (b.x - a.x) / rx;
  const dy = (b.y - a.y) / ry;
  const c = ax * ax + ay * ay - 1;
  if (c <= EPSILON) return { t: 0, point: { x: a.x, y: a.y } };
  const aa = dx * dx + dy * dy;
  if (aa <= EPSILON) return null;
  const bb = 2 * (ax * dx + ay * dy);
  const discriminant = bb * bb - 4 * aa * c;
  if (discriminant < -EPSILON) return null;
  const root = Math.sqrt(Math.max(0, discriminant));
  const t = (-bb - root) / (2 * aa);
  if (t < -EPSILON || t > 1 + EPSILON) return null;
  const contact = clamp(t, 0, 1);
  return { t: contact, point: { x: a.x + (b.x - a.x) * contact, y: a.y + (b.y - a.y) * contact } };
}

function pointOnSegment(a, b, fraction) {
  return { x: a.x + (b.x - a.x) * fraction, y: a.y + (b.y - a.y) * fraction, t: a.t + (b.t - a.t) * fraction };
}

// Integrate only the last 80 ms before contact. This preserves curved paths and
// prevents a pause after a fast hit from weakening that hit when the finger lifts.
function recentMotion(samples, segment, fraction) {
  const contact = pointOnSegment(samples[segment], samples[segment + 1], fraction);
  const earliest = contact.t - 80;
  let end = contact;
  let distance = 0;
  let start = contact;
  for (let i = segment; i >= 0; i -= 1) {
    let begin = samples[i];
    if (begin.t < earliest && end.t > earliest) {
      begin = pointOnSegment(begin, end, (earliest - begin.t) / (end.t - begin.t));
    }
    distance += Math.hypot(end.x - begin.x, end.y - begin.y);
    start = begin;
    if (begin.t <= earliest) break;
    end = begin;
  }
  let duration = contact.t - start.t;
  let dx = contact.x - start.x;
  if (duration <= EPSILON) {
    // Starting a swipe on a cheek is a valid gesture: the initial segment
    // supplies its velocity even though the first contact has fraction zero.
    const a = samples[segment];
    const b = samples[segment + 1];
    duration = b.t - a.t;
    distance = Math.hypot(b.x - a.x, b.y - a.y);
    dx = b.x - a.x;
  }
  return { speed: duration > 0 ? distance / duration : 0, dx };
}

/** Analyze one completed gesture. All positions use logical canvas units. */
export function analyzeGesture(samples, {
  face,
  cheeks,
  targetSide,
  minDistance = 24,
  minSpeed = 0.16,
  maxSpeed = 3.2,
} = {}) {
  if (!Array.isArray(samples) || samples.length < 2) return { valid: false, reason: 'tooShort' };
  if (!face || !cheeks || !['left', 'right'].includes(targetSide) ||
      ![face.rx, face.ry, minDistance, minSpeed, maxSpeed].every(finite) ||
      face.rx <= 0 || face.ry <= 0 || minDistance < 0 || minSpeed < 0 || maxSpeed <= minSpeed) {
    return { valid: false, reason: 'invalid' };
  }
  const local = [];
  for (const sample of samples) {
    const position = toLocal(sample, face);
    if (!position || !finite(sample.t) || (local.length && sample.t < local.at(-1).t)) {
      return { valid: false, reason: 'invalid' };
    }
    // Pointer events can share a timestamp. Keep their latest position without
    // dividing by zero or letting a zero-duration jump create unlimited power.
    if (local.length && sample.t === local.at(-1).t) local[local.length - 1] = { ...position, t: sample.t };
    else local.push({ ...position, t: sample.t });
  }
  if (local.length < 2) return { valid: false, reason: 'tooShort' };
  const distance = local.slice(1).reduce((total, p, i) => total + Math.hypot(p.x - local[i].x, p.y - local[i].y), 0);
  if (distance < minDistance) return { valid: false, reason: 'tooShort' };

  const contacts = [];
  const faceEllipse = { x: 0, y: 0, rx: face.rx, ry: face.ry };
  for (let i = 0; i < local.length - 1; i += 1) {
    const faceContact = segmentEllipseHit(local[i], local[i + 1], faceEllipse);
    if (faceContact) contacts.push({ ...faceContact, segment: i, kind: 'face' });
    for (const side of ['left', 'right']) {
      const cheekContact = segmentEllipseHit(local[i], local[i + 1], cheeks[side]);
      if (cheekContact && faceContact) contacts.push({ ...cheekContact, segment: i, kind: 'cheek', side });
    }
  }
  contacts.sort((a, b) => a.segment - b.segment || a.t - b.t);
  const movingContacts = contacts.map(contact => ({ ...contact, motion: recentMotion(local, contact.segment, contact.t) }))
    .filter(contact => contact.motion.speed >= minSpeed);
  // Prefer a cheek contact over a forehead/chin contact, then choose the first
  // cheek reached. A sweep through both cheeks therefore earns one hit only.
  let contact = movingContacts.find(candidate => candidate.kind === 'cheek') || movingContacts[0];
  const faceHit = Boolean(contact);
  if (!contact) {
    if (contacts.length) return { valid: false, reason: 'tooSlow' };
    const segment = local.length - 2;
    contact = { segment, t: 1, point: local.at(-1), motion: recentMotion(local, segment, 1) };
    if (contact.motion.speed < minSpeed) return { valid: false, reason: 'tooSlow' };
  }
  const side = contact.side || (contact.point.x <= 0 ? 'left' : 'right');
  const angle = face.angle ?? 0;
  const scale = face.scale ?? 1;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const point = {
    x: (face.x ?? 0) + scale * (contact.point.x * cos - contact.point.y * sin),
    y: (face.y ?? 0) + scale * (contact.point.x * sin + contact.point.y * cos),
  };
  // Visual recoil follows screen-space swipe direction, even on a tilted head.
  const a = local[contact.segment];
  const b = local[contact.segment + 1];
  const worldDx = scale * ((b.x - a.x) * cos - (b.y - a.y) * sin);
  const direction = Math.abs(worldDx) > EPSILON ? Math.sign(worldDx) : (side === 'left' ? 1 : -1);
  return {
    valid: true,
    faceHit,
    targetHit: faceHit && contact.kind === 'cheek' && side === targetSide,
    side,
    power: clamp((contact.motion.speed - minSpeed) / (maxSpeed - minSpeed), 0, 1),
    direction,
    point,
  };
}
