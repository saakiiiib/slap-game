import test from 'node:test';
import assert from 'node:assert/strict';
import { HAND_ASSET, HAND_CONTACT_MS, HandAnimator, drawSlappingHand } from '../hand.js';

const hit = { x: 247, y: 260, direction: 1, power: 0.8 };

test('the hand starts absent and uses the bundled dorsal-view artwork', () => {
  assert.equal(new HandAnimator().pose(0), null);
  assert.equal(HAND_ASSET, './assets/hand/slapping-hand-v2.png');
  assert.equal(HAND_CONTACT_MS, 100);
});

test('pointer following persists with a smaller edge-on hand and no contact', () => {
  const hand = new HandAnimator().follow(hit, 0);
  const pose = hand.pose(90_000);
  assert.equal(pose.x, hit.x);
  assert.equal(pose.contact, false);
  assert.equal(pose.phase, 'following');
  assert.ok(pose.scaleX < 0.6 && pose.scale < 1 && pose.alpha < 1);
  hand.follow({ ...hit, x: 360, direction: -1 }, 90_001);
  assert.equal(hand.pose(90_002).x, 360);
  assert.ok(hand.pose(90_002).angle < 0);
  hand.endFollow();
  assert.equal(hand.pose(90_003), null);
});

test('both directions accelerate from the incoming side and contact the cheek at the shared impact time', () => {
  for (const direction of [-1, 1]) {
    const hand = new HandAnimator().strike({ ...hit, direction }, 700);
    const start = hand.pose(700), early = hand.pose(740), late = hand.pose(780);
    assert.equal(start.phase, 'anticipation');
    assert.equal(early.phase, 'approach');
    assert.ok((hit.x - start.x) * direction > 100);
    assert.ok((late.x - early.x) * direction > 0);
    assert.equal(hand.pose(799).contact, false);
    const contact = hand.pose(700 + HAND_CONTACT_MS);
    assert.equal(contact.x, hit.x);
    assert.equal(contact.y, hit.y);
    assert.equal(contact.contact, true);
    assert.equal(contact.phase, 'contact');
    assert.equal(contact.alpha, 1);
  }
});

test('a valid visible incoming position is preserved, while positions beyond the cheek cannot cause a backward strike', () => {
  const from = { x: hit.x - 85, y: hit.y + 20 };
  const hand = new HandAnimator().strike(hit, 0, { from });
  assert.equal(hand.pose(0).x, from.x);
  assert.equal(hand.pose(0).y, from.y);
  const invalidFrom = new HandAnimator().strike(hit, 0, { from: { x: hit.x + 40, y: hit.y } });
  assert.ok(invalidFrom.pose(0).x < hit.x);
  const followed = new HandAnimator().follow({ ...hit, ...from }, 0).strike(hit, 50);
  assert.equal(followed.pose(50).x, from.x);
});

test('follow-through and exit continue in the swipe direction, then lower and fade the hand', () => {
  for (const direction of [-1, 1]) {
    const hand = new HandAnimator().strike({ ...hit, direction }, 0);
    let previous = hand.pose(HAND_CONTACT_MS);
    for (let time = 110; time < 430; time += 10) {
      const pose = hand.pose(time);
      assert.ok((pose.x - previous.x) * direction > 0, `no snapback at ${time}ms`);
      assert.ok(pose.y >= previous.y);
      previous = pose;
    }
    assert.equal(hand.pose(130).phase, 'follow-through');
    assert.equal(hand.pose(180).phase, 'exit');
    assert.ok(hand.pose(420).y > hit.y + 300);
    assert.ok(hand.pose(420).alpha < 0.02);
    assert.equal(hand.pose(430), null);
    assert.equal(hand.pose(-1), null);
  }
});

test('power changes follow-through travel without ballooning the hand or moving contact', () => {
  const gentle = new HandAnimator().strike({ ...hit, power: 0 }, 0);
  const hard = new HandAnimator().strike({ ...hit, power: 1 }, 0);
  for (const time of [0, 50, 100, 150, 250, 400]) {
    assert.equal(gentle.pose(time).scale, hard.pose(time).scale);
    assert.equal(gentle.pose(time).scaleY, 1);
    assert.equal(hard.pose(time).scaleY, 1);
  }
  assert.equal(gentle.pose(100).x, hard.pose(100).x);
  assert.ok(hard.pose(160).x > gentle.pose(160).x);
});

test('pointer release preserves an in-flight strike; clear and a fresh gesture remove stale state', () => {
  const hand = new HandAnimator().follow(hit, 0).strike(hit, 100).endFollow();
  assert.equal(hand.pose(200).contact, true);
  hand.follow({ ...hit, x: 99 }, 230).endFollow();
  assert.equal(hand.pose(240), null);
  hand.strike(hit, 300).clear();
  assert.equal(hand.pose(400), null);
});

