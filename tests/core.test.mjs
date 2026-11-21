import test from 'node:test';
import assert from 'node:assert/strict';
import { GameSession, BEST_KEY } from '../game-core.js';

const target = (power = 1) => ({ power, targetHit: true });
const makeStorage = (value = null) => {
  const writes = [];
  return { writes, getItem(key) { assert.equal(key, BEST_KEY); return value; }, setItem(key, next) { assert.equal(key, BEST_KEY); writes.push(next); value = next; } };
};

test('ready state ignores input; first gesture at time zero is accepted', () => {
  const game = new GameSession({ storage: makeStorage() });
  assert.equal(game.status, 'ready');
  assert.equal(game.remaining(999), 30000);
  assert.deepEqual(game.attempt(target(), 0), { accepted: false, reason: 'ready' });
  assert.equal(game.finish(0), null);
  game.start('arcade', 0);
  assert.deepEqual(game.attempt(target(), 0), { accepted: true, hit: true, points: 125, power: 1, combo: 1, targetHit: true, targetSide: 'right' });
  assert.equal(game.slaps, 1);
});

test('a shared cooldown rejects rapid gestures and includes misses', () => {
  const game = new GameSession().start('arcade', 0);
  game.attempt({ faceHit: false, targetHit: true, power: 1 }, 0);
  assert.equal(game.attempt(target(), 249).reason, 'cooldown');
  assert.equal(game.attempt(target(), 250).accepted, true);
  assert.equal(game.attempts, 2);
  assert.equal(game.slaps, 1);
  assert.equal(game.targetHits, 1);
  assert.equal(game.score, 125);
  assert.equal(game.targetSide, 'right');
});

test('power clamps to 0–1 and follows the 20–100 base point formula', () => {
  const game = new GameSession().start('practice', 0);
  assert.equal(game.attempt({ power: -2 }, 0).points, 20);
  assert.equal(game.attempt({ power: 0.5 }, 250).points, 60);
  assert.equal(game.attempt({ power: 0.333 }, 500).points, 47);
  assert.equal(game.attempt({ power: 5 }, 750).points, 100);
  assert.equal(game.attempt({ power: NaN }, 1000).points, 20);
  assert.equal(game.strongest, 1);
});

test('target chain multiplies points and caps at ×5', () => {
  const game = new GameSession().start('arcade', 0);
  const points = [0, 250, 500, 750, 1000, 1250].map(now => game.attempt(target(), now).points);
  assert.deepEqual(points, [125, 250, 375, 500, 625, 625]);
  assert.equal(game.combo, 5);
  assert.equal(game.maxCombo, 5);
  assert.equal(game.targetSide, 'left');
  assert.equal(game.score, 2500);
});

test('target hits at the combo deadline chain; later hits restart at ×1', () => {
  const game = new GameSession().start('practice', 0);
  game.attempt(target(), 0);
  assert.equal(game.attempt(target(), 1500).combo, 2);
  game.tick(3001);
  assert.equal(game.combo, 1);
  assert.equal(game.attempt(target(), 3001).combo, 1);
});

test('off-target face hits and misses each break target combos', () => {
  const game = new GameSession().start('practice', 0);
  game.attempt(target(), 0);
  game.attempt(target(), 250);
  assert.equal(game.attempt({ power: 1, targetHit: false }, 500).points, 100);
  assert.equal(game.combo, 1);
  assert.equal(game.targetSide, 'left');
  assert.equal(game.attempt(target(), 750).combo, 1);
  assert.equal(game.attempt({ power: 1, faceHit: false, targetHit: true }, 1000).points, 0);
  assert.equal(game.combo, 1);
  assert.equal(game.attempt(target(), 1250).combo, 1);
  assert.equal(game.targetHits, 4);
  assert.equal(game.slaps, 5);
  assert.equal(game.attempts, 6);
});

test('exact duration uses elapsed time and rejects a gesture at the deadline', () => {
  const storage = makeStorage();
  const game = new GameSession({ storage }).start('arcade', 1000);
  game.attempt(target(), 1000);
  assert.equal(game.remaining(30999), 1);
  assert.equal(game.tick(30999), 'playing');
  assert.deepEqual(game.attempt(target(), 31000), { accepted: false, reason: 'over' });
  assert.equal(game.score, 125);
  assert.equal(game.remaining(40000), 0);
  assert.equal(storage.writes.length, 1);
});

test('a stalled render loop finishes at its first tick without extending the round', () => {
  const game = new GameSession().start('arcade', 0);
  game.attempt(target(), 100);
  assert.equal(game.tick(200000), 'over');
  assert.equal(game.result.score, 125);
  assert.equal(game.attempt(target(), 200000).accepted, false);
});

