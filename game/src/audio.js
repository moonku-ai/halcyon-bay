// Halcyon Bay — procedural WebAudio: engine hum, sirens, gunfire, explosions,
// pickups, a tiny bass-line music loop and city ambience. No audio files.
export class SoundEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicOn = true;
    this.engineOsc = null;
    this.engineGain = null;
    this.engineFilter = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenTimer = 0;
    this.sirenHigh = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.ambience = null;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    this.startEngine();
    this.startAmbience();
    this.startMusic();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.55;
  }

  toggleMusic() { this.musicOn = !this.musicOn; return this.musicOn; }

  noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  startEngine() {
    const c = this.ctx;
    this.engineOsc = c.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 55;
    const osc2 = c.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 28;
    this.engineFilter = c.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 320;
    this.engineGain = c.createGain();
    this.engineGain.gain.value = 0.0;
    this.engineOsc.connect(this.engineFilter);
    osc2.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
    osc2.start();
    this.engineOsc2 = osc2;
  }

  // speedNorm 0..1, on = player is driving.
  setEngine(speedNorm, on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const target = on ? 0.05 + speedNorm * 0.075 : 0.0;
    this.engineGain.gain.setTargetAtTime(target, t, 0.08);
    const f = 48 + speedNorm * 130;
    this.engineOsc.frequency.setTargetAtTime(f, t, 0.06);
    this.engineOsc2.frequency.setTargetAtTime(f * 0.5, t, 0.06);
    this.engineFilter.frequency.setTargetAtTime(280 + speedNorm * 900, t, 0.1);
  }

  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const c = this.ctx;
      this.sirenOsc = c.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 720;
      this.sirenGain = c.createGain();
      this.sirenGain.gain.value = 0.035;
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start();
      this.sirenTimer = 0;
      this.sirenHigh = false;
    } else if (!on && this.sirenOsc) {
      try { this.sirenOsc.stop(); } catch (e) { /* already stopped */ }
      this.sirenOsc.disconnect();
      this.sirenOsc = null;
    }
  }

  updateSiren(dt) {
    if (!this.sirenOsc) return;
    this.sirenTimer += dt;
    if (this.sirenTimer > 0.42) {
      this.sirenTimer = 0;
      this.sirenHigh = !this.sirenHigh;
      this.sirenOsc.frequency.setTargetAtTime(this.sirenHigh ? 980 : 720, this.ctx.currentTime, 0.02);
    }
  }

  startAmbience() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer(3);
    src.loop = true;
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 220;
    const g = c.createGain();
    g.gain.value = 0.035;
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start();
    this.ambience = src;
  }

  blip(freq, dur, type, vol, when = 0) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type || 'sine';
    o.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(vol || 0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  }

  gunshot() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer(0.14);
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(3200, t);
    filt.frequency.exponentialRampToValueAtTime(300, t + 0.12);
    const g = c.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t);
    this.blip(160, 0.08, 'square', 0.12);
  }

  explosion() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer(0.9);
    const filt = c.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.setValueAtTime(900, t);
    filt.frequency.exponentialRampToValueAtTime(60, t + 0.85);
    const g = c.createGain();
    g.gain.setValueAtTime(0.8, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    src.connect(filt); filt.connect(g); g.connect(this.master);
    src.start(t);
    this.blip(55, 0.5, 'sine', 0.35);
  }

  thud() {
    if (!this.ctx) return;
    this.blip(90, 0.12, 'sine', 0.3);
  }

  pickup() {
    this.blip(660, 0.09, 'sine', 0.18);
    this.blip(990, 0.14, 'sine', 0.18, 0.08);
  }

  cash() {
    this.blip(880, 0.08, 'triangle', 0.16);
    this.blip(1174, 0.08, 'triangle', 0.16, 0.07);
    this.blip(1568, 0.16, 'triangle', 0.16, 0.14);
  }

  denied() { this.blip(180, 0.15, 'square', 0.12); }

  missionDone() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((n, i) => this.blip(n, 0.22, 'triangle', 0.2, i * 0.11));
  }

  missionFail() {
    const notes = [392, 330, 262];
    notes.forEach((n, i) => this.blip(n, 0.3, 'sawtooth', 0.1, i * 0.14));
  }

  startMusic() {
    // Slow sunset-drive bass line: A minor walk, one step per 240 ms.
    const bass = [55, 0, 55, 0, 65.4, 0, 55, 0, 49, 0, 49, 0, 58.3, 0, 65.4, 0];
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted || !this.musicOn) return;
      const n = bass[this.musicStep % bass.length];
      this.musicStep++;
      if (n > 0) this.blip(n, 0.22, 'triangle', 0.055);
      if (this.musicStep % 4 === 2) this.blip(220, 0.05, 'sine', 0.02);
    }, 240);
  }
}
