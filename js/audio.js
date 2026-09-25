// Efeitos sonoros sintetizados com Web Audio (sem arquivos de áudio).
// No iPad/iPhone o áudio só pode começar depois de um toque do usuário.
//
// Canais:
//  - estetoscópio: bulhas B1 "TUM", B2 "TÁ", galope B4 no infarto, sopro do fluxo
//  - monitor: bipe do QRS (tom cai quando a SpO₂ cai, como nos monitores reais),
//             alarmes de prioridade média/alta, linha reta (assistolia)
//  - efeitos: placa, coágulo, desfibrilador (carga, choque), balão e stent
//  - voz: comandos falados do desfibrilador (DEA), em português

export class HeartAudio {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.voiceOn = true;
    this.volume = 0.9;
  }

  async enable() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const c = this.ctx;
      this.master = c.createGain();
      this.master.gain.value = this.volume;
      // compressor evita estourar quando vários sons tocam juntos
      this.comp = c.createDynamicsCompressor();
      this.comp.threshold.value = -14; this.comp.ratio.value = 4;
      this.master.connect(this.comp).connect(c.destination);

      this.heartBus = c.createGain(); this.heartBus.gain.value = 1.0; this.heartBus.connect(this.master);
      this.monBus = c.createGain(); this.monBus.gain.value = 0.55; this.monBus.connect(this.master);
      this.fxBus = c.createGain(); this.fxBus.gain.value = 0.8; this.fxBus.connect(this.master);

      // ruído branco reutilizável (2 s)
      const len = c.sampleRate * 2;
      this.noise = c.createBuffer(1, len, c.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      // ruído marrom (mais grave) para o fluxo de sangue
      this.brown = c.createBuffer(1, len, c.sampleRate);
      const b = this.brown.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }

      this._startFlow();
    }
    if (this.ctx.state !== 'running') await this.ctx.resume();
    // "destrava" o áudio no iOS tocando um buffer vazio
    const s = this.ctx.createBufferSource();
    s.buffer = this.ctx.createBuffer(1, 1, 22050);
    s.connect(this.master); s.start(0);
    this.master.gain.setTargetAtTime(this.volume, this.ctx.currentTime, 0.05);
    this.enabled = true;
    // "acorda" a síntese de voz no iOS (precisa acontecer dentro de um toque)
    if (window.speechSynthesis && !this._voiceWarm) {
      this._voiceWarm = true;
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0; speechSynthesis.speak(u);
    }
  }

  disable() {
    this.enabled = false;
    if (this.ctx) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
    this.flatline(false);
    if (window.speechSynthesis) speechSynthesis.cancel();
  }

  get t() { return this.ctx.currentTime; }
  _ok() { return this.enabled && this.ctx; }

  // envelope rápido
  _env(g, t, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }
  _noiseSrc(buf = this.noise, offset = Math.random()) {
    const n = this.ctx.createBufferSource();
    n.buffer = buf; n.loop = true;
    n.loopStart = 0; n.loopEnd = buf.duration;
    n._off = offset * (buf.duration - 0.5);
    return n;
  }

  // ------------------------------------------------------------ estetoscópio
  // Bulha: componente tonal grave + "estalo" das valvas filtrado
  _valve(t, freq, dur, gain, click = 0.5) {
    const c = this.ctx;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(freq * 1.5, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + dur * 0.4);
    const g = c.createGain(); this._env(g, t, gain, 0.008, dur);
    o.connect(g).connect(this.heartBus);
    o.start(t); o.stop(t + dur + 0.05);
    // harmônico
    const o2 = c.createOscillator(); o2.type = 'triangle'; o2.frequency.value = freq * 2.3;
    const g2 = c.createGain(); this._env(g2, t, gain * 0.25, 0.005, dur * 0.5);
    o2.connect(g2).connect(this.heartBus); o2.start(t); o2.stop(t + dur);
    // estalo (fechamento das valvas)
    const n = this._noiseSrc();
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq * 4; f.Q.value = 1.2;
    const ng = c.createGain(); this._env(ng, t, gain * click, 0.003, dur * 0.45);
    n.connect(f).connect(ng).connect(this.heartBus);
    n.start(t, n._off); n.stop(t + dur);
  }
  // B1 "TUM": fechamento das valvas mitral e tricúspide
  s1(strength = 1) {
    if (!this._ok()) return;
    const t = this.t;
    this._valve(t, 52, 0.17, 0.85 * strength, 0.45);
    this._valve(t + 0.025, 60, 0.12, 0.4 * strength, 0.3);   // desdobramento fisiológico
  }
  // B2 "TÁ": fechamento das valvas aórtica e pulmonar (mais agudo e curto)
  s2(strength = 1) {
    if (!this._ok()) return;
    const t = this.t;
    this._valve(t, 78, 0.1, 0.55 * strength, 0.7);
    this._valve(t + 0.03, 72, 0.08, 0.3 * strength, 0.6);
  }
  // B4: galope atrial (coração rígido após infarto) — som abafado e grave
  s4(strength = 1) {
    if (!this._ok()) return;
    this._valve(this.t, 32, 0.12, 0.45 * strength, 0.1);
  }

  // Sopro contínuo do fluxo de sangue (como um doppler), controlado a cada quadro
  _startFlow() {
    const c = this.ctx;
    const n = this._noiseSrc(this.brown, 0);
    this.flowFilter = c.createBiquadFilter(); this.flowFilter.type = 'lowpass'; this.flowFilter.frequency.value = 300; this.flowFilter.Q.value = 3;
    this.flowGain = c.createGain(); this.flowGain.gain.value = 0;
    n.connect(this.flowFilter).connect(this.flowGain).connect(this.heartBus);
    n.start();
  }
  setFlow(level, turbulence = 0) {
    if (!this.ctx) return;
    const t = this.t;
    const on = this.enabled && this.flowOn !== false;
    this.flowGain.gain.setTargetAtTime(on ? 0.05 + level * 0.28 : 0, t, 0.04);
    this.flowFilter.frequency.setTargetAtTime(180 + level * 520 + turbulence * 600, t, 0.05);
  }

  // ------------------------------------------------------------ monitor
  // O tom do bipe cai quando a saturação cai (padrão de monitores reais)
  monitorBeep(spo2 = 98) {
    if (!this._ok()) return;
    const c = this.ctx, t = this.t;
    const freq = 880 * Math.pow(2, -(Math.max(0, 100 - spo2)) / 12 * 0.5);
    const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const o2 = c.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
    const g = c.createGain(); this._env(g, t, 0.22, 0.004, 0.1);
    const g2 = c.createGain(); g2.gain.value = 0.15;
    o.connect(g); o2.connect(g2).connect(g); g.connect(this.monBus);
    o.start(t); o2.start(t); o.stop(t + 0.12); o2.stop(t + 0.12);
  }

  _alarmTone(t, freq, dur, gain) {
    const c = this.ctx;
    // tom com harmônicos, como os alarmes da norma IEC 60601-1-8
    [1, 2, 3, 4].forEach((h, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq * h;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(gain / (i + 1.5), t + 0.02);
      g.gain.setValueAtTime(gain / (i + 1.5), t + dur - 0.03);
      g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(this.monBus); o.start(t); o.stop(t + dur + 0.01);
    });
  }
  // Prioridade média (amarelo): 3 pulsos
  alarmMedium() {
    if (!this._ok()) return;
    const t = this.t;
    [0, 0.25, 0.5].forEach((d, i) => this._alarmTone(t + d, [523, 659, 784][i], 0.18, 0.18));
  }
  // Prioridade alta (vermelho): 3 + 2 pulsos rápidos
  alarmHigh() {
    if (!this._ok()) return;
    const t = this.t;
    const seq = [0, 0.14, 0.28, 0.62, 0.76];
    const notes = [988, 1175, 1397, 988, 1175];
    seq.forEach((d, i) => this._alarmTone(t + d, notes[i], 0.11, 0.26));
  }
  alarm() { this.alarmHigh(); }

  // Linha reta: tom contínuo
  flatline(on) {
    if (!this.ctx) return;
    if (on && !this._flat && this.enabled) {
      const o = this.ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 880;
      const g = this.ctx.createGain(); g.gain.value = 0;
      g.gain.setTargetAtTime(0.14, this.t, 0.02);
      o.connect(g).connect(this.monBus); o.start();
      this._flat = { o, g };
    } else if (!on && this._flat) {
      const { o, g } = this._flat;
      g.gain.setTargetAtTime(0, this.t, 0.02);
      o.stop(this.t + 0.2);
      this._flat = null;
    }
  }

  // ------------------------------------------------------------ efeitos
  click() {
    if (!this._ok()) return;
    const c = this.ctx, t = this.t;
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(1800, t); o.frequency.exponentialRampToValueAtTime(900, t + 0.03);
    const g = c.createGain(); this._env(g, t, 0.05, 0.002, 0.04);
    o.connect(g).connect(this.fxBus); o.start(t); o.stop(t + 0.06);
  }

  // Transição de etapa: "whoosh" suave
  whoosh(up = true) {
    if (!this._ok()) return;
    const c = this.ctx, t = this.t;
    const n = this._noiseSrc();
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 2;
    f.frequency.setValueAtTime(up ? 300 : 1800, t);
    f.frequency.exponentialRampToValueAtTime(up ? 1800 : 300, t + 0.5);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.18, t + 0.2);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    n.connect(f).connect(g).connect(this.fxBus);
    n.start(t, n._off); n.stop(t + 0.65);
  }

  // Placa de gordura: som pegajoso, borbulhante
  plaque() {
    if (!this._ok()) return;
    const c = this.ctx, t = this.t;
    for (let i = 0; i < 6; i++) {
      const tt = t + i * 0.18 + Math.random() * 0.08;
      const o = c.createOscillator(); o.type = 'sine';
      const f0 = 140 + Math.random() * 120;
      o.frequency.setValueAtTime(f0, tt); o.frequency.exponentialRampToValueAtTime(f0 * 2.2, tt + 0.08);
      const g = c.createGain(); this._env(g, tt, 0.16, 0.01, 0.12);
      o.connect(g).connect(this.fxBus); o.start(tt); o.stop(tt + 0.15);
    }
  }

  // Ruptura da placa + coágulo: estalo, estrondo grave e "rede" se fechando
  clot() {
    if (!this._ok()) return;
    const c = this.ctx, t = this.t;
    // estalo da ruptura
    const n = this._noiseSrc();
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    const g = c.createGain(); this._env(g, t, 0.5, 0.002, 0.12);
    n.connect(hp).connect(g).connect(this.fxBus); n.start(t, n._off); n.stop(t + 0.2);
    // estrondo grave crescente
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(45, t + 0.1); o.frequency.exponentialRampToValueAtTime(28, t + 2.2);
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160;
    const g2 = c.createGain();
    g2.gain.setValueAtTime(0.0001, t + 0.1);
    g2.gain.exponentialRampToValueAtTime(0.35, t + 0.9);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 2.4);
    o.connect(lp).connect(g2).connect(this.fxBus); o.start(t + 0.1); o.stop(t + 2.5);
    // estalinhos (plaquetas grudando)
    for (let i = 0; i < 14; i++) {
      const tt = t + 0.3 + i * 0.1 + Math.random() * 0.06;
      const nn = this._noiseSrc();
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2500 + Math.random() * 2500; bp.Q.value = 8;
      const gg = c.createGain(); this._env(gg, tt, 0.25 * (1 - i / 16), 0.001, 0.03);
      nn.connect(bp).connect(gg).connect(this.fxBus); nn.start(tt, nn._off); nn.stop(tt + 0.05);
    }
  }

  // Tensão dramática (isquemia/infarto): acorde grave dissonante
  tension(dur = 3) {
    if (!this._ok()) return;
    const c = this.ctx, t = this.t;
    [55, 58.3, 82.4].forEach((f) => {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 220;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.09, t + dur * 0.4);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(lp).connect(g).connect(this.fxBus); o.start(t); o.stop(t + dur + 0.05);
    });
  }

  // Desfibrilador carregando: zumbido que sobe
  charge(seconds) {
    if (!this._ok()) return;
    const c = this.ctx, t = this.t;
    const o = c.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(3200, t + seconds);
    const o2 = c.createOscillator(); o2.type = 'sine';
    o2.frequency.setValueAtTime(440, t); o2.frequency.exponentialRampToValueAtTime(6400, t + seconds);
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 0.7;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.2);
    g.gain.setValueAtTime(0.06, t + seconds - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    o.connect(bp); o2.connect(bp); bp.connect(g).connect(this.fxBus);
    o.start(t); o2.start(t); o.stop(t + seconds); o2.stop(t + seconds);
  }
  // Pronto para o choque: bipes rápidos
  ready() {
    if (!this._ok()) return;
    const t = this.t;
    for (let i = 0; i < 4; i++) this._alarmTone(t + i * 0.16, 1568, 0.09, 0.14);
  }
  // Choque: estalo elétrico + pancada grave
  shock() {
    if (!this._ok()) return;
    const c = this.ctx, t = this.t;
    const n = this._noiseSrc();
    const g = c.createGain(); this._env(g, t, 0.9, 0.001, 0.22);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500;
    n.connect(hp).connect(g).connect(this.fxBus); n.start(t, n._off); n.stop(t + 0.3);
    // crepitação elétrica
    for (let i = 0; i < 18; i++) {
      const tt = t + Math.random() * 0.18;
      const nn = this._noiseSrc();
      const gg = c.createGain(); this._env(gg, tt, 0.4, 0.001, 0.015);
      nn.connect(gg).connect(this.fxBus); nn.start(tt, nn._off); nn.stop(tt + 0.03);
    }
    // pancada no peito
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(30, t + 0.4);
    const go = c.createGain(); this._env(go, t, 1.0, 0.005, 0.5);
    o.connect(go).connect(this.fxBus); o.start(t); o.stop(t + 0.6);
  }

  // Balão da angioplastia inflando + stent travando + sucesso
  stent() {
    if (!this._ok()) return;
    const c = this.ctx, t = this.t;
    // bomba de insuflação (chiado que sobe)
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.45;
      const n = this._noiseSrc();
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
      bp.frequency.setValueAtTime(600, tt); bp.frequency.exponentialRampToValueAtTime(2400, tt + 0.35);
      const g = c.createGain(); this._env(g, tt, 0.2, 0.05, 0.3);
      n.connect(bp).connect(g).connect(this.fxBus); n.start(tt, n._off); n.stop(tt + 0.4);
    }
    // clique metálico do stent
    const tc = t + 1.45;
    [2637, 3520, 4186].forEach((f) => {
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = f;
      const g = c.createGain(); this._env(g, tc, 0.08, 0.001, 0.25);
      o.connect(g).connect(this.fxBus); o.start(tc); o.stop(tc + 0.3);
    });
    // "sangue volta a passar": whoosh
    setTimeout(() => this.whoosh(true), 1700);
    // acorde de sucesso
    const ts = t + 2.2;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain(); this._env(g, ts + i * 0.08, 0.1, 0.02, 1.2);
      o.connect(g).connect(this.fxBus); o.start(ts + i * 0.08); o.stop(ts + i * 0.08 + 1.3);
    });
  }

  // Ritmo voltou: acorde curto
  success() {
    if (!this._ok()) return;
    const c = this.ctx, t = this.t;
    [659.25, 987.77].forEach((f, i) => {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const g = c.createGain(); this._env(g, t + i * 0.12, 0.12, 0.01, 0.6);
      o.connect(g).connect(this.fxBus); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.7);
    });
  }

  // ------------------------------------------------------------ voz (DEA)
  say(text, { rate = 1.05, pitch = 0.9 } = {}) {
    if (!this.enabled || !this.voiceOn || !window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR'; u.rate = rate; u.pitch = pitch; u.volume = 1;
    const voices = speechSynthesis.getVoices();
    const v = voices.find((x) => x.lang === 'pt-BR') || voices.find((x) => x.lang && x.lang.startsWith('pt'));
    if (v) u.voice = v;
    speechSynthesis.speak(u);
  }
  hush() { if (window.speechSynthesis) speechSynthesis.cancel(); }
}
