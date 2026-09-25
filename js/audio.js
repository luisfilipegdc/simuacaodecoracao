// Sons sintetizados com Web Audio (sem arquivos externos).
// No iPad/iPhone o áudio só pode começar depois de um toque do usuário.

export class HeartAudio {
  constructor() { this.ctx = null; this.enabled = false; this.beep = true; }

  async enable() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      // ruído reutilizável
      const len = this.ctx.sampleRate * 1;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    // "destrava" o áudio no iOS tocando um buffer vazio
    const b = this.ctx.createBufferSource();
    b.buffer = this.ctx.createBuffer(1, 1, 22050);
    b.connect(this.master); b.start(0);
    this.enabled = true;
  }
  disable() { this.enabled = false; }

  // Bulha cardíaca: pulso grave filtrado ("tum" = B1, "tá" = B2)
  thump(freq, dur, gain) {
    if (!this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.6, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + dur * 0.5);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
    const n = c.createBufferSource(); n.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq * 3;
    const ng = c.createGain();
    ng.gain.setValueAtTime(gain * 0.5, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.7);
    n.connect(f).connect(ng).connect(this.master);
    n.start(t, Math.random() * 0.5, dur);
  }
  s1() { this.thump(55, 0.16, 0.9); }
  s2() { this.thump(80, 0.11, 0.6); }

  monitorBeep(high = false) {
    if (!this.enabled || !this.beep) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.value = high ? 1046 : 880;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + 0.1);
  }

  alarm() {
    if (!this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    [0, 0.18, 0.36].forEach((dt, i) => {
      const o = c.createOscillator(); o.type = 'square';
      o.frequency.value = i === 1 ? 740 : 988;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t + dt);
      g.gain.exponentialRampToValueAtTime(0.06, t + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.15);
      o.connect(g).connect(this.master); o.start(t + dt); o.stop(t + dt + 0.16);
    });
  }

  charge(seconds) {
    if (!this.enabled) return;
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(2400, t + seconds);
    const g = c.createGain(); g.gain.value = 0.03;
    g.gain.setValueAtTime(0.03, t + seconds - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + seconds);
  }

  shock() {
    if (!this.enabled) return;
    this.thump(40, 0.5, 1.0);
    const c = this.ctx, t = c.currentTime;
    const n = c.createBufferSource(); n.buffer = this.noise;
    const g = c.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    n.connect(g).connect(this.master); n.start(t, 0, 0.3);
  }
}
