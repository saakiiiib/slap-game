import test from 'node:test';
import assert from 'node:assert/strict';
import { SlapTiming } from '../slap-timing.js';
import { GameSession } from '../game-core.js';

const gesture = (extra = {}) => ({
  point: { x: 240, y: 260 }, from: { x: 120, y: 310 },
  power: .8, direction: 1, faceHit: true, targetHit: true, side: 'left',
  ...extra,
});

test('a gesture contacts at the exact due time and can be consumed only once', () => {
  const timing = new SlapTiming();
  const hit = gesture();
  assert.equal(timing.schedule(hit, 50), true);
  assert.equal(timing.take(149.999), null);
  assert.deepEqual(timing.take(150), hit);
  assert.equal(timing.take(150), null);
  assert.equal(timing.take(10_000), null);
});

test('the pending impact is a snapshot of mutable pointer coordinates and properties', () => {
  const timing = new SlapTiming();
  const hit = gesture({ source: 'pointer' });
  timing.schedule(hit, 0);
  hit.point.x = 999;
  hit.from.y = 999;
  hit.power = 0;
  hit.targetHit = false;
  const contact = timing.take(100);
  assert.equal(contact.point.x, 240);
  assert.equal(contact.from.y, 310);
  assert.equal(contact.power, .8);
  assert.equal(contact.targetHit, true);
  assert.equal(contact.source, 'pointer');
});

test('a second gesture cannot replace a pending impact even after cooldown', () => {
  const timing = new SlapTiming();
  timing.schedule(gesture({ source: 'pointer' }), 0, { delayMs: 500 });
  assert.equal(timing.schedule(gesture({ source: 'keyboard' }), 300), false);
  assert.equal(timing.take(500).source, 'pointer');
});

test('pointer and keyboard gestures share a cooldown measured from scheduling', () => {
  const timing = new SlapTiming();
  assert.equal(timing.schedule(gesture({ source: 'pointer' }), 0), true);
  timing.take(100);
  assert.equal(timing.schedule(gesture({ source: 'keyboard' }), 249.999), false);
  assert.equal(timing.schedule(gesture({ source: 'keyboard' }), 250), true);
  assert.equal(timing.take(350).source, 'keyboard');
});

test('cancelling before contact drops the impact while retaining the cooldown', () => {
  const timing = new SlapTiming();
  timing.schedule(gesture(), 500);
  assert.equal(timing.clear(), timing);
  assert.equal(timing.take(600), null);
  assert.equal(timing.schedule(gesture(), 700), false);
  assert.equal(timing.schedule(gesture(), 750), true);
});

test('a new round can clear the pending hit and reset its cooldown', () => {
  const timing = new SlapTiming();
  timing.schedule(gesture(), 500);
  timing.clear({ resetCooldown: true });
  assert.equal(timing.schedule(gesture(), 501), true);
  assert.equal(timing.take(600), null);
  assert.ok(timing.take(601));
});

test('zero delay provides immediate contact for reduced motion', () => {
  const timing = new SlapTiming();
  assert.equal(timing.schedule(gesture({ from: undefined }), 500, { delayMs: 0 }), true);
  assert.ok(timing.take(500));
  assert.equal(timing.take(500), null);
});

test('invalid gestures and clock values do not consume the cooldown', () => {
  const invalidHits = [null, {}, gesture({ valid: false }), gesture({ point: null }),
    gesture({ point: { x: Infinity, y: 2 } }), gesture({ from: { x: 1, y: NaN } }),
    gesture({ power: NaN }), gesture({ power: -1 }), gesture({ power: 1.1 }),
    gesture({ direction: 0 })];
  for (const hit of invalidHits) {
    const timing = new SlapTiming();
    assert.equal(timing.schedule(hit, 0), false);
    assert.equal(timing.schedule(gesture(), 0), true);
  }
  for (const now of [NaN, Infinity, -Infinity]) {
    assert.equal(new SlapTiming().schedule(gesture(), now), false);
  }
  for (const delayMs of [-1, NaN, Infinity]) {
    assert.equal(new SlapTiming().schedule(gesture(), 0, { delayMs }), false);
  }
});

test('invalid take clocks preserve the pending impact', () => {
  const timing = new SlapTiming();
  timing.schedule(gesture(), 0);
  assert.equal(timing.take(Infinity), null);
  assert.equal(timing.take(NaN), null);
  assert.ok(timing.take(100));
});

test('custom cooldown supports immediate repeats only after the pending hit is taken', () => {
  const timing = new SlapTiming({ cooldown: 0 });
  timing.schedule(gesture(), 0, { delayMs: 0 });
  assert.equal(timing.schedule(gesture(), 0, { delayMs: 0 }), false);
  timing.take(0);
  assert.equal(timing.schedule(gesture(), 0, { delayMs: 0 }), true);
  assert.equal(new SlapTiming({ cooldown: -1 }).cooldown, 250);
});

// Match the app's frame order: consume at the planned contact timestamp, then
// advance the round to the actual frame time. Rendering may arrive a bit late.
function contactFrame(timing, session, frameAt) {
  const ready = session.status === 'playing' ? timing.take(frameAt) : null;
  const result = ready ? session.attempt(ready, ready.contactAt) : null;
  session.tick(frameAt);
  return result;
}

