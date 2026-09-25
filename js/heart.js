import * as THREE from '../vendor/three/three.module.js';
import { patchMaterial } from './shaders.js';

// ---------- utilidades ----------
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gauss = (x, s) => Math.exp(-(x * x) / (2 * s * s));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function hash(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  let xf = x - xi, yf = y - yi, zf = z - zi;
  xf = xf * xf * (3 - 2 * xf); yf = yf * yf * (3 - 2 * yf); zf = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), xf), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), xf), yf),
    l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), xf), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), xf), yf), zf);
}
const fbm = (x, y, z) => noise3(x, y, z) * 0.55 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise3(x * 4.3, y * 4.3, z * 4.3) * 0.15;

// Seed fixa para o desenho das texturas ficar sempre igual
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// Inclinação do eixo do coração: o ápice aponta para a esquerda do paciente
export const TILT = 0.5;
const tiltInv = new THREE.Matrix4().makeRotationZ(-TILT);
const pivot = new THREE.Vector3(0, 0.9, 0);
// Converte um ponto dado com "para cima = céu" para o sistema local do coração
// (os grandes vasos sobem verticalmente mesmo com o coração inclinado).
function W(x, y, z) {
  return new THREE.Vector3(x, y, z).sub(pivot).applyMatrix4(tiltInv).add(pivot);
}

// ---------- forma dos ventrículos ----------
export const antGroovePhi = (t) => 0.34 + 0.3 * Math.pow(1 - (t + 1) / 2, 1.3);
export const postGroovePhi = (t) => -2.7 - 0.2 * (1 - (t + 1) / 2);

export function ventShape(phi, t, out = new THREE.Vector3()) {
  const s = Math.sqrt(Math.max(0, 1 - t * t));
  const y = t >= 0 ? t * 0.95 : t * 1.6;
  let r = Math.pow(s, 0.85) * (0.5 + 0.5 * ss(-1.0, 0.3, t));
  // VE mais volumoso atrás/à esquerda; VD à frente/à direita
  r *= 1 + 0.08 * gauss(wrap(phi - 1.9), 0.8) + 0.05 * gauss(wrap(phi + 0.7), 0.7) * ss(-0.7, 0.0, t);
  // sulcos interventriculares anterior e posterior
  r *= 1 - 0.045 * gauss(wrap(phi - antGroovePhi(t)), 0.08) * ss(-0.95, -0.65, t);
  r *= 1 - 0.035 * gauss(wrap(phi - postGroovePhi(t)), 0.09) * ss(-0.95, -0.6, t);
  // sulco coronário (atrioventricular)
  r *= 1 - 0.07 * gauss(t - 0.84, 0.06);
  const px = Math.sin(phi), pz = Math.cos(phi);
  r *= 1 + 0.02 * (fbm(px * 2 + 5, y * 2, pz * 2) - 0.5);
  return out.set(r * px * 1.08, y, r * pz * 0.8);
}

// Normal numérica de uma superfície paramétrica
function paramNormal(fn, u, v, p) {
  const e = 1e-3;
  const a = fn(u + e, v).sub(fn(u - e, v));
  const b = fn(u, v + e).sub(fn(u, v - e));
  return new THREE.Vector3().crossVectors(a, b);
}

// Ponto na superfície dos ventrículos, afastado da superfície por "lift"
export function surfacePoint(phi, t, lift = 0) {
  const p = ventShape(phi, t);
  if (lift) {
    const n = paramNormal((a, b) => ventShape(a, b), phi, t, p).normalize();
    if (n.dot(new THREE.Vector3(p.x, 0, p.z)) < 0) n.negate();
    p.addScaledVector(n, lift);
  }
  return p;
}

