import test from 'node:test';
import assert from 'node:assert/strict';
import { SoundPlayer } from '../audio.js';

// Small Web Audio doubles expose scheduling decisions without a browser or
// speaker. Use the game preview to assess audible quality separately.
class Param {
  constructor() { this.value = 0; this.events = []; }
  setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); }
  linearRampToValueAtTime(value, time) { this.events.push(['ramp', value, time]); }
  cancelAndHoldAtTime(time) { this.events.push(['hold', time]); }
  cancelScheduledValues(time) { this.events.push(['cancel', time]); }
}
class AudioNode {
  connect(next) { return next; }
  disconnect() { this.disconnected = true; }
}
class Source extends AudioNode {
  constructor() { super(); this.playbackRate = { value: 1 }; this.stops = []; }
  start(time) { this.startedAt = time; }
  stop(time) { this.stops.push(time); }
}
class Context {
  constructor() { this.state = 'running'; this.currentTime = 1; this.destination = {}; this.shapers = []; }
  createGain() { return Object.assign(new AudioNode(), { gain: new Param() }); }
  createDynamicsCompressor() {
    return Object.assign(new AudioNode(), Object.fromEntries(
      ['threshold', 'knee', 'ratio', 'attack', 'release'].map(key => [key, new Param()]),
    ));
  }
  createWaveShaper() { const shaper = new AudioNode(); this.shapers.push(shaper); return shaper; }
  createBufferSource() { return new Source(); }
  async decodeAudioData(bytes) {
    const tier = new TextDecoder().decode(bytes).match(/(soft|medium|hard)/)[0];
    return { duration: { soft: .45, medium: .91, hard: 1.33 }[tier] };
  }
}

function installAudio(t) {
  const descriptors = Object.fromEntries(['window', 'fetch'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.defineProperty(globalThis, 'window', { configurable: true, writable: true, value: { AudioContext: Context } });
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true, writable: true,
    value: async url => ({ ok: true, arrayBuffer: async () => new TextEncoder().encode(url.pathname).buffer }),
  });
  t.after(() => {
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  t.mock.method(Math, 'random', () => .5);
}

test('voice tiers grow in duration and repeated-hit heat promotes the reaction', async t => {
  installAudio(t);
  const player = new SoundPlayer();
  t.after(() => player.stop());
  assert.equal(await player.unlock(), true);
  let lastDuration = 0;
  for (const [power, tier, low, high] of [[.1, 'soft', .4, .46], [.5, 'medium', .84, .91], [1, 'hard', 1.29, 1.36]]) {
    const reaction = player.play(power);
    assert.equal(reaction.tier, tier);
    assert.ok(reaction.duration > low && reaction.duration < high, `${tier} mouth timing follows pitched voice`);
    assert.ok(reaction.duration > lastDuration);
    lastDuration = reaction.duration;
    player.context.currentTime += 2;
  }
  assert.equal(player.play(.45, 0).tier, 'medium');
  player.context.currentTime += 2;
  assert.equal(player.play(.45, 1).tier, 'hard');
});

test('rapid hits crossfade the outgoing voice and bound both audio channels', async t => {
  installAudio(t);
  const player = new SoundPlayer();
  t.after(() => player.stop());
  await player.unlock();
  player.play(1);
  const outgoing = player.sources.find(record => record.kind === 'voice');
  player.context.currentTime += .25;
  player.play(.8);
  assert.ok(outgoing.gain.gain.events.some(event => event[0] === 'hold'));
  assert.ok(outgoing.gain.gain.events.some(event => event[0] === 'ramp' && event[1] === 0));
  assert.ok(outgoing.source.stops.at(-1) <= player.context.currentTime + .041);
  // Older engines lack cancelAndHoldAtTime; exercise the scheduled-gain fallback.
  const latest = player.sources.filter(record => record.kind === 'voice').at(-1);
  latest.gain.gain.cancelAndHoldAtTime = undefined;
  player.context.currentTime += .25;
  player.play(1);
  assert.ok(latest.gain.gain.events.some(event => event[0] === 'cancel'));
  for (let i = 0; i < 30; i++) {
    player.play(1, 1);
    assert.ok(player.sources.filter(record => record.kind === 'voice').length <= 2);
    assert.ok(player.sources.filter(record => record.kind === 'impact').length <= 2);
  }
});

test('output ceiling stays below clipping and muting stops every source immediately', async t => {
  installAudio(t);
  const player = new SoundPlayer();
  t.after(() => player.stop());
  await player.unlock();
  const curve = player.context.shapers[0].curve;
  assert.ok(curve.every(Number.isFinite));
  assert.ok(Math.max(...curve) < 1 && Math.min(...curve) > -1);
  player.play(1, 1);
  const active = [...player.sources];
  assert.ok(active.length > 0);
  player.setPreferences(true, .8);
  assert.equal(player.master.gain.value, 0);
  assert.equal(player.sources.length, 0);
  assert.ok(active.every(record => record.source.stops.includes(undefined)));
  assert.ok(active.every(record => record.source.disconnected && record.gain.disconnected));
  assert.equal(player.play(1), null);
  player.setPreferences(false, .8);
  assert.equal(player.master.gain.value, .8);
  assert.equal(player.sources.length, 0, 'unmuting does not revive stopped screams');
});

test('missing assets or an unavailable sound device degrade to silence', async t => {
  installAudio(t);
  globalThis.fetch = async () => { throw new Error('Offline asset unavailable'); };
  const missing = new SoundPlayer();
  t.after(() => missing.stop());
  assert.equal(await missing.unlock(), true);
  assert.equal(missing.buffers.size, 0);
  assert.equal(missing.play(1), null);
  assert.equal(missing.sources.length, 0);

  globalThis.window = {};
  const unsupported = new SoundPlayer();
  assert.equal(await unsupported.unlock(), false);
  assert.equal(unsupported.play(1), null);

  globalThis.window = { AudioContext: class { constructor() { throw new Error('Device unavailable'); } } };
  const failedDevice = new SoundPlayer();
  assert.equal(await failedDevice.unlock(), false);
  assert.equal(failedDevice.play(1), null);
});
