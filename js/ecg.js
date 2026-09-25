// Forma de onda do ECG (derivação II) e traçado do monitor multiparamétrico.

const g = (x, mu, s) => Math.exp(-((x - mu) * (x - mu)) / (2 * s * s));

/**
 * Valor do ECG em mV.
 * s: segundos desde o início da onda P; T: duração do ciclo (s)
 * st: supradesnivelamento do segmento ST (isquemia aguda)
 * qwave: onda Q patológica (necrose)
 */
export function ecgSinus(s, T, { st = 0, qwave = 0 } = {}) {
  const k = Math.sqrt(T / 0.833);
  let v = 0;
  v += 0.15 * g(s, 0.06, 0.022);                       // onda P (átrios)
  v += -(0.1 + 0.35 * qwave) * g(s, 0.142, 0.009 + 0.004 * qwave); // Q
  v += (1.25 - 0.45 * qwave) * g(s, 0.162, 0.0085);    // R
  v += -0.28 * g(s, 0.182, 0.009);                     // S
  const tMu = 0.2 + 0.17 * k;
  v += (0.3 + st * 0.45) * g(s, tMu, 0.045 * k);       // onda T (repolarização)
  // segmento ST elevado ("onda de Pardee")
  const stStart = 0.19, stEnd = tMu;
  if (s > stStart && s < stEnd + 0.08 * k) {
    const a = Math.min(1, (s - stStart) / 0.015);
    const b = Math.max(0, 1 - Math.max(0, s - stEnd) / (0.08 * k));
    v += st * a * b;
  }
  return v;
}

// Fibrilação ventricular: atividade elétrica caótica
export function ecgVF(t) {
  return 0.45 * Math.sin(t * 2 * Math.PI * 5.1 + Math.sin(t * 1.3) * 3)
    + 0.25 * Math.sin(t * 2 * Math.PI * 7.3 + 1.7) * (0.6 + 0.4 * Math.sin(t * 0.7))
    + 0.15 * Math.sin(t * 2 * Math.PI * 3.2 + Math.sin(t * 2.1) * 2);
}

// Onda de pletismografia (oxímetro): pulso do dedo, atrasado em relação ao QRS
export function pleth(s, T, amp = 1) {
  const x = (((s - 0.34) % T) + T) % T;
  const up = 1 - Math.exp(-Math.max(0, x) / 0.05);
  const decay = Math.exp(-Math.max(0, x - 0.1) / 0.28);
  const notch = 0.12 * g(x, 0.34, 0.03);
  return amp * (up * decay + notch);
}

/** Traçado estilo monitor: a caneta varre da esquerda para a direita. */
export class SweepTrace {
  constructor(canvas, { color = '#39ff7a', min = -0.6, max = 1.6, seconds = 5, width = 2 } = {}) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.color = color; this.min = min; this.max = max; this.seconds = seconds; this.lineW = width;
    this.x = 0; this.lastY = null;
    this.resize();
  }
  resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(10, Math.round(r.width * dpr)), h = Math.max(10, Math.round(r.height * dpr));
    if (this.cv.width !== w || this.cv.height !== h) {
      this.cv.width = w; this.cv.height = h; this.dpr = dpr; this.x = 0; this.lastY = null;
      this.ctx.clearRect(0, 0, w, h);
    }
    this.dpr = dpr;
  }
  // Adiciona amostras (valores) correspondentes a "dt" segundos
  push(values, dt) {
    const { ctx, cv } = this;
    const pxPerSec = cv.width / this.seconds;
    const dx = (pxPerSec * dt) / values.length;
    const gap = 14 * this.dpr;
    ctx.lineWidth = this.lineW * this.dpr;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 6 * this.dpr;
    for (const v of values) {
      const y = cv.height - ((v - this.min) / (this.max - this.min)) * cv.height;
      const nx = this.x + dx;
      ctx.save(); ctx.shadowBlur = 0;
      ctx.clearRect(this.x, 0, dx + gap, cv.height);
      ctx.restore();
      if (this.lastY !== null) {
        ctx.beginPath(); ctx.moveTo(this.x, this.lastY); ctx.lineTo(nx, y); ctx.stroke();
      }
      this.x = nx; this.lastY = y;
      if (this.x >= cv.width) { this.x = 0; this.lastY = null; }
    }
  }
}