test('reduced motion contacts immediately with no travel, trail, or squash', () => {
  for (const options of [{ reducedMotion: true }, { reduceMotion: true }]) {
    const hand = new HandAnimator().strike(hit, 900, options);
    for (const time of [900, 940, 1020]) {
      const pose = hand.pose(time);
      assert.equal(pose.x, hit.x);
      assert.equal(pose.y, hit.y);
      assert.equal(pose.contact, true);
      assert.equal(pose.phase, 'contact');
      assert.equal(pose.trail, 0);
      assert.equal(pose.scaleX, 1);
      assert.equal(pose.scaleY, 1);
    }
    assert.ok(hand.pose(1020).alpha < 1);
    assert.equal(hand.pose(1040), null);
  }
  assert.equal(new HandAnimator().strike(hit, 0).pose(60, { reduceMotion: true }).x, hit.x);
});

test('invalid coordinates and times cannot produce nonfinite or unbounded poses', () => {
  for (const point of [{}, { x: NaN, y: Infinity, direction: NaN, power: NaN }, { x: -10, y: 40, direction: -999, power: 100 }]) {
    const hand = new HandAnimator().strike(point, NaN, { from: { x: Infinity, y: NaN } });
    for (const time of [NaN, 0, 20, 100, 390]) {
      const pose = hand.pose(time);
      for (const value of Object.values(pose)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
      assert.ok(pose.power >= 0 && pose.power <= 1);
      assert.ok(pose.alpha >= 0 && pose.alpha <= 1);
      assert.ok(pose.scale > 0);
    }
  }
});

function canvasRecorder() {
  const commands = [];
  const context = { globalAlpha: 1 };
  for (const method of ['save', 'restore', 'translate', 'rotate', 'scale', 'drawImage', 'beginPath', 'moveTo', 'lineTo', 'bezierCurveTo', 'quadraticCurveTo', 'closePath', 'fill', 'stroke']) {
    context[method] = (...args) => {
      for (const value of args) if (typeof value === 'number') assert.ok(Number.isFinite(value));
      commands.push({ method, args });
    };
  }
  return { context, commands };
}

test('renderer preserves the upper hand, mirrors direction, and continues the source forearm below the arena', () => {
  const { context, commands } = canvasRecorder();
  const image = { complete: true, naturalWidth: 400, naturalHeight: 1200 };
  const pose = new HandAnimator().strike({ ...hit, direction: -1 }, 0).pose(100);
  drawSlappingHand(context, { image, pose, width: 200, pivot: { x: 0.5, y: 0.3 } });
  assert.deepEqual(commands.find(c => c.method === 'translate').args, [hit.x, hit.y]);
  assert.ok(commands.find(c => c.method === 'scale').args[0] < 0);
  const slices = commands.filter(c => c.method === 'drawImage');
  assert.equal(slices.length, 2);
  const [lower, upper] = slices.map(command => command.args);
  assert.deepEqual(lower, [image, 0, 600, 400, 600, -100, 120, 200, 650]);
  assert.deepEqual(upper, [image, 0, 0, 400, 600, -100, -180, 200, 300]);
  assert.equal(upper[2] + upper[4], lower[2], 'source slices have the same boundary');
  assert.equal(upper[6] + upper[8], lower[6], 'destination slices meet exactly');
  assert.equal(upper[7] / upper[3], upper[8] / upper[4], 'hand is not stretched');
  assert.equal(upper[7], lower[7], 'forearm width stays proportional');
  assert.ok(pose.y + lower[6] + lower[8] > 560, 'forearm extends past the stage bottom');
  assert.equal(commands.some(c => c.method === 'fill' || c.method === 'lineTo'), false);
  assert.equal(commands.filter(c => c.method === 'save').length, commands.filter(c => c.method === 'restore').length);
});

test('the normal 1024 by 1536 asset has a finite continuous seam and offstage forearm at small widths', () => {
  const image = { complete: true, naturalWidth: 1024, naturalHeight: 1536 };
  for (const width of [125, 145]) {
    const { context, commands } = canvasRecorder();
    drawSlappingHand(context, { image, width, pose: new HandAnimator().strike(hit, 0).pose(100),
      forearmSplit: NaN, forearmLength: Infinity });
    const [lower, upper] = commands.filter(c => c.method === 'drawImage').map(command => command.args);
    assert.equal(upper[6] + upper[8], lower[6]);
    assert.equal(lower[8], 650);
    assert.ok(hit.y + lower[6] + lower[8] > 560);
    assert.equal(upper[8], width * 1.5 * 0.5);
  }
});

test('renderer draws nothing while idle and a finite continuous fallback if artwork is unavailable', () => {
  const { context, commands } = canvasRecorder();
  drawSlappingHand(context, { pose: null });
  assert.equal(commands.length, 0);
  drawSlappingHand(context, { image: { complete: false }, pose: new HandAnimator().strike(hit, 0).pose(100) });
  assert.equal(commands.some(c => c.method === 'drawImage'), false);
  assert.ok(commands.some(c => c.method === 'fill'));
  assert.ok(commands.some(c => c.method === 'moveTo' && c.args[1] === 700));
  assert.equal(commands.filter(c => c.method === 'save').length, commands.filter(c => c.method === 'restore').length);
});