test('scheduled contact timestamps preserve the 250 ms cooldown despite frame jitter', () => {
  for (const frames of [[100, 350], [139, 352]]) {
    const timing = new SlapTiming();
    const session = new GameSession({ storage: undefined }).start('arcade', 0);
    assert.equal(timing.schedule(gesture({ contactAt: 100 }), 0), true);
    assert.equal(contactFrame(timing, session, frames[0]).accepted, true);
    assert.equal(timing.schedule(gesture({ side: 'right', direction: -1, contactAt: 350 }), 250), true);
    assert.equal(contactFrame(timing, session, frames[1]).accepted, true);
    assert.equal(session.slaps, 2);
    assert.equal(session.score, 327);
    assert.equal(session.combo, 2);
  }
});

test('a late frame counts contact before the deadline and rejects contact at or after it', () => {
  for (const contactAt of [29_999, 30_000, 30_001]) {
    const timing = new SlapTiming();
    const session = new GameSession({ storage: undefined }).start('arcade', 0);
    assert.equal(timing.schedule(gesture({ contactAt }), contactAt - 100), true);
    const result = contactFrame(timing, session, 30_016);
    assert.equal(result.accepted, contactAt < 30_000);
    assert.equal(session.status, 'over');
    assert.equal(session.result.score, contactAt < 30_000 ? 109 : 0);
    assert.equal(session.attempts, contactAt < 30_000 ? 1 : 0);
    assert.equal(timing.take(30_017), null);
  }
});

test('pausing clears the approach so resuming never produces an old impact', () => {
  const timing = new SlapTiming();
  const session = new GameSession({ storage: undefined }).start('arcade', 0);
  timing.schedule(gesture({ contactAt: 100 }), 0);
  timing.pause(50);
  assert.equal(session.pause(50), true);
  assert.equal(timing.resume(1_050), true);
  assert.equal(session.resume(1_050), true);
  assert.equal(contactFrame(timing, session, 1_100), null);
  assert.equal(session.score, 0);
  assert.equal(session.attempts, 0);
  assert.equal(session.remaining(1_100), 29_900);
  assert.equal(timing.schedule(gesture({ contactAt: 1_350 }), 1_250), true);
  assert.equal(contactFrame(timing, session, 1_350).accepted, true);
  assert.equal(session.slaps, 1);
});

test('pause preserves the remaining shared cooldown so every animated contact can score after resume', () => {
  const timing = new SlapTiming();
  const session = new GameSession({ storage: undefined }).start('arcade', 0);
  assert.equal(timing.schedule(gesture({ contactAt: 100 }), 0), true);
  assert.equal(contactFrame(timing, session, 100).accepted, true);
  assert.equal(timing.pause(150), true);
  assert.equal(session.pause(150), true);
  assert.equal(timing.schedule(gesture(), 500), false);
  assert.equal(timing.resume(1_150), true);
  assert.equal(session.resume(1_150), true);
  assert.equal(timing.schedule(gesture({ contactAt: 1_250 }), 1_150), false);
  assert.equal(timing.schedule(gesture({ contactAt: 1_349.999 }), 1_249.999), false);
  assert.equal(timing.schedule(gesture({ side: 'right', direction: -1, contactAt: 1_350 }), 1_250), true);
  assert.equal(contactFrame(timing, session, 1_350).accepted, true);
  assert.equal(session.slaps, 2);
  assert.equal(session.score, 327);
});

test('repeated pauses preserve the first pause clock, and a reset removes paused state', () => {
  const timing = new SlapTiming();
  timing.schedule(gesture(), 0);
  assert.equal(timing.pause(NaN), false);
  assert.ok(timing.pending);
  assert.equal(timing.pause(50), true);
  assert.equal(timing.pending, null);
  assert.equal(timing.pause(500), true);
  assert.equal(timing.pausedAt, 50);
  assert.equal(timing.resume(NaN), false);
  assert.equal(timing.resume(49), false);
  assert.equal(timing.resume(1_050), true);
  assert.equal(timing.lastScheduledAt, 1_000);
  assert.equal(timing.lastContactAt, 1_100);
  assert.equal(timing.resume(1_100), false);
  timing.pause(1_100);
  timing.clear({ resetCooldown: true });
  assert.equal(timing.pausedAt, null);
  assert.equal(timing.lastContactAt, -Infinity);
  assert.equal(timing.schedule(gesture(), 1_100), true);
});

test('switching to reduced motion retains the cooldown between actual contacts', () => {
  const timing = new SlapTiming();
  const session = new GameSession({ storage: undefined }).start('arcade', 0);
  assert.equal(timing.schedule(gesture({ contactAt: 100 }), 0, { delayMs: 100 }), true);
  assert.equal(contactFrame(timing, session, 100).accepted, true);
  assert.equal(timing.schedule(gesture({ contactAt: 250 }), 250, { delayMs: 0 }), false);
  assert.equal(timing.schedule(gesture({ contactAt: 350 }), 350, { delayMs: 0 }), true);
  assert.equal(contactFrame(timing, session, 350).accepted, true);
  assert.equal(session.slaps, 2);
});
