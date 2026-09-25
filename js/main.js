import * as THREE from '../vendor/three/three.module.js';
import { OrbitControls } from '../vendor/three/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from '../vendor/three/CSS2DRenderer.js';
import { RoomEnvironment } from '../vendor/three/RoomEnvironment.js';
import { buildHeart, surfacePoint, TILT } from './heart.js';
import { heartUniforms, commonGLSL } from './shaders.js';
import { ecgSinus, ecgVF, pleth, SweepTrace } from './ecg.js';
import { ArteryView } from './artery.js';
import { HeartAudio } from './audio.js';
import { BASE, STAGES, AFTER_SHOCK, stentStage, FACTS } from './stages.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const stageEl = $('stage');

// ---------------------------------------------------------------- renderizador
const isTouch = matchMedia('(pointer: coarse)').matches;
let pixelRatio = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.85;
renderer.outputColorSpace = THREE.SRGBColorSpace;
stageEl.prepend(renderer.domElement);

const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.inset = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
stageEl.appendChild(labelRenderer.domElement);

const scene = new THREE.Scene();
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.35;

const camera = new THREE.PerspectiveCamera(33, 1, 0.1, 100);

// iluminação de "estúdio": luz principal quente, contraluz avermelhada e preenchimento
const key = new THREE.DirectionalLight('#fff1e6', 2.6); key.position.set(3, 5, 6); scene.add(key);
const rim = new THREE.DirectionalLight('#ff7a6a', 3.0); rim.position.set(-5, 2, -5); scene.add(rim);
const rim2 = new THREE.DirectionalLight('#9ab8ff', 1.0); rim2.position.set(5, -2, -4); scene.add(rim2);
scene.add(new THREE.HemisphereLight('#ffe6e0', '#1a0610', 0.6));

// ---------------------------------------------------------------- coração
const heart = buildHeart({ quality: 1 });
const tiltGroup = new THREE.Group();
const pivot = new THREE.Vector3(0, 0.9, 0);
heart.root.position.copy(pivot).negate();
tiltGroup.position.copy(pivot);
tiltGroup.rotation.z = TILT;
tiltGroup.add(heart.root);
const heartGroup = new THREE.Group();
heartGroup.add(tiltGroup);
heartGroup.rotation.y = -0.3;
scene.add(heartGroup);

// centraliza o coração na cena
heartGroup.updateMatrixWorld(true);
const box = new THREE.Box3().setFromObject(heartGroup);
const center = box.getCenter(new THREE.Vector3());
heartGroup.position.sub(center);
heartGroup.updateMatrixWorld(true);
const size = box.getSize(new THREE.Vector3());

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.minDistance = 2.2;
controls.maxDistance = 16;
controls.rotateSpeed = 0.8;
controls.autoRotateSpeed = 1.2;

const toWorld = (v) => heart.root.localToWorld(v.clone());
const HOME = { pos: new THREE.Vector3(0.6, 0.35, 1).normalize().multiplyScalar(size.y * 1.75), target: new THREE.Vector3(0, -0.05, 0) };
camera.position.copy(HOME.pos);
controls.target.copy(HOME.target);

// posições de câmera para cada etapa
function camPreset(name) {
  if (name === 'lad' || name === 'zone') {
    const localP = name === 'lad' ? heart.clotPos : surfacePoint(0.8, -0.35, 0);
    const t = toWorld(localP);
    const axis = toWorld(new THREE.Vector3(0, localP.y, 0));
    const dir = t.clone().sub(axis).normalize().add(new THREE.Vector3(0, 0.25, 0.35)).normalize();
    return { target: t.clone().lerp(HOME.target, name === 'lad' ? 0.25 : 0.5), pos: t.clone().addScaledVector(dir, name === 'lad' ? 3.2 : 5.2) };
  }
  return { pos: HOME.pos.clone(), target: HOME.target.clone() };
}
let camAnim = null;
function flyTo(name) {
  const p = camPreset(name);
  camAnim = { t: 0, fromPos: camera.position.clone(), fromTarget: controls.target.clone(), toPos: p.pos, toTarget: p.target };
}
controls.addEventListener('start', () => { camAnim = null; hideHint(); });

