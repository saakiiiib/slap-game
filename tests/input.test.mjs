import test from 'node:test';
import assert from 'node:assert/strict';
import { toLocal, segmentEllipseHit, analyzeGesture } from '../input.js';

const face = { x: 300, y: 240, rx: 125, ry: 155, angle: 0, scale: 1 };
const cheeks = { left: { x: -60, y: 25, rx: 33, ry: 35 }, right: { x: 60, y: 25, rx: 33, ry: 35 } };
const config = { face, cheeks, targetSide: 'left' };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} should equal ${b}`);

test('segment finds entry when both endpoints are outside, including tangent', () => {
  const hit = segmentEllipseHit({ x: -50, y: 0 }, { x: 50, y: 0 }, { rx: 10, ry: 20 });
  close(hit.t, 0.4);
  close(hit.point.x, -10);
  assert.equal(segmentEllipseHit({ x: -50, y: 21 }, { x: 50, y: 21 }, { rx: 10, ry: 20 }), null);
  close(segmentEllipseHit({ x: -50, y: 20 }, { x: 50, y: 20 }, { rx: 10, ry: 20 }).t, 0.5);
});

test('segment handles inside origins, zero-length segments and invalid ellipses', () => {
  assert.equal(segmentEllipseHit({ x: 0, y: 0 }, { x: 0, y: 0 }, { rx: 10, ry: 20 }).t, 0);
  assert.equal(segmentEllipseHit({ x: 30, y: 30 }, { x: 30, y: 30 }, { rx: 10, ry: 20 }), null);
  assert.equal(segmentEllipseHit({ x: 0, y: 0 }, { x: 10, y: 0 }, { rx: 0, ry: 20 }), null);
});

test('inverse transform handles moved, tilted and scaled faces', () => {
  const local = toLocal({ x: 90, y: 220 }, { x: 100, y: 200, angle: Math.PI / 2, scale: 2 });
  close(local.x, 10);
  close(local.y, 5);
  assert.equal(toLocal({ x: 1, y: 1 }, { scale: 0 }), null);
});

test('fast crossing selects first cheek and cannot score both cheek targets', () => {
  const samples = [{ x: 100, y: 265, t: 0 }, { x: 500, y: 265, t: 100 }];
  const result = analyzeGesture(samples, config);
  assert.equal(result.valid, true);
  assert.equal(result.faceHit, true);
  assert.equal(result.targetHit, true);
  assert.equal(result.side, 'left');
  assert.equal(result.direction, 1);
  assert.equal(result.power, 1);
  close(result.point.x, 207);
  assert.equal(analyzeGesture(samples, { ...config, targetSide: 'right' }).targetHit, false);
});

test('reverse and vertical swipes choose physical cheek and recoil direction', () => {
  const reverse = analyzeGesture([{ x: 500, y: 265, t: 0 }, { x: 100, y: 265, t: 100 }], { ...config, targetSide: 'right' });
  assert.equal(reverse.side, 'right');
  assert.equal(reverse.direction, -1);
  const vertical = analyzeGesture([{ x: 240, y: 180, t: 0 }, { x: 240, y: 330, t: 100 }], config);
  assert.equal(vertical.targetHit, true);
  assert.equal(vertical.direction, 1);
});

test('art translation, rotation and scale preserve hit and normalized power', () => {
  const samples = [{ x: 100, y: 265, t: 0 }, { x: 500, y: 265, t: 200 }];
  const normal = analyzeGesture(samples, config);
  const moved = { ...face, x: 200, y: 400, angle: 0.7, scale: 0.6 };
  const transformed = samples.map(p => {
    const dx = p.x - face.x;
    const dy = p.y - face.y;
    return { x: moved.x + moved.scale * (dx * Math.cos(moved.angle) - dy * Math.sin(moved.angle)),
      y: moved.y + moved.scale * (dx * Math.sin(moved.angle) + dy * Math.cos(moved.angle)), t: p.t };
  });
  const result = analyzeGesture(transformed, { ...config, face: moved });
  assert.equal(result.targetHit, normal.targetHit);
  assert.equal(result.side, normal.side);
  close(result.power, normal.power);
});

test('uses motion at contact rather than pause after strike or old movement', () => {
  const fastThenPause = analyzeGesture([{ x: 100, y: 265, t: 0 }, { x: 300, y: 265, t: 100 }, { x: 300, y: 265, t: 1000 }], config);
  close(fastThenPause.power, (2 - 0.16) / (3.2 - 0.16));
  const oldFastThenSlow = analyzeGesture([{ x: -100, y: 265, t: 0 }, { x: 150, y: 265, t: 30 },
    { x: 180, y: 265, t: 1000 }, { x: 250, y: 265, t: 2000 }], config);
  assert.deepEqual(oldFastThenSlow, { valid: false, reason: 'tooSlow' });
});

test('short taps and slow drags are invalid; energetic misses remain misses', () => {
  assert.deepEqual(analyzeGesture([{ x: 240, y: 265, t: 0 }, { x: 242, y: 265, t: 10 }], config), { valid: false, reason: 'tooShort' });
  assert.deepEqual(analyzeGesture([{ x: 100, y: 265, t: 0 }, { x: 500, y: 265, t: 5000 }], config), { valid: false, reason: 'tooSlow' });
  const miss = analyzeGesture([{ x: 100, y: 500, t: 0 }, { x: 500, y: 500, t: 100 }], config);
  assert.equal(miss.valid, true);
  assert.equal(miss.faceHit, false);
  assert.equal(miss.targetHit, false);
});

test('forehead hits are face hits without cheek bonuses', () => {
  const result = analyzeGesture([{ x: 100, y: 150, t: 0 }, { x: 500, y: 150, t: 100 }], config);
  assert.equal(result.faceHit, true);
  assert.equal(result.targetHit, false);
});

test('swipe beginning inside a cheek counts; invalid samples never produce NaN', () => {
  const result = analyzeGesture([{ x: 240, y: 265, t: 0 }, { x: 300, y: 265, t: 60 }], config);
  assert.equal(result.targetHit, true);
  assert.ok(Number.isFinite(result.power));
  assert.equal(analyzeGesture([{ x: NaN, y: 0, t: 0 }, { x: 100, y: 0, t: 10 }], config).valid, false);
  assert.equal(analyzeGesture([{ x: 0, y: 0, t: 0 }, { x: 100, y: 0, t: 0 }], config).valid, false);
  assert.equal(analyzeGesture([{ x: 0, y: 0, t: 10 }, { x: 100, y: 0, t: 0 }], config).valid, false);
  const duplicateTime = analyzeGesture([{ x: 101, y: 265, t: 0 }, { x: 100, y: 265, t: 0 }, { x: 500, y: 265, t: 100 }], config);
  assert.equal(duplicateTime.direction, 1);
  assert.equal(duplicateTime.targetHit, true);
});
