// Corte longitudinal da artéria descendente anterior (DA):
// hemácias fluindo, placa de gordura, coágulo e stent.

export class ArteryView {
  constructor(canvas) {
    this.cv = canvas;
    this.ctx = canvas.getContext('2d');
    this.cells = [];
    this.platelets = [];
    this.params = { plaque: 0, clot: 0, stent: 0, flow: 1 };
    this.t = 0;
    this.resize();
    for (let i = 0; i < 70; i++) this.cells.push(this.newCell(Math.random()));
    for (let i = 0; i < 18; i++) this.platelets.push({ x: Math.random(), y: Math.random() * 2 - 1, s: 0.5 + Math.random() * 0.5 });
  }
  resize() {
    const r = this.cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.cv.width = Math.max(10, Math.round(r.width * dpr));
    this.h = this.cv.height = Math.max(10, Math.round(r.height * dpr));
    this.dpr = dpr;
  }
  newCell(x = -0.05) {
    return { x, y: (Math.random() * 2 - 1) * 0.8, rot: Math.random() * Math.PI, spin: (Math.random() - 0.5) * 2, s: 0.8 + Math.random() * 0.4, pack: Math.random() * 0.2 };
  }
  // meia-altura livre (0..1) da luz da artéria na posição x (0..1)
  openAt(x) {
    const { plaque, clot, stent } = this.params;
    const bump = Math.exp(-((x - 0.55) ** 2) / (2 * 0.07 ** 2));
    let narrow = plaque * 0.6 * bump * (1 - stent * 0.85);
    narrow += clot * 0.45 * Math.exp(-((x - 0.55) ** 2) / (2 * 0.05 ** 2)) * (1 - stent);
    return Math.max(0, 1 - narrow);
  }
  update(dt) {
    this.t += dt;
    const { flow } = this.params;
    const blockX = 0.55;
    for (const c of this.cells) {
      const open = Math.max(0.05, this.openAt(c.x));
      // continuidade: onde a artéria é mais estreita, o sangue corre mais rápido
      let v = (0.18 * flow) / open;
      if (flow < 0.05) {
        // sem fluxo: o sangue se acumula atrás do coágulo; depois dele fica parado
        if (c.x < blockX - 0.04) c.x = Math.min(c.x + 0.04 * dt, blockX - 0.07 - c.pack);
      } else {
        c.x += v * dt;
      }
      c.rot += c.spin * dt;
      // mantém a célula dentro da luz
      const lim = open * 0.82;
      if (Math.abs(c.y) > lim) c.y = Math.sign(c.y) * lim;
      if (c.x > 1.05) Object.assign(c, this.newCell());
    }
  }
  draw() {
    const { ctx, w, h, dpr } = this;
    const { plaque, clot, stent, flow } = this.params;
    ctx.clearRect(0, 0, w, h);
    const cy = h / 2, R = h * 0.33, wall = h * 0.12;
    const X = (x) => x * w;
    // tecido ao redor
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#3b0d14'); bg.addColorStop(0.5, '#200509'); bg.addColorStop(1, '#3b0d14');
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    // parede arterial
    ctx.fillStyle = '#b44a45';
    ctx.fillRect(0, cy - R - wall, w, wall);
    ctx.fillRect(0, cy + R, w, wall);
    ctx.fillStyle = 'rgba(255,200,190,0.25)';
    ctx.fillRect(0, cy - R - 2 * dpr, w, 2 * dpr);
    ctx.fillRect(0, cy + R, w, 2 * dpr);
    // luz (sangue): mais escuro depois do bloqueio quando não há fluxo
    const lg = ctx.createLinearGradient(0, 0, w, 0);
    const after = flow < 0.3 ? 'rgba(60,8,14,1)' : 'rgba(120,12,22,1)';
    lg.addColorStop(0, '#7a0c16'); lg.addColorStop(0.5, '#7a0c16'); lg.addColorStop(0.62, after); lg.addColorStop(1, after);
    ctx.fillStyle = lg; ctx.fillRect(0, cy - R, w, 2 * R);

    // placa de ateroma (gordura/colesterol) nas duas paredes
    if (plaque > 0.01) {
      for (const side of [-1, 1]) {
        ctx.beginPath();
        const amp = side === -1 ? 1 : 0.55;
        ctx.moveTo(X(0.3), cy + side * R);
        for (let i = 0; i <= 60; i++) {
          const x = 0.3 + 0.5 * (i / 60);
          const bump = Math.exp(-((x - 0.55) ** 2) / (2 * 0.07 ** 2)) * plaque * 0.62 * amp * (1 - stent * 0.85);
          const wob = 1 + 0.08 * Math.sin(i * 1.7);
          ctx.lineTo(X(x), cy + side * R * (1 - bump * wob));
        }
        ctx.lineTo(X(0.8), cy + side * R);
        ctx.closePath();
        const pg = ctx.createRadialGradient(X(0.55), cy + side * R, 2, X(0.55), cy + side * R, R);
        pg.addColorStop(0, '#fff0b0'); pg.addColorStop(0.6, '#e8c45a'); pg.addColorStop(1, '#c79a36');
        ctx.fillStyle = pg; ctx.fill();
        // cristais de colesterol
        ctx.fillStyle = 'rgba(255,255,230,0.6)';
        for (let i = 0; i < 12; i++) {
          const x = 0.47 + (i * 0.013);
          const y = cy + side * R * (1 - 0.25 * plaque * amp * Math.abs(Math.sin(i * 2.3)));
          ctx.fillRect(X(x), y, 3 * dpr, 1.2 * dpr);
        }
      }
    }

    // hemácias
    for (const c of this.cells) {
      const px = X(c.x), py = cy + c.y * R;
      const s = R * 0.16 * c.s;
      ctx.save(); ctx.translate(px, py); ctx.rotate(c.rot);
      ctx.fillStyle = '#e0303a';
      ctx.beginPath(); ctx.ellipse(0, 0, s, s * 0.45 + s * 0.35 * Math.abs(Math.cos(c.rot)), 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(120,0,10,0.45)';
      ctx.beginPath(); ctx.ellipse(0, 0, s * 0.45, s * 0.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // coágulo: rede de fibrina + hemácias presas
    if (clot > 0.01 && stent < 0.99) {
      const k = clot * (1 - stent);
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 1.2);
      const cx = X(0.55);
      const cw = w * 0.07 * (0.4 + 0.6 * k);
      const ch = R * 1.05 * k;
      const cgr = ctx.createRadialGradient(cx, cy, 2, cx, cy, Math.max(cw, ch));
      cgr.addColorStop(0, '#5a0a10'); cgr.addColorStop(1, '#2a0306');
      ctx.fillStyle = cgr;
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = (i / 40) * Math.PI * 2;
        const rr = 1 + 0.12 * Math.sin(a * 7 + 1) + 0.08 * Math.sin(a * 13);
        ctx.lineTo(cx + Math.cos(a) * cw * rr, cy - R * 0.25 + Math.sin(a) * ch * rr);
      }
      ctx.fill();
      ctx.strokeStyle = 'rgba(240,220,200,0.45)'; ctx.lineWidth = 0.8 * dpr;
      for (let i = 0; i < 18; i++) {
        const a = i * 2.39;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * cw * 0.9, cy - R * 0.25 + Math.sin(a) * ch * 0.9);
        ctx.lineTo(cx + Math.cos(a + 2.2) * cw * 0.8, cy - R * 0.25 + Math.sin(a + 2.2) * ch * 0.8);
        ctx.stroke();
      }
      ctx.restore();
    }

    // stent (malha metálica expandida)
    if (stent > 0.01) {
      ctx.save();
      ctx.globalAlpha = stent;
      ctx.strokeStyle = '#dfe6ee'; ctx.lineWidth = 2 * dpr;
      const x0 = X(0.4), x1 = X(0.7), n = 10;
      for (let i = 0; i < n; i++) {
        const a = x0 + ((x1 - x0) * i) / n, b = x0 + ((x1 - x0) * (i + 1)) / n;
        for (const side of [-1, 1]) {
          const y = cy + side * R * 0.96;
          ctx.beginPath(); ctx.moveTo(a, y); ctx.lineTo((a + b) / 2, y - side * 6 * dpr); ctx.lineTo(b, y); ctx.stroke();
        }
      }
      ctx.restore();
    }

    // setas de fluxo
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.font = `${11 * dpr}px system-ui, sans-serif`;
    ctx.fillText('fluxo →', 8 * dpr, cy - R - wall - 4 * dpr > 10 * dpr ? cy - R - wall - 4 * dpr : 12 * dpr);
    if (flow < 0.05) {
      ctx.fillStyle = 'rgba(255,90,90,0.9)';
      ctx.fillText('SEM FLUXO', X(0.7), cy + R + wall + 12 * dpr);
    }
  }
}
