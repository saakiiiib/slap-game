const tiers = ['soft', 'medium', 'hard'];
const clamp = (value, fallback = 0) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
const CROSSFADE = 0.035;
export class SoundPlayer {
  constructor({ muted = false, volume = 0.65 } = {}) {
    this.muted = Boolean(muted); this.volume = clamp(volume, 0.65); this.context = null; this.sources = [];
    this.buffers = new Map(); this.pending = null;
    this.files = Promise.all(tiers.flatMap(tier => ['impact', 'voice'].map(async kind => {
      const key = `${kind}-${tier}`;
      try {
        const response = await fetch(new URL(`./assets/audio/${key}.wav`, import.meta.url));
        if (!response.ok) throw new Error('Sound asset unavailable');
        return [key, await response.arrayBuffer()];
      } catch { return [key, null]; }
    })));
  }
  async unlock() {
    try {
      if (!this.context) {
        const Audio = window.AudioContext || window.webkitAudioContext;
        if (!Audio) return false;
        this.context = new Audio();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;
        const limiter = this.context.createDynamicsCompressor();
        limiter.threshold.value = -9; limiter.knee.value = 5; limiter.ratio.value = 20;
        limiter.attack.value = 0.002; limiter.release.value = 0.08;
        // Catch attack transients during the brief vocal crossfade as well.
        const ceiling = this.context.createWaveShaper();
        ceiling.curve = Float32Array.from({ length: 4097 }, (_, i) => {
          const sample = i / 2048 - 1, level = Math.abs(sample);
          return level <= 0.8 ? sample : Math.sign(sample) * (0.8 + 0.16 * Math.tanh((level - 0.8) / 0.16));
        });
        this.master.connect(limiter).connect(ceiling).connect(this.context.destination);
        this.pending = this.files.then(files => Promise.all(files.map(async ([key, bytes]) => {
          if (!bytes) return;
          try { this.buffers.set(key, await this.context.decodeAudioData(bytes)); } catch { /* Silent fallback. */ }
        })));
      }
      if (this.context.state === 'suspended') await this.context.resume();
      await this.pending;
      return this.context.state === 'running';
    } catch { return false; }
  }
  setPreferences(muted, volume) {
    this.muted = Boolean(muted); this.volume = clamp(volume, this.volume);
    if (this.master) this.master.gain.setValueAtTime(this.muted ? 0 : this.volume, this.context.currentTime);
    if (this.muted) this.stop();
  }
  discard(record) {
    try { record.source.stop(); } catch { /* Already finished. */ }
    try { record.source.disconnect(); record.gain.disconnect(); } catch { /* Already detached. */ }
    this.sources = this.sources.filter(active => active !== record);
  }
  stop() {
    for (const record of [...this.sources]) this.discard(record);
  }
  play(power, agitation = 0) {
    if (this.muted || !this.context || this.context.state !== 'running') return null;
    power = clamp(power); agitation = clamp(agitation);
    const intensity = clamp(power + agitation * 0.32);
    const tier = intensity < 0.34 ? 'soft' : intensity < 0.72 ? 'medium' : 'hard';
    const now = this.context.currentTime;
    let reaction = null;
    try {
      for (const record of [...this.sources]) if (record.end <= now) this.discard(record);
      for (const kind of ['impact', 'voice']) {
        const buffer = this.buffers.get(`${kind}-${tier}`);
        if (!buffer) continue;
        const previous = this.sources.filter(record => record.kind === kind);
        // Bound both channels, including an outgoing voice still fading out.
        while (previous.length >= 2) this.discard(previous.shift());
        if (kind === 'voice') for (const record of previous) {
          const gain = record.gain.gain;
          if (typeof gain.cancelAndHoldAtTime === 'function') gain.cancelAndHoldAtTime(now);
          else { gain.cancelScheduledValues(now); gain.setValueAtTime(record.level, now); }
          gain.linearRampToValueAtTime(0, now + CROSSFADE);
          record.source.stop(now + CROSSFADE + 0.005);
          record.end = Math.min(record.end, now + CROSSFADE + 0.005);
        }
        const source = this.context.createBufferSource(); source.buffer = buffer;
        // Pitch variation keeps the recorded open-vowel yelps playful. Higher
        // intensity selects a longer "aaah" and lowers its pitch a little.
        const rate = kind === 'voice' ? 1.12 - intensity * 0.1 + (Math.random() - 0.5) * 0.035 : 1.02;
        const start = now + (kind === 'voice' ? 0.022 : 0);
        const duration = buffer.duration / rate;
        const level = kind === 'voice' ? 0.78 + intensity * 0.12 : 0.18 + power * 0.13;
        const gain = this.context.createGain();
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(level, start + 0.009);
        gain.gain.setValueAtTime(level, Math.max(start + 0.009, start + duration - 0.055));
        gain.gain.linearRampToValueAtTime(0, start + duration);
        source.playbackRate.value = rate;
        source.connect(gain).connect(this.master);
        const record = { kind, source, gain, level, end: start + duration };
        source.onended = () => {
          source.disconnect(); gain.disconnect(); this.sources = this.sources.filter(active => active !== record);
        };
        this.sources.push(record);
        source.start(start);
        if (kind === 'voice') reaction = { duration: duration + 0.022, tier };
      }
    } catch { /* A failed sound device must not interrupt a hit. */ }
    return reaction;
  }
}