// Geometria paramétrica genérica: fn(u, v) -> Vector3, u,v em [0,1]
function paramGeometry(fn, nu, nv, center) {
  const pos = [], nor = [], uv = [], idx = [];
  const e = 1e-3;
  for (let j = 0; j <= nv; j++) {
    const v = j / nv;
    for (let i = 0; i <= nu; i++) {
      const u = i / nu;
      const p = fn(u, v);
      const du = fn(u + e, v).sub(fn(u - e, v));
      const dv = fn(u, Math.min(1, v + e)).sub(fn(u, Math.max(0, v - e)));
      let n = new THREE.Vector3().crossVectors(du, dv);
      const out = p.clone().sub(center);
      if (n.lengthSq() < 1e-12) n = out.clone();
      n.normalize();
      if (n.dot(out) < 0) n.negate();
      pos.push(p.x, p.y, p.z); nor.push(n.x, n.y, n.z); uv.push(u, v);
    }
  }
  // escolhe a ordem dos vértices para os triângulos ficarem voltados para fora
  const V = (k) => new THREE.Vector3(pos[k * 3], pos[k * 3 + 1], pos[k * 3 + 2]);
  const a0 = (nv >> 1) * (nu + 1) + (nu >> 2);
  const fn0 = new THREE.Vector3().crossVectors(V(a0 + nu + 1).sub(V(a0)), V(a0 + 1).sub(V(a0)));
  const flip = fn0.dot(new THREE.Vector3(nor[a0 * 3], nor[a0 * 3 + 1], nor[a0 * 3 + 2])) < 0;
  for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
    const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
    if (flip) idx.push(a, b, c, b, d, c);
    else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Tubo com raio variável ao longo do caminho
function tubeGeometry(curve, radiusFn, segs, radial) {
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], nor = [], uv = [], idx = [];
  const P = new THREE.Vector3(), n = new THREE.Vector3();
  for (let i = 0; i <= segs; i++) {
    const u = i / segs;
    curve.getPointAt(u, P);
    const N = frames.normals[i], B = frames.binormals[i];
    const r = radiusFn(u);
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      n.set(0, 0, 0).addScaledVector(N, -Math.cos(a)).addScaledVector(B, Math.sin(a)).normalize();
      pos.push(P.x + n.x * r, P.y + n.y * r, P.z + n.z * r);
      nor.push(n.x, n.y, n.z);
      uv.push(u * 4, j / radial);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// Tampa de vaso cortado: anel da parede + luz (interior) escura
function vesselCap(curve, r, wallMat, lumenMat) {
  const end = curve.getPointAt(1);
  const tan = curve.getTangentAt(1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), tan);
  const ring = new THREE.RingGeometry(r * 0.72, r * 1.0, 40, 1);
  ring.applyQuaternion(q); ring.translate(end.x, end.y, end.z);
  const disk = new THREE.CircleGeometry(r * 0.74, 40);
  disk.applyQuaternion(q);
  const back = end.clone().addScaledVector(tan, -r * 0.08);
  disk.translate(back.x, back.y, back.z);
  return [new THREE.Mesh(ring, wallMat), new THREE.Mesh(disk, lumenMat)];
}

// ---------- texturas procedurais ----------
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function blob(ctx, x, y, r, color, alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color.replace('A', alpha));
  g.addColorStop(0.6, color.replace('A', alpha * 0.6));
  g.addColorStop(1, color.replace('A', 0));
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
}