test('pause freezes time, input, and combo/cooldown windows', () => {
  const game = new GameSession().start('arcade', 0);
  game.attempt(target(), 1000);
  assert.equal(game.pause(1100), true);
  assert.equal(game.pause(1200), false);
  assert.equal(game.remaining(400000), 28900);
  assert.equal(game.tick(400000), 'paused');
  assert.equal(game.attempt(target(), 300000).reason, 'paused');
  assert.equal(game.resume(400000), true);
  assert.equal(game.resume(400001), false);
  assert.equal(game.remaining(400000), 28900);
  assert.equal(game.attempt(target(), 400100).reason, 'cooldown');
  assert.equal(game.attempt(target(), 400150).combo, 2);
  assert.equal(game.tick(428899), 'playing');
  assert.equal(game.tick(428900), 'over');
});

test('pausing at an expired deadline ends the round', () => {
  const game = new GameSession().start('arcade', 0);
  assert.equal(game.pause(30000), false);
  assert.equal(game.status, 'over');
  assert.equal(game.resume(60000), false);
});

test('practice is untimed and does not overwrite the arcade personal best', () => {
  const storage = makeStorage('100');
  const game = new GameSession({ storage }).start('practice', 0);
  game.attempt(target(), 0);
  assert.equal(game.remaining(9999999), null);
  assert.equal(game.tick(9999999), 'playing');
  game.pause(9999999);
  assert.equal(game.remaining(99999999), null);
  game.resume(99999999);
  const result = game.finish(99999999);
  assert.equal(result.score, 125);
  assert.equal(result.best, 100);
  assert.equal(result.newBest, false);
  assert.equal(result.mode, 'practice');
  assert.deepEqual(storage.writes, []);
});

test('results capture target accuracy, strongest slap, score, and highest combo', () => {
  const game = new GameSession({ storage: makeStorage() }).start('arcade', 0);
  game.attempt(target(0.25), 0);
  game.attempt(target(0.75), 250);
  game.attempt({ power: 0.5 }, 500);
  game.attempt({ faceHit: false, power: 1 }, 750);
  assert.deepEqual(game.finish(1000), { score: 335, best: 335, newBest: true, accuracy: 50, strongest: 0.75, slaps: 3, maxCombo: 2, mode: 'arcade' });
});

test('finish is idempotent and updates persistent arcade best once', () => {
  const storage = makeStorage('50');
  const game = new GameSession({ storage }).start('arcade', 0);
  game.attempt(target(), 0);
  const first = game.finish(1000);
  assert.strictEqual(game.finish(2000), first);
  game.tick(999999);
  assert.deepEqual(storage.writes, ['125']);
  assert.equal(game.attempt(target(), 2500).accepted, false);
  const nextGame = new GameSession({ storage });
  assert.equal(nextGame.best, 125);
});

test('empty or tied scores do not write a new record', () => {
  const storage = makeStorage('125');
  const game = new GameSession({ storage }).start('arcade', 0);
  game.attempt(target(), 0);
  assert.equal(game.finish(500).newBest, false);
  game.start('arcade', 1000);
  assert.equal(game.finish(1000).accuracy, 0);
  assert.equal(game.result.strongest, 0);
  assert.deepEqual(storage.writes, []);
});

test('restarting clears every round field while preserving the record', () => {
  const game = new GameSession({ storage: makeStorage() }).start('arcade', 0);
  game.attempt(target(), 0);
  game.attempt(target(), 250);
  game.finish(500);
  game.start('practice', 1000);
  assert.equal(game.status, 'playing');
  assert.equal(game.best, 375);
  assert.equal(game.score, 0);
  assert.equal(game.slaps, 0);
  assert.equal(game.attempts, 0);
  assert.equal(game.targetHits, 0);
  assert.equal(game.combo, 1);
  assert.equal(game.maxCombo, 1);
  assert.equal(game.strongest, 0);
  assert.equal(game.targetSide, 'left');
  assert.equal(game.result, null);
  assert.equal(game.attempt(target(), 1000).accepted, true);
  game.reset();
  assert.equal(game.status, 'ready');
  assert.equal(game.mode, 'arcade');
  assert.equal(game.best, 375);
});

test('blocked storage never prevents play or in-memory records', () => {
  const storage = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('quota'); } };
  const game = new GameSession({ storage }).start('arcade', 0);
  game.attempt(target(), 0);
  assert.equal(game.finish(500).best, 125);
  assert.equal(game.best, 125);
});

test('invalid saved records and invalid configuration safely use defaults', () => {
  for (const record of ['nonsense', '-10', 'Infinity', 'NaN']) {
    assert.equal(new GameSession({ storage: makeStorage(record) }).best, 0);
  }
  const game = new GameSession({ duration: -1, cooldown: NaN, comboWindow: -10 });
  assert.equal(game.duration, 30000);
  assert.equal(game.cooldown, 250);
  assert.equal(game.comboWindow, 1500);
});