// ---------------------------------------------------------------- rótulos
const labelObjs = [];
for (const l of heart.labels) {
  const div = document.createElement('div');
  div.className = 'label';
  div.innerHTML = `<span>${l.text}</span>`;
  const obj = new CSS2DObject(div);
  obj.position.copy(l.pos);
  obj.center.set(0, 0.5);
  heart.root.add(obj);
  labelObjs.push({ obj, div, n: new THREE.Vector3(...l.n).normalize(), id: l.id });
}
// rótulo extra do coágulo
{
  const div = document.createElement('div');
  div.className = 'label danger';
  div.innerHTML = '<span>Coágulo (trombo)</span>';
  const obj = new CSS2DObject(div);
  obj.position.copy(heart.clotPos);
  obj.center.set(0, 0.5);
  heart.root.add(obj);
  labelObjs.push({ obj, div, n: new THREE.Vector3(0.3, 0, 1).normalize(), id: 'clot' });
}

// ---------------------------------------------------------------- sangue nas coronárias
const PARTICLES_PER_UNIT = 55;
const flowCurves = heart.coronaryCurves.map((c) => {
  // amostras levantadas para fora da superfície, para as partículas ficarem visíveis
  const N = 160, pts = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const p = c.curve.getPointAt(u);
    const out = new THREE.Vector3(p.x, p.y > 0.7 ? (p.y - 0.7) * 0.8 : 0, p.z).normalize();
    const r = c.r0 + (c.r1 - c.r0) * u;
    pts.push(p.addScaledVector(out, r * 0.9 + 0.006));
  }
  return { ...c, pts, len: c.curve.getLength() };
});
const particles = [];
flowCurves.forEach((c, ci) => {
  const n = Math.max(4, Math.round(c.len * PARTICLES_PER_UNIT));
  for (let i = 0; i < n; i++) particles.push({ ci, u: Math.random(), pack: Math.random() * 0.25, alpha: 1 });
});
const pGeo = new THREE.BufferGeometry();
const pPos = new Float32Array(particles.length * 3);
const pCol = new Float32Array(particles.length * 3);
const pSize = new Float32Array(particles.length);
particles.forEach((p, i) => {
  const vein = flowCurves[p.ci].vein;
  const col = vein ? new THREE.Color('#7f8bff') : new THREE.Color('#ff3b3b');
  pCol.set([col.r, col.g, col.b], i * 3);
  pSize[i] = (vein ? 0.8 : 1) * (0.8 + Math.random() * 0.4);
});
pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
pGeo.setAttribute('aColor', new THREE.BufferAttribute(pCol, 3));
pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
const pMat = new THREE.ShaderMaterial({
  uniforms: { ...heartUniforms, uScale: { value: 1 } },
  vertexShader: `${commonGLSL}
    uniform float uScale;
    attribute vec3 aColor; attribute float aSize;
    varying vec3 vColor; varying float vA;
    void main() {
      vec3 q = deformHeart(position);
      vec4 mv = modelViewMatrix * vec4(q, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize * uScale / -mv.z;
      vColor = aColor; vA = step(0.01, aSize);
    }`,
  fragmentShader: `
    varying vec3 vColor; varying float vA;
    void main() {
      vec2 d = gl_PointCoord - 0.5;
      float r = length(d);
      if (r > 0.5) discard;
      float a = smoothstep(0.5, 0.1, r) * vA;
      gl_FragColor = vec4(vColor * (1.2 - r), a);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
});
const pointCloud = new THREE.Points(pGeo, pMat);
pointCloud.frustumCulled = false;
heart.root.add(pointCloud);

function sampleFlow(c, u, out) {
  const f = Math.min(0.99999, Math.max(0, u)) * (c.pts.length - 1);
  const i = Math.floor(f), t = f - i;
  return out.copy(c.pts[i]).lerp(c.pts[i + 1], t);
}

// ---------------------------------------------------------------- estado
const S = { ...BASE };     // valores atuais (suavizados)
let TGT = { ...BASE };     // valores alvo
const RATE = { hr: 0.7, sys: 0.8, dia: 0.8, spo2: 0.5, plaque: 0.6, clot: 0.7, stent: 1.2, flow: 1.8, isch: 0.45, necro: 0.35, st: 0.6, qwave: 0.5, fib: 4, contract: 0.8 };

const ui = {
  mode: 'normal', stageIdx: 0, stage: STAGES[0], slow: false, auto: false, autoT: 0,
  showElec: true, showFlow: true, showLabels: true,
};
let beatT = 0;             // tempo dentro do ciclo (s)
let cycle = 60 / 72;       // duração do ciclo atual
let fired = {};
let shock = null;          // animação do desfibrilador
let clock = 0;             // tempo simulado total
let alarmT = 0;

// ---------------------------------------------------------------- monitor
const ecgTrace = new SweepTrace($('ecg'), { color: '#39ff7a', min: -0.8, max: 1.7, seconds: 4 });
const plTrace = new SweepTrace($('pleth'), { color: '#44d7ff', min: -0.15, max: 1.25, seconds: 4 });
const artery = new ArteryView($('artery'));
const audio = new HeartAudio();

// ---------------------------------------------------------------- modos e etapas
function setMode(mode) {
  ui.mode = mode;
  app.dataset.mode = mode;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.mode === mode));
  ui.auto = false; $('btnAuto').classList.remove('on');
  audio.flatline(false); audio.hush();
  if (mode === 'normal') {
    shock = null;
    applyStage({ id: 'normal', set: { hr: +$('hrRange').value, plaque: 0.15 } }, false);
    flyTo('front');
  } else {
    goStage(0);
  }
}

function applyStage(stage, render = true) {
  ui.stage = stage;
  TGT = { ...BASE, ...stage.set };
  if (ui.mode === 'normal') TGT.plaque = 0.15;
  if (render && stage.title) {
    $('stageTitle').textContent = stage.title;
    $('stageBody').innerHTML = stage.body;
    $('stageBody').style.animation = 'none'; void $('stageBody').offsetWidth; $('stageBody').style.animation = '';
    const tag = $('stageTag');
    tag.textContent = stage.tag; tag.className = 'tag ' + (stage.tagClass || '');
  }
  if (stage.set.cam) flyTo(stage.set.cam);
  if (render) stageSfx(stage.id);
  updateButtons();
}

// efeito sonoro de cada etapa
function stageSfx(id) {
  alarmT = 1.5;
  switch (id) {
    case 'saudavel': audio.whoosh(false); break;
    case 'placa': audio.plaque(); break;
    case 'trombo': audio.clot(); break;
    case 'isquemia': audio.tension(3.5); break;
    case 'infarto': audio.tension(4.5); break;
    case 'fv': audio.tension(2.5); alarmT = 0.3; break;
    case 'stent': audio.stent(); break;
  }
}

function goStage(i) {
  i = Math.max(0, Math.min(STAGES.length - 1, i));
  ui.stageIdx = i; ui.autoT = 0;
  // voltando para antes do infarto, "desfaz" o dano rapidamente
  applyStage(STAGES[i]);
  if (i < 4) { S.necro = Math.min(S.necro, TGT.necro); S.qwave = Math.min(S.qwave, TGT.qwave); }
  if (i < 3) { S.isch = Math.min(S.isch, TGT.isch); S.st = Math.min(S.st, TGT.st); }
  if (i < 2) { S.clot = 0; S.flow = 1; }
  if (i < 5 && S.fib > 0) { S.fib = 0; }
  S.stent = 0;
  $('stageNum').textContent = `${i + 1}/${STAGES.length}`;
}

function updateButtons() {
  const id = ui.stage.id;
  const idx = ui.stageIdx;
  $('btnPrev').disabled = idx === 0 && STAGES[0] === ui.stage;
  $('btnNext').disabled = !(STAGES.includes(ui.stage) && idx < STAGES.length - 1);
  $('btnDefib').disabled = id !== 'fv' || !!shock;
  $('btnStent').disabled = !['trombo', 'isquemia', 'infarto', 'choque'].includes(id);
  const dots = $('dots');
  dots.innerHTML = '';
  STAGES.forEach((s, i) => {
    const d = document.createElement('span');
    const cur = STAGES.includes(ui.stage) ? idx : STAGES.length;
    d.className = 'dot' + (i === cur ? ' cur' : i < cur ? ' done' : '');
    dots.appendChild(d);
  });
}

function defibrillate() {
  if (ui.stage.id !== 'fv' || shock) return;
  shock = { t: 0, phase: 'analyze' };
  updateButtons();
  showShockMsg('🔍 Analisando o ritmo…');
  audio.say('Analisando o ritmo cardíaco. Não toque no paciente.');
}

function doStent() {
  if (!['trombo', 'isquemia', 'infarto', 'choque'].includes(ui.stage.id)) return;
  const st = stentStage(TGT.necro);
  $('stageNum').textContent = '✓';
  applyStage(st);
  // o coágulo é removido e a artéria volta a ter fluxo
}

function showShockMsg(text, ms = 0) {
  const el = $('shockMsg');
  el.textContent = text; el.classList.add('show');
  clearTimeout(showShockMsg.t);
  if (ms) showShockMsg.t = setTimeout(() => el.classList.remove('show'), ms);
}

// ---------------------------------------------------------------- UI
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));
$('hrRange').addEventListener('input', (e) => {
  const v = +e.target.value;
  $('hrSetVal').textContent = v;
  TGT.hr = v;
  document.querySelectorAll('.presets .btn').forEach((b) => b.classList.toggle('active', +b.dataset.hr === v));
});
document.querySelectorAll('.presets .btn').forEach((b) => b.addEventListener('click', () => {
  $('hrRange').value = b.dataset.hr;
  $('hrRange').dispatchEvent(new Event('input'));
}));
$('btnSlow').addEventListener('click', (e) => { ui.slow = !ui.slow; e.currentTarget.classList.toggle('on', ui.slow); });
$('btnNext').addEventListener('click', () => { ui.auto = false; $('btnAuto').classList.remove('on'); goStage(ui.stageIdx + 1); });
$('btnPrev').addEventListener('click', () => {
  ui.auto = false; $('btnAuto').classList.remove('on');
  if (!STAGES.includes(ui.stage)) goStage(ui.stageIdx); else goStage(ui.stageIdx - 1);
});
$('btnRestart').addEventListener('click', () => { shock = null; audio.flatline(false); audio.hush(); goStage(0); });
$('btnDefib').addEventListener('click', defibrillate);
$('btnStent').addEventListener('click', doStent);
$('btnAuto').addEventListener('click', (e) => {
  ui.auto = !ui.auto; ui.autoT = 0;
  e.currentTarget.classList.toggle('on', ui.auto);
});

const toggle = (id, key, fn) => $(id).addEventListener('click', (e) => {
  ui[key] = !ui[key]; e.currentTarget.classList.toggle('on', ui[key]); fn && fn(ui[key]);
});
toggle('btnElec', 'showElec');
toggle('btnFlow', 'showFlow', (v) => { pointCloud.visible = v; audio.flowOn = v; });
toggle('btnLabels', 'showLabels', (v) => stageEl.classList.toggle('labels-off', !v));
$('btnRotate').addEventListener('click', (e) => { controls.autoRotate = !controls.autoRotate; e.currentTarget.classList.toggle('on', controls.autoRotate); });
$('btnReset').addEventListener('click', () => flyTo('front'));
let soundWanted = true;
function soundUI() {
  const b = $('btnSound');
  b.classList.toggle('on', audio.enabled);
  b.firstChild.textContent = audio.enabled ? '🔊' : '🔇';
}
$('btnSound').addEventListener('click', async () => {
  soundWanted = !audio.enabled;
  if (audio.enabled) audio.disable(); else await audio.enable();
  soundUI();
});
// o iPad só libera o som depois de um toque: o primeiro toque em qualquer lugar ativa
const UNLOCK_EVENTS = ['pointerdown', 'touchend', 'click', 'keydown'];
const unlock = async (e) => {
  if (e.target.closest && e.target.closest('#btnSound')) return;
  if (!soundWanted || audio.enabled) return;
  try { await audio.enable(); } catch (err) { /* tenta de novo no próximo toque */ }
  if (audio.ctx && audio.ctx.state === 'running') {
    UNLOCK_EVENTS.forEach((ev) => window.removeEventListener(ev, unlock, true));
    $('hint').textContent = 'Arraste para girar • Pinça para zoom';
  } else {
    audio.enabled = false;
  }
  soundUI();
};
UNLOCK_EVENTS.forEach((ev) => window.addEventListener(ev, unlock, true));
// clique suave nos botões
document.addEventListener('click', (e) => {
  if (e.target.closest && e.target.closest('.btn, .tab, .tool') && !e.target.closest('#btnSound')) audio.click();
});
const fsEl = document.documentElement;
const canFS = fsEl.requestFullscreen || fsEl.webkitRequestFullscreen;
if (!canFS) $('btnFull').style.display = 'none';
$('btnFull').addEventListener('click', () => {
  const inFS = document.fullscreenElement || document.webkitFullscreenElement;
  if (inFS) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else canFS.call(fsEl);
});

function hideHint() { $('hint').style.opacity = 0; }
setTimeout(hideHint, 7000);

// curiosidades
let factI = 0;
function nextFact() {
  const el = $('fact');
  el.style.opacity = 0;
  setTimeout(() => { el.textContent = FACTS[factI++ % FACTS.length]; el.style.opacity = 1; }, 400);
}
nextFact();
setInterval(nextFact, 10000);

// ---------------------------------------------------------------- redimensionar
function resize() {
  const r = stageEl.getBoundingClientRect();
  const w = Math.max(1, r.width), h = Math.max(1, r.height);
  renderer.setSize(w, h, false);
  renderer.domElement.style.width = w + 'px';
  renderer.domElement.style.height = h + 'px';
  labelRenderer.setSize(w, h);
  camera.aspect = w / h;
  // em telas estreitas afasta a câmera para caber o coração
  camera.fov = camera.aspect < 0.9 ? 42 : 33;
  camera.updateProjectionMatrix();
  pMat.uniforms.uScale.value = h * renderer.getPixelRatio() * 0.028;
  ecgTrace.resize(); plTrace.resize(); artery.resize();
}
new ResizeObserver(resize).observe(stageEl);
new ResizeObserver(() => { ecgTrace.resize(); plTrace.resize(); artery.resize(); }).observe(document.querySelector('.monitor'));
resize();

// ---------------------------------------------------------------- ciclo cardíaco
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gs = (x, mu, s) => Math.exp(-((x - mu) ** 2) / (2 * s * s));

function sysEnd() { return 0.2 + 0.3 * Math.sqrt(cycle / 0.833); }

function contraction(s) {
  const k = Math.sqrt(cycle / 0.833);
  const atria = gs(s, 0.1, 0.035);
  const vent = smooth(0.165, 0.26, s) * (1 - smooth(0.2 + 0.2 * k, 0.24 + 0.3 * k, s));
  return { atria, vent };
}

// um passo de simulação (fixo, 1/250 s) — gera ECG, pleth e eventos de som
const STEP = 1 / 250;
const ecgBuf = [], plBuf = [];
let noiseSeed = 0;
function simStep(dt) {
  clock += dt;
  const vf = S.fib > 0.5 && !shock;
  let ecg = 0, pl = 0;
  noiseSeed += dt;
  const noise = (Math.sin(noiseSeed * 311) + Math.sin(noiseSeed * 173)) * 0.008;

  if (shock) {
    shock.t += dt;
    if (shock.phase === 'analyze' && shock.t > 2.8) {
      shock.phase = 'charge'; shock.t = 0;
      showShockMsg('⚡ Choque recomendado — carregando 200 J…');
      audio.say('Choque recomendado. Carregando.');
      audio.charge(2.2);
    } else if (shock.phase === 'charge' && shock.t > 2.2) {
      shock.phase = 'clear'; shock.t = 0;
      showShockMsg('Afastem-se! ✋');
      audio.ready();
      audio.say('Afastem-se do paciente!', { rate: 1.15, pitch: 1 });
    } else if (shock.phase === 'clear' && shock.t > 1.8) {
      shock.phase = 'zap'; shock.t = 0;
      audio.hush();
      audio.shock();
      setTimeout(() => audio.flatline(true), 150);
      setTimeout(() => audio.flatline(false), 1250);
      showShockMsg('⚡ CHOQUE!', 900);
      heartUniforms.uFlash.value = 1;
      $('flash').style.transition = 'none'; $('flash').style.opacity = 0.85;
      requestAnimationFrame(() => { $('flash').style.transition = 'opacity .6s'; $('flash').style.opacity = 0; });
      S.fib = 0;
    } else if (shock.phase === 'zap' && shock.t > 1.6) {
      shock = null;
      applyStage(AFTER_SHOCK);
      audio.success();
      audio.say('Choque aplicado. Ritmo cardíaco recuperado.');
      $('stageNum').textContent = '⚡';
      beatT = 0; cycle = 60 / 100; fired = {};
    }
    if (shock && shock.phase === 'zap') {
      ecg = shock.t < 0.04 ? 3 * Math.sin(shock.t * 80) : noise * 0.5 + 0.1 * Math.exp(-shock.t * 4);
    } else if (shock) {
      ecg = ecgVF(clock) * (1 - S.necro * 0.2) + noise;
    }
    pl = 0.02 * Math.sin(clock * 9);
    if (shock && shock.phase === 'zap') { S.fib = 0; }
  } else if (vf) {
    ecg = ecgVF(clock) + noise;
    pl = 0.03 * Math.sin(clock * 11) + noise;
    beatT += dt;
  } else {
    beatT += dt;
    if (beatT >= cycle) {
      beatT -= cycle;
      const hr = Math.max(30, S.hr);
      cycle = (60 / hr) * (1 + (Math.random() - 0.5) * 0.025);
      fired = {};
    }
    ecg = ecgSinus(beatT, cycle, { st: S.st, qwave: S.qwave }) + noise;
    const amp = 0.25 + 0.75 * S.contract * (S.sys > 0 ? Math.min(1, S.sys / 120) : 0);
    pl = pleth(beatT, cycle, amp) + noise * 0.3;
    const force = Math.min(1.3, (0.55 + 0.45 * S.contract) * (0.85 + S.hr / 480));
    if (!fired.s4 && beatT >= 0.11 && Math.max(S.necro, S.isch) > 0.45) { fired.s4 = true; audio.s4(Math.max(S.necro, S.isch)); }
    if (!fired.r && beatT >= 0.162) { fired.r = true; audio.monitorBeep(S.spo2); blip(); }
    if (!fired.s1 && beatT >= 0.19) { fired.s1 = true; audio.s1(force); }
    if (!fired.s2 && beatT >= sysEnd()) { fired.s2 = true; audio.s2(force * 0.95); }
  }
  ecgBuf.push(ecg); plBuf.push(pl);
}

function blip() {
  const b = $('blip');
  b.classList.add('on');
  setTimeout(() => b.classList.remove('on'), 120);
}

// ---------------------------------------------------------------- loop principal
const tmp = new THREE.Vector3();
const camDir = new THREE.Vector3();
const nWorld = new THREE.Vector3();
const lPos = new THREE.Vector3();
let last = performance.now();
let acc = 0;
let fpsFrames = 0, fpsTime = 0, fpsChecked = false;
let lastPhase = '';
let lastHud = 0;

function frame(now) {
  requestAnimationFrame(frame);
  let rdt = Math.min(0.1, (now - last) / 1000);
  last = now;

  // ajusta a qualidade automaticamente se o aparelho estiver lento
  if (!fpsChecked) {
    fpsFrames++; fpsTime += rdt;
    if (fpsTime > 3) {
      fpsChecked = true;
      if (fpsFrames / fpsTime < 40 && pixelRatio > 1) { pixelRatio = 1; renderer.setPixelRatio(1); resize(); }
    }
  }

  const speed = ui.mode === 'normal' && ui.slow ? 0.25 : 1;
  const dt = rdt * speed;

  // suavização dos parâmetros clínicos
  for (const k in RATE) S[k] += (TGT[k] - S[k]) * (1 - Math.exp(-rdt * RATE[k]));
  if (TGT.fib > 0.5 && !shock) S.fib = Math.max(S.fib, 0.51);

  // simulação a 250 Hz
  acc += dt;
  while (acc >= STEP) { simStep(STEP); acc -= STEP; }
  ecgTrace.push(ecgBuf.splice(0), dt);
  plTrace.push(plBuf.splice(0), dt);

  // uniforms do batimento
  const vf = S.fib > 0.5 && !shock;
  const c = contraction(beatT);
  if (shock && shock.phase === 'zap') {
    heartUniforms.uVent.value = Math.exp(-shock.t * 6) * 1.1;
    heartUniforms.uAtria.value = heartUniforms.uVent.value;
  } else if (vf || shock) {
    heartUniforms.uVent.value = 0.12 + 0.05 * Math.sin(clock * 23);
    heartUniforms.uAtria.value = 0.2 + 0.2 * Math.sin(clock * 17);
  } else {
    heartUniforms.uVent.value = c.vent * S.contract;
    heartUniforms.uAtria.value = c.atria;
  }
  audio.setFlow(vf ? 0.15 + 0.1 * Math.abs(Math.sin(clock * 13)) : heartUniforms.uVent.value * (0.5 + 0.5 * S.contract), vf ? 0.6 : 0);
  heartUniforms.uTime.value = clock;
  heartUniforms.uIsch.value = S.isch;
  heartUniforms.uNecro.value = S.necro;
  heartUniforms.uFib.value = vf || (shock && shock.phase !== 'zap') ? Math.min(1, S.fib) : 0;
  heartUniforms.uElecT.value = beatT;
  heartUniforms.uElecOn.value = ui.showElec ? 1 : 0;
  heartUniforms.uFlash.value *= Math.exp(-rdt * 5);

  // placa, coágulo, stent
  heart.plaqueMat.userData.local.uGrow.value = Math.max(0.001, S.plaque);
  heart.clotMat.userData.local.uGrow.value = Math.max(0.001, S.clot * (1 - S.stent));
  heart.plaque.visible = S.plaque > 0.05 && ui.mode === 'attack';
  heart.clot.visible = S.clot * (1 - S.stent) > 0.02;
  heart.stent.visible = S.stent > 0.3;
  heart.corDistalMat.userData.local.uTint.value = (1 - S.flow) * 0.55;

  // partículas de sangue (fluxo coronário é maior na diástole)
  if (pointCloud.visible) {
    const diast = vf ? 0.1 : 0.45 + 0.55 * (1 - heartUniforms.uVent.value);
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const cv = flowCurves[p.ci];
      let v = (0.35 / Math.max(0.6, cv.len)) * diast * (cv.vein ? 0.6 : 1) * (ui.mode === 'normal' ? S.hr / 72 : 1);
      if (cv.flow === 'prox' && S.flow < 0.3) {
        // o sangue chega até o coágulo e para
        p.u = Math.min(p.u + v * dt * 0.4, 0.97 - p.pack);
      } else if (cv.flow === 'dist' && S.flow < 0.3) {
        p.alpha = Math.max(0, p.alpha - rdt * 0.4);
      } else {
        p.u += v * dt * (cv.flow ? Math.max(0.05, S.flow) : 1);
        if (p.u > 1) { p.u -= 1; p.alpha = 1; }
        p.alpha = Math.min(1, p.alpha + rdt);
      }
      sampleFlow(cv, p.u, tmp);
      pPos[i * 3] = tmp.x; pPos[i * 3 + 1] = tmp.y; pPos[i * 3 + 2] = tmp.z;
      pSize[i] = p.alpha * (cv.vein ? 0.8 : 1);
    }
    pGeo.attributes.position.needsUpdate = true;
    pGeo.attributes.aSize.needsUpdate = true;
  }

  // artéria em detalhe
  artery.params.plaque = ui.mode === 'attack' ? S.plaque : 0.1;
  artery.params.clot = S.clot;
  artery.params.stent = S.stent;
  artery.params.flow = vf ? 0.05 : S.flow * (ui.mode === 'normal' ? S.hr / 72 : 1);
  artery.update(rdt);
  artery.draw();

  // câmera
  if (camAnim) {
    camAnim.t = Math.min(1, camAnim.t + rdt / 1.6);
    const e = camAnim.t < 0.5 ? 4 * camAnim.t ** 3 : 1 - (-2 * camAnim.t + 2) ** 3 / 2;
    camera.position.lerpVectors(camAnim.fromPos, camAnim.toPos, e);
    controls.target.lerpVectors(camAnim.fromTarget, camAnim.toTarget, e);
    if (camAnim.t >= 1) camAnim = null;
  }
  controls.update();

  // rótulos: somem quando estão atrás do coração
  camera.getWorldPosition(camDir);
  for (const l of labelObjs) {
    l.obj.getWorldPosition(lPos);
    nWorld.copy(l.n).transformDirection(heart.root.matrixWorld);
    const facing = nWorld.dot(tmp.copy(camDir).sub(lPos).normalize());
    let op = smooth(-0.15, 0.25, facing);
    if (l.id === 'clot') op *= ui.mode === 'attack' && S.clot > 0.5 && S.stent < 0.5 ? 1 : 0;
    l.div.style.opacity = op.toFixed(2);
  }

  // automático (modo apresentação)
  if (ui.mode === 'attack' && ui.auto) {
    ui.autoT += rdt;
    const id = ui.stage.id;
    const wait = id === 'fv' ? 7 : id === 'choque' ? 8 : id === 'stent' ? 18 : 13;
    if (ui.autoT > wait && !shock) {
      ui.autoT = 0;
      if (id === 'fv') defibrillate();
      else if (id === 'choque') doStent();
      else if (id === 'stent') goStage(0);
      else goStage(ui.stageIdx + 1);
    }
  }

  // alarme sonoro
  if (TGT.alarm || vf) {
    alarmT -= rdt;
    if (alarmT <= 0 && !shock) {
      if (vf) { audio.alarmHigh(); alarmT = 2.4; } else { audio.alarmMedium(); alarmT = 6; }
    }
  }

  // HUD (a ~15 Hz)
  if (now - lastHud > 66) { lastHud = now; updateHud(vf, c); }

  renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}

function updateHud(vf, c) {
  const hr = Math.round(S.hr);
  const flat = shock && shock.phase === 'zap';
  $('hrVal').textContent = vf || shock ? '---' : hr;
  $('vHr').classList.toggle('alarm', vf || !!shock || hr > 100 || hr < 50);
  const sys = Math.round(S.sys), dia = Math.round(S.dia);
  $('bpVal').textContent = vf || shock ? '--/--' : `${sys}/${dia}`;
  $('vBp').classList.toggle('alarm', vf || !!shock || sys < 90 || sys > 140);
  $('spo2Val').textContent = vf || shock ? '--' : Math.round(S.spo2);
  $('vSpo2').classList.toggle('alarm', vf || !!shock || S.spo2 < 94);

  const rh = $('rhythm');
  let txt = 'Ritmo sinusal normal', cls = '';
  if (flat) { txt = 'Choque aplicado'; cls = 'warn'; }
  else if (vf || shock) { txt = 'FIBRILAÇÃO VENTRICULAR'; cls = 'danger'; }
  else if (S.st > 0.12) { txt = 'Supra de ST — INFARTO'; cls = 'danger'; }
  else if (S.qwave > 0.5) { txt = 'Ondas Q (infarto antigo)'; cls = 'warn'; }
  else if (hr > 100) { txt = 'Taquicardia sinusal'; cls = 'warn'; }
  else if (hr < 60) { txt = 'Bradicardia sinusal'; cls = ''; }
  rh.textContent = txt; rh.className = 'rhythm ' + cls;

  // fase do ciclo
  let phase = 'diastole', label = 'Diástole — enchimento', pc = '';
  if (vf || shock) { phase = 'vf'; label = 'Fibrilação: sem bombeamento!'; pc = 'vf'; }
  else if (c.vent > 0.15) { phase = 'ventricular'; label = 'Sístole ventricular — ejeção'; pc = 'sys'; }
  else if (c.atria > 0.3) { phase = 'atrial'; label = 'Sístole atrial'; pc = 'atr'; }
  if (phase !== lastPhase) {
    lastPhase = phase;
    const pill = $('phasePill');
    pill.textContent = label; pill.className = 'phase-pill ' + pc;
    document.querySelectorAll('#phases li').forEach((li) => li.classList.toggle('active', li.dataset.phase === phase));
  }
}

// ---------------------------------------------------------------- início
setMode('normal');
requestAnimationFrame((t) => {
  last = t;
  requestAnimationFrame(frame);
  setTimeout(() => $('loading').classList.add('hide'), 300);
});

// funciona offline depois da primeira visita (útil na feira sem Wi-Fi)
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