function makeMyocardiumTextures(W_, H_) {
  const col = canvas(W_, H_), bump = canvas(W_, H_);
  const c = col.getContext('2d'), b = bump.getContext('2d');
  c.fillStyle = '#6b171b'; c.fillRect(0, 0, W_, H_);
  b.fillStyle = '#808080'; b.fillRect(0, 0, W_, H_);
  // manchas do músculo
  const reds = ['rgba(120,26,30,A)', 'rgba(90,14,20,A)', 'rgba(140,40,40,A)', 'rgba(75,12,18,A)', 'rgba(150,55,50,A)'];
  for (let i = 0; i < 1800; i++) {
    blob(c, rnd() * W_, rnd() * H_, 8 + rnd() * 50, reds[(rnd() * reds.length) | 0], 0.18);
  }
  // fibras musculares helicoidais
  for (let i = 0; i < 1400; i++) {
    const x = rnd() * W_, y = rnd() * H_, len = 30 + rnd() * 90, ang = -0.7 + rnd() * 0.25;
    c.strokeStyle = `rgba(40,5,10,${0.05 + rnd() * 0.07})`;
    c.lineWidth = 1 + rnd() * 1.5;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); c.stroke();
    b.strokeStyle = `rgba(${rnd() < 0.5 ? '60,60,60' : '170,170,170'},0.25)`;
    b.lineWidth = 1 + rnd() * 2;
    b.beginPath(); b.moveTo(x, y); b.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); b.stroke();
  }
  // pequenos vasos na superfície
  for (let i = 0; i < 160; i++) {
    let x = rnd() * W_, y = rnd() * H_;
    c.strokeStyle = `rgba(70,10,30,${0.18 + rnd() * 0.18})`;
    c.lineWidth = 0.8 + rnd();
    c.beginPath(); c.moveTo(x, y);
    for (let k = 0; k < 8; k++) { x += (rnd() - 0.5) * 30; y += 6 + rnd() * 14; c.lineTo(x, y); }
    c.stroke();
  }
  // gordura epicárdica: sulco coronário e sulcos interventriculares
  const fats = ['rgba(222,186,98,A)', 'rgba(236,205,120,A)', 'rgba(205,160,80,A)', 'rgba(240,215,150,A)'];
  const fatAt = (u, v, spread, n, size) => {
    for (let i = 0; i < n; i++) {
      const x = (u + (rnd() - 0.5) * spread[0]) * W_;
      const y = (1 - (v + (rnd() - 0.5) * spread[1])) * H_;
      const r = size * (0.4 + rnd());
      const cl = fats[(rnd() * fats.length) | 0];
      blob(c, x, y, r, cl, 0.55 + rnd() * 0.35);
      blob(b, x, y, r, 'rgba(235,235,235,A)', 0.35);
    }
  };
  for (let i = 0; i < 900; i++) { // sulco AV (volta inteira)
    const u = rnd();
    fatAt(u, (0.84 + 1) / 2 + (rnd() - 0.3) * 0.07, [0.004, 0.02], 1, 14 + rnd() * 18);
  }
  for (let t = 0.85; t > -0.75; t -= 0.012) { // sulco anterior
    const u = (antGroovePhi(t) + Math.PI) / (2 * Math.PI);
    const w = 0.012 + 0.03 * ss(-0.6, 0.8, t);
    fatAt(u, (t + 1) / 2, [w, 0.01], 4, 10 + 14 * ss(-0.6, 0.8, t));
  }
  for (let t = 0.85; t > -0.6; t -= 0.012) { // sulco posterior
    let ph = postGroovePhi(t); if (ph < -Math.PI) ph += Math.PI * 2;
    const u = (ph + Math.PI) / (2 * Math.PI);
    fatAt(u, (t + 1) / 2, [0.02, 0.01], 3, 10 + 12 * ss(-0.6, 0.8, t));
  }
  for (let i = 0; i < 70; i++) fatAt(rnd(), 0.55 + rnd() * 0.35, [0.03, 0.05], 3, 8 + rnd() * 10);
  const map = new THREE.CanvasTexture(col); map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4;
  const bmp = new THREE.CanvasTexture(bump);
  return { map, bump: bmp };
}

function makeTissueTexture(base, spots, w = 512, h = 256, fibers = true) {
  const col = canvas(w, h), c = col.getContext('2d');
  c.fillStyle = base; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) blob(c, rnd() * w, rnd() * h, 4 + rnd() * 24, spots[(rnd() * spots.length) | 0], 0.2);
  if (fibers) for (let i = 0; i < 300; i++) {
    const x = rnd() * w, y = rnd() * h;
    c.strokeStyle = `rgba(0,0,0,${0.04 + rnd() * 0.05})`;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + 20 + rnd() * 40, y + (rnd() - 0.5) * 10); c.stroke();
  }
  const t = new THREE.CanvasTexture(col); t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// ---------- construção do coração ----------
