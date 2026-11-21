import test from 'node:test';
import assert from 'node:assert/strict';
import { ReactionMeter, eyeReaction, drawComicEyes, drawDizzyStars } from '../reactions.js';

function canvasRecorder() {
  const commands = [];
  const context = { globalAlpha: 1 };
  for (const method of ['save', 'restore', 'beginPath', 'ellipse', 'arc', 'moveTo', 'lineTo', 'quadraticCurveTo', 'closePath', 'fill', 'stroke']) {
    context[method] = (...args) => {
      for (const value of args) assert.ok(typeof value !== 'number' || Number.isFinite(value), `${method} received a finite number`);
      commands.push({ method, args });
    };
  }
  return { context, commands };
}

test('normal swipes need three quick hits before the eyes react', () => {
  const meter = new ReactionMeter();
  assert.deepEqual(meter.hit(0.5, 0), { heat: 0.19, tier: 'calm' });
  meter.update(0.25);
  assert.equal(meter.hit(0.5, 250).tier, 'calm');
  assert.equal(eyeReaction(meter.heat).active, false);
  meter.update(0.25);
  assert.equal(meter.hit(0.5, 500).tier, 'surprised');
  assert.equal(eyeReaction(meter.heat).active, true);
  assert.equal(meter.hits, 3);
});

test('five rapid strong slaps reach full comic reaction; slow hits settle instead', () => {
  const rapid = new ReactionMeter();
  const slow = new ReactionMeter();
  for (let i = 0; i < 5; i += 1) {
    if (i) { rapid.update(0.25); slow.update(2); }
    rapid.hit(1, i * 250);
    slow.hit(1, i * 2000);
  }
  assert.equal(rapid.heat, 1);
  assert.equal(rapid.tier, 'wild');
  assert.ok(slow.heat < 0.42);
  assert.equal(eyeReaction(slow.heat).active, false);
});

test('breaks fade heat by elapsed time and paused time does not decay it', () => {
  const meter = new ReactionMeter();
  for (let i = 0; i < 4; i += 1) meter.hit(1, i * 250);
  assert.equal(meter.heat, 1);
  meter.update(90, { paused: true });
  assert.equal(meter.heat, 1);
  meter.update(2);
  assert.ok(Math.abs(meter.heat - 0.64) < 1e-9);
  meter.update(90);
  assert.equal(meter.heat, 0);
  assert.equal(meter.tier, 'calm');
});

test('decay is independent of frame rate', () => {
  const oneFrame = new ReactionMeter();
  const manyFrames = new ReactionMeter();
  for (let i = 0; i < 4; i += 1) { oneFrame.hit(1); manyFrames.hit(1); }
  oneFrame.update(2);
  for (let i = 0; i < 120; i += 1) manyFrames.update(1 / 60);
  assert.ok(Math.abs(oneFrame.heat - manyFrames.heat) < 1e-9);
});

test('reset clears heat, hit history, and expression for a new round', () => {
  const meter = new ReactionMeter();
  meter.hit(1, 1000);
  assert.equal(meter.reset(), meter);
  assert.equal(meter.heat, 0);
  assert.equal(meter.hits, 0);
  assert.equal(meter.lastHitAt, null);
  assert.equal(meter.tier, 'calm');
});

test('invalid values cannot poison the reaction state or drawing', () => {
  const meter = new ReactionMeter({ decayPerSecond: NaN });
  assert.equal(meter.decayPerSecond, 0.18);
  for (const power of [NaN, Infinity, -Infinity, undefined, -10, 10]) {
    const result = meter.hit(power, NaN);
    assert.ok(Number.isFinite(result.heat));
    assert.ok(result.heat >= 0 && result.heat <= 1);
  }
  for (const dt of [NaN, Infinity, -Infinity, -10, undefined]) meter.update(dt);
  assert.ok(Number.isFinite(meter.heat));
  assert.equal(meter.lastHitAt, null);
  assert.equal(eyeReaction(NaN).active, false);
  const { context } = canvasRecorder();
  assert.doesNotThrow(() => drawComicEyes(context, { heat: 1, time: NaN }));
});

test('eye amount and extension remain bounded, with no reaction below the threshold', () => {
  assert.deepEqual(eyeReaction(0.42), { active: false, amount: 0, extension: 0, scale: 1, wobble: 0 });
  const full = eyeReaction(50);
  assert.equal(full.active, true);
  assert.equal(full.amount, 1);
  assert.equal(full.extension, 38);
  assert.equal(full.scale, 1.42);
  assert.equal(full.wobble, 2.4);
  assert.ok(eyeReaction(0.6).amount < eyeReaction(0.9).amount);
});

test('reduced motion preserves the enlarged expression but removes extension and wobble', () => {
  const normal = eyeReaction(1);
  const reduced = eyeReaction(1, true);
  assert.equal(reduced.active, true);
  assert.equal(reduced.scale, normal.scale);
  assert.equal(reduced.extension, 0);
  assert.equal(reduced.wobble, 0);
  const first = canvasRecorder();
  const later = canvasRecorder();
  drawComicEyes(first.context, { heat: 1, reduceMotion: true, time: 0 });
  drawComicEyes(later.context, { heat: 1, reduceMotion: true, time: 20 });
  assert.deepEqual(first.commands, later.commands);
  assert.equal(first.commands.some(({ method }) => method === 'quadraticCurveTo'), false);
});

test('inactive eyes draw nothing; active eyes use balanced context saves and attached connectors', () => {
  const { context, commands } = canvasRecorder();
  drawComicEyes(context, { heat: 0.3 });
  assert.equal(commands.length, 0);
  drawComicEyes(context, { heat: 1, time: 1 });
  assert.equal(commands[0].method, 'save');
  assert.equal(commands.at(-1).method, 'restore');
  assert.equal(commands.filter(({ method }) => method === 'quadraticCurveTo').length, 4);
  assert.equal(commands.filter(({ method }) => method === 'arc').length, 2);
});

test('dizzy stars only appear at the strongest reaction and remain static in reduced motion', () => {
  const low = canvasRecorder();
  drawDizzyStars(low.context, { heat: 0.78 });
  assert.equal(low.commands.length, 0);
  const first = canvasRecorder();
  const later = canvasRecorder();
  drawDizzyStars(first.context, { heat: 1, reduceMotion: true, time: 0 });
  drawDizzyStars(later.context, { heat: 1, reduceMotion: true, time: 22 });
  assert.deepEqual(first.commands, later.commands);
  assert.equal(first.commands.filter(({ method }) => method === 'fill').length, 3);
});