export function buildHeart({ quality = 1 } = {}) {
  seed = 7;
  const root = new THREE.Group();
  root.name = 'heartLocal';
  const Q = (n) => Math.max(8, Math.round(n * quality));

  const texRes = quality >= 1 ? [2048, 1024] : [1024, 512];
  const myo = makeMyocardiumTextures(texRes[0], texRes[1]);

  const wet = { clearcoat: 1, clearcoatRoughness: 0.28, sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color('#c83a30') };

  // ----- ventrículos -----
  const ventMat = patchMaterial(new THREE.MeshPhysicalMaterial({
    map: myo.map, bumpMap: myo.bump, bumpScale: 1.6, roughness: 0.52, ...wet,
  }), { zone: true, elec: true });
  const ventGeo = paramGeometry((u, v) => ventShape(-Math.PI + u * Math.PI * 2, -1 + v * 2),
    Q(200), Q(150), new THREE.Vector3(0, -0.2, 0));
  const vent = new THREE.Mesh(ventGeo, ventMat);
  vent.name = 'ventriculos';
  root.add(vent);

  // ----- átrios e aurículas -----
  const atrTex = makeTissueTexture('#6a1a26', ['rgba(95,22,40,A)', 'rgba(120,40,50,A)', 'rgba(70,15,30,A)', 'rgba(210,170,90,A)']);
  const atrMat = patchMaterial(new THREE.MeshPhysicalMaterial({ map: atrTex, roughness: 0.5, bumpMap: atrTex, bumpScale: 0.6, ...wet }), { elec: true });
  const blobShape = (c, r, amp, freq, lobes = 0, lobeAmp = 0, flat = null) => (u, v) => {
    const th = u * Math.PI * 2, ph = v * Math.PI;
    const d = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    let k = 1 + amp * (fbm(d.x * freq + c.x * 3, d.y * freq + 9, d.z * freq) - 0.5);
    if (lobes) k *= 1 + lobeAmp * Math.sin(th * lobes + Math.sin(ph * 3) * 2) * Math.sin(ph);
    const p = new THREE.Vector3(d.x * r.x * k, d.y * r.y * k, d.z * r.z * k);
    if (flat) p.applyQuaternion(flat);
    return p.add(c);
  };
  const atria = [
    { name: 'atrioDireito', c: new THREE.Vector3(-0.62, 1.05, 0.12), r: new THREE.Vector3(0.52, 0.42, 0.5), amp: 0.18 },
    { name: 'atrioEsquerdo', c: new THREE.Vector3(0.25, 1.02, -0.5), r: new THREE.Vector3(0.62, 0.4, 0.45), amp: 0.14 },
  ];
  for (const a of atria) {
    const g = paramGeometry(blobShape(a.c, a.r, a.amp, 2.2), Q(72), Q(48), a.c);
    const m = new THREE.Mesh(g, atrMat); m.name = a.name; root.add(m);
  }
  // aurículas (as "orelhinhas" enrugadas dos átrios)
  const auricles = [
    { c: new THREE.Vector3(-0.3, 1.1, 0.58), r: new THREE.Vector3(0.32, 0.17, 0.22), rot: new THREE.Euler(0.2, -0.6, 0.5) },
    { c: new THREE.Vector3(0.66, 1.06, 0.3), r: new THREE.Vector3(0.3, 0.14, 0.18), rot: new THREE.Euler(-0.2, 0.9, -0.4) },
  ];
  for (const a of auricles) {
    const q = new THREE.Quaternion().setFromEuler(a.rot);
    const g = paramGeometry(blobShape(a.c, a.r, 0.3, 5, 9, 0.12, q), Q(64), Q(40), a.c);
    root.add(new THREE.Mesh(g, atrMat));
  }

  // ----- grandes vasos -----
  const artTex = makeTissueTexture('#b0453c', ['rgba(200,110,95,A)', 'rgba(150,50,45,A)', 'rgba(230,200,170,A)'], 256, 128, false);
  const pulTex = makeTissueTexture('#3f5595', ['rgba(80,100,160,A)', 'rgba(50,60,120,A)', 'rgba(150,160,200,A)'], 256, 128, false);
  const venTex = makeTissueTexture('#4a3f8a', ['rgba(80,70,140,A)', 'rgba(40,30,90,A)', 'rgba(130,120,190,A)'], 256, 128, false);
  const vesselMat = (tex, pulse) => patchMaterial(new THREE.MeshPhysicalMaterial({ map: tex, bumpMap: tex, bumpScale: 0.4, roughness: 0.42, clearcoat: 1, clearcoatRoughness: 0.2, sheen: 0.3, sheenColor: new THREE.Color('#ffbbaa') }), { pulse });
  const aortaMat = vesselMat(artTex, 1);
  const pulmMat = vesselMat(pulTex, 1);
  const venaMat = vesselMat(venTex, 0);
  const pvMat = vesselMat(artTex, 0);
  const lumenMat = new THREE.MeshStandardMaterial({ color: '#1a0508', roughness: 0.9 });
  const wallMats = {
    a: new THREE.MeshStandardMaterial({ color: '#d9a39a', roughness: 0.6 }),
    p: new THREE.MeshStandardMaterial({ color: '#a7b0d6', roughness: 0.6 }),
    v: new THREE.MeshStandardMaterial({ color: '#9f98c9', roughness: 0.6 }),
  };
  // As tampas (cortes) ficam longe da área que se deforma
  const vessels = [];
  const addVessel = (name, pts, r0, r1, mat, wall, cap = true) => {
    const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
    const g = tubeGeometry(curve, (u) => r0 + (r1 - r0) * u, Q(90), Q(36));
    const m = new THREE.Mesh(g, mat); m.name = name; root.add(m);
    if (cap) for (const c of vesselCap(curve, r1, wall, lumenMat)) root.add(c);
    vessels.push({ name, curve });
    return curve;
  };

  const aorta = addVessel('aorta', [
    W(-0.08, 0.6, 0.12), W(-0.2, 1.3, 0.25), W(-0.2, 1.95, 0.22), W(-0.02, 2.45, 0.02),
    W(0.3, 2.45, -0.35), W(0.5, 2.05, -0.8), W(0.55, 1.4, -1.05), W(0.55, 0.9, -1.15),
  ], 0.3, 0.26, aortaMat, wallMats.a);
  addVessel('troncoBraquiocefalico', [W(-0.12, 2.35, 0.05), W(-0.25, 2.75, 0.12), W(-0.38, 3.1, 0.15)], 0.105, 0.09, aortaMat, wallMats.a);
  addVessel('carotidaEsquerda', [W(0.1, 2.42, -0.1), W(0.13, 2.8, -0.08), W(0.16, 3.12, -0.05)], 0.075, 0.065, aortaMat, wallMats.a);
  addVessel('subclaviaEsquerda', [W(0.3, 2.38, -0.35), W(0.42, 2.75, -0.38), W(0.55, 3.05, -0.4)], 0.085, 0.075, aortaMat, wallMats.a);

  const pt = addVessel('troncoPulmonar', [
    W(0.1, 0.55, 0.58), W(0.22, 1.2, 0.65), W(0.3, 1.7, 0.4), W(0.3, 1.95, 0.02),
  ], 0.27, 0.24, pulmMat, wallMats.p, false);
  addVessel('pulmonarEsquerda', [W(0.3, 1.95, 0.02), W(0.75, 2.0, -0.2), W(1.3, 1.92, -0.3)], 0.2, 0.17, pulmMat, wallMats.p);
  addVessel('pulmonarDireita', [W(0.3, 1.95, 0.02), W(-0.1, 1.88, -0.32), W(-0.6, 1.82, -0.42), W(-1.3, 1.8, -0.45)], 0.19, 0.16, pulmMat, wallMats.p);

  addVessel('veiaCavaSuperior', [W(-0.82, 1.2, 0.05), W(-0.86, 1.8, 0.02), W(-0.86, 2.55, 0.0)], 0.22, 0.2, venaMat, wallMats.v);
  addVessel('veiaCavaInferior', [new THREE.Vector3(-0.7, 0.85, -0.2), new THREE.Vector3(-0.85, 0.5, -0.55), new THREE.Vector3(-0.95, 0.25, -0.85)], 0.23, 0.22, venaMat, wallMats.v);

  const pvs = [
    [new THREE.Vector3(0.65, 1.15, -0.55), new THREE.Vector3(1.0, 1.25, -0.6), new THREE.Vector3(1.35, 1.32, -0.6)],
    [new THREE.Vector3(0.65, 0.9, -0.62), new THREE.Vector3(1.0, 0.85, -0.68), new THREE.Vector3(1.32, 0.8, -0.7)],
    [new THREE.Vector3(-0.1, 1.15, -0.8), new THREE.Vector3(-0.45, 1.25, -0.95), new THREE.Vector3(-0.85, 1.3, -1.0)],
    [new THREE.Vector3(-0.1, 0.9, -0.82), new THREE.Vector3(-0.45, 0.85, -0.98), new THREE.Vector3(-0.8, 0.82, -1.05)],
  ];
  pvs.forEach((p, i) => addVessel('veiaPulmonar' + i, p, 0.1, 0.09, pvMat, wallMats.a));

  // ----- artérias e veias coronárias (sobre a superfície) -----
  const coronaryCurves = [];
  const corMat = patchMaterial(new THREE.MeshPhysicalMaterial({ color: '#c0342c', roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15 }), {});
  const corDistalMat = patchMaterial(new THREE.MeshPhysicalMaterial({ color: '#c0342c', roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15 }), {});
  const veinMat = patchMaterial(new THREE.MeshPhysicalMaterial({ color: '#5b3f86', roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.2 }), {});

  const surfCurve = (pairs, lift) => new THREE.CatmullRomCurve3(pairs.map(([ph, t]) => surfacePoint(ph, t, lift)), false, 'centripetal');
  const addCor = (name, curve, r0, r1, mat, opts = {}) => {
    const g = tubeGeometry(curve, (u) => r0 + (r1 - r0) * Math.pow(u, 0.8), Q(120), 10);
    const m = new THREE.Mesh(g, mat); m.name = name; root.add(m);
    coronaryCurves.push({ name, curve, r0, r1, ...opts });
    return curve;
  };
  const range = (a, b, n, f) => Array.from({ length: n }, (_, i) => f(a + (b - a) * (i / (n - 1))));

  // Tronco da coronária esquerda: sai da aorta e passa atrás do tronco pulmonar
  const lmStart = W(0.05, 0.95, 0.35);
  const lmEnd = surfacePoint(0.42, 0.83, 0.02);
  const lm = new THREE.CatmullRomCurve3([lmStart, lmStart.clone().lerp(lmEnd, 0.5).add(new THREE.Vector3(0, 0.02, 0.05)), lmEnd]);
  addCor('troncoCoronarioEsquerdo', lm, 0.045, 0.04, corMat);

  // Artéria descendente anterior (DA) — onde o coágulo vai se formar
  const ladPts = range(0.83, -0.97, 26, (t) => [antGroovePhi(t) + 0.02, t]);
  ladPts.push([1.0, -1.0 + 0.001]);
  const CLOT_T = 0.5;
  const kSplit = ladPts.findIndex(([, t]) => t < CLOT_T);
  const ladProx = surfCurve(ladPts.slice(0, kSplit + 1), 0.022);
  const ladDist = surfCurve(ladPts.slice(kSplit), 0.02);
  addCor('DA_proximal', ladProx, 0.04, 0.035, corMat, { flow: 'prox' });
  addCor('DA_distal', ladDist, 0.035, 0.012, corDistalMat, { flow: 'dist' });
  const clotPos = surfacePoint(antGroovePhi(CLOT_T) + 0.02, CLOT_T, 0.024);

  // Ramos diagonais (depois do coágulo)
  addCor('diagonal1', surfCurve(range(0, 1, 8, (s) => [antGroovePhi(0.35 - s * 0.05) + 0.04 + s * 0.85, 0.35 - s * 0.55]), 0.016), 0.022, 0.009, corDistalMat, { flow: 'dist' });
  addCor('diagonal2', surfCurve(range(0, 1, 8, (s) => [antGroovePhi(-0.1) + 0.04 + s * 0.7, -0.1 - s * 0.5]), 0.014), 0.018, 0.008, corDistalMat, { flow: 'dist' });

  // Circunflexa pelo sulco AV, e marginal
  addCor('circunflexa', surfCurve(range(0.42, 2.6, 16, (ph) => [ph, 0.82]), 0.022), 0.035, 0.018, corMat);
  addCor('marginalEsquerda', surfCurve(range(0, 1, 8, (s) => [1.55 + s * 0.35, 0.8 - s * 1.2]), 0.016), 0.022, 0.009, corMat);

  // Coronária direita + marginal aguda + descendente posterior
  const rcaStart = W(-0.35, 0.95, 0.4);
  const rcaPts = range(-0.2, -2.75, 16, (ph) => [ph, 0.82]);
  const rca = new THREE.CatmullRomCurve3([rcaStart, ...rcaPts.map(([ph, t]) => surfacePoint(ph, t, 0.024))], false, 'centripetal');
  addCor('coronariaDireita', rca, 0.04, 0.03, corMat);
  addCor('marginalAguda', surfCurve(range(0, 1, 8, (s) => [-1.2 + s * 0.2, 0.8 - s * 1.2]), 0.016), 0.02, 0.009, corMat);
  addCor('descendentePosterior', surfCurve(range(0.8, -0.6, 12, (t) => [postGroovePhi(t) + 0.03, t]), 0.018), 0.026, 0.01, corMat);

  // Veias cardíacas (roxas), paralelas às artérias
  const gcv = [...range(-0.75, 0.8, 14, (t) => [antGroovePhi(t) - 0.07, t]), ...range(0.5, 2.9, 10, (ph) => [ph, 0.87])];
  addCor('veiaCardiacaMagna', surfCurve(gcv, 0.018), 0.012, 0.03, veinMat, { vein: true });
  addCor('veiaCardiacaMedia', surfCurve(range(-0.5, 0.85, 10, (t) => [postGroovePhi(t) - 0.08, t]), 0.016), 0.012, 0.022, veinMat, { vein: true });

  // ----- placa de gordura e coágulo (trombo) na DA -----
  const plaqueMat = patchMaterial(new THREE.MeshPhysicalMaterial({ color: '#e7c66a', roughness: 0.5, clearcoat: 0.6 }), { grow: { center: clotPos.clone() } });
  const clotMat = patchMaterial(new THREE.MeshPhysicalMaterial({ color: '#3a0508', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 }), { grow: { center: clotPos.clone() } });
  const lumpGeo = (r, freq, amp, stretch) => {
    const tan = ladProx.getTangentAt(1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), tan);
    return paramGeometry((u, v) => {
      const th = u * Math.PI * 2, ph = v * Math.PI;
      const d = new THREE.Vector3(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
      const k = r * (1 + amp * (fbm(d.x * freq + 3, d.y * freq, d.z * freq) - 0.5));
      return new THREE.Vector3(d.x * k, d.y * k * stretch, d.z * k).applyQuaternion(q).add(clotPos);
    }, 40, 28, clotPos);
  };
  const plaque = new THREE.Mesh(lumpGeo(0.055, 4, 0.6, 2.0), plaqueMat);
  const clot = new THREE.Mesh(lumpGeo(0.07, 5, 0.9, 1.6), clotMat);
  plaque.name = 'placa'; clot.name = 'coagulo';
  root.add(plaque, clot);

  // Stent: malha metálica ao redor do trecho da DA
  const stentMat = patchMaterial(new THREE.MeshStandardMaterial({ color: '#d7dde4', metalness: 1, roughness: 0.25 }), {});
  const stent = new THREE.Group();
  {
    const uA = 0.62, uB = 1.0;
    const tube = ladProx;
    const pts = [];
    const segs = 60;
    const frames = tube.computeFrenetFrames(segs, false);
    for (let s = 0; s < 2; s++) {
      for (let i = 0; i <= segs; i++) {
        const u = uA + (uB - uA) * (i / segs);
        const fi = Math.round(u * segs);
        const P = tube.getPointAt(u);
        const a = (i / segs) * Math.PI * 10 + s * Math.PI;
        const n = frames.normals[fi].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames.binormals[fi], Math.sin(a));
        pts.push(P.addScaledVector(n, 0.05));
      }
      const c = new THREE.CatmullRomCurve3(pts.splice(0));
      stent.add(new THREE.Mesh(new THREE.TubeGeometry(c, 200, 0.006, 5), stentMat));
    }
    const dc = ladDist;
    const frames2 = dc.computeFrenetFrames(20, false);
    for (let s = 0; s < 2; s++) {
      const p2 = [];
      for (let i = 0; i <= 20; i++) {
        const u = 0.12 * (i / 20);
        const P = dc.getPointAt(u);
        const a = (i / 20) * Math.PI * 3 + s * Math.PI;
        const n = frames2.normals[i].clone().multiplyScalar(Math.cos(a)).addScaledVector(frames2.binormals[i], Math.sin(a));
        p2.push(P.addScaledVector(n, 0.045));
      }
      stent.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(p2), 80, 0.006, 5), stentMat));
    }
  }
  stent.visible = false;
  root.add(stent);

  // ----- pontos para rótulos -----
  const labels = [
    { id: 've', text: 'Ventrículo esquerdo', pos: surfacePoint(1.5, -0.3, 0.02), n: [1, 0, 0.3] },
    { id: 'vd', text: 'Ventrículo direito', pos: surfacePoint(-0.4, 0.1, 0.02), n: [-0.2, 0, 1] },
    { id: 'ad', text: 'Átrio direito', pos: new THREE.Vector3(-1.08, 1.05, 0.25), n: [-1, 0, 0.3] },
    { id: 'ae', text: 'Átrio esquerdo', pos: new THREE.Vector3(0.72, 1.0, -0.62), n: [0.6, 0, -0.8] },
    { id: 'ao', text: 'Aorta', pos: W(-0.02, 2.62, 0.02), n: [0, 0.3, 1] },
    { id: 'tp', text: 'Tronco pulmonar', pos: W(0.4, 1.35, 0.8), n: [0.3, 0, 1] },
    { id: 'vcs', text: 'Veia cava superior', pos: W(-0.9, 2.2, 0.2), n: [-0.5, 0, 1] },
    { id: 'vp', text: 'Veias pulmonares', pos: new THREE.Vector3(1.3, 1.1, -0.62), n: [1, 0, -0.3] },
    { id: 'da', text: 'Artéria coronária DA', pos: surfacePoint(antGroovePhi(-0.3), -0.3, 0.05), n: [0.3, 0, 1] },
    { id: 'cd', text: 'Coronária direita', pos: surfacePoint(-0.9, 0.82, 0.05), n: [-0.6, 0, 1] },
    { id: 'apice', text: 'Ápice', pos: new THREE.Vector3(0, -1.66, 0.05), n: [0, -0.5, 1] },
  ];

  return {
    root, vent, ventMat, corDistalMat, plaque, clot, plaqueMat, clotMat, stent,
    coronaryCurves, vessels, aorta, pt, clotPos, labels,
  };
}
