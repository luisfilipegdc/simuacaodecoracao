// Código GLSL compartilhado por todas as partes do coração.
// Todas as malhas do coração ficam no MESMO sistema de coordenadas local,
// então a mesma função de deformação faz músculo, artérias e partículas
// de sangue se moverem juntos a cada batimento.

export const heartUniforms = {
  uTime: { value: 0 },
  uVent: { value: 0 },    // contração ventricular (0 relaxado, 1 sístole)
  uAtria: { value: 0 },   // contração atrial
  uIsch: { value: 0 },    // isquemia (falta de oxigênio) na área da artéria DA
  uNecro: { value: 0 },   // necrose (infarto estabelecido)
  uFib: { value: 0 },     // fibrilação ventricular
  uElecT: { value: 10 },  // tempo desde o início da onda P (s)
  uElecOn: { value: 0 },  // mostrar impulso elétrico
  uFlash: { value: 0 },   // brilho do choque do desfibrilador
};

export const commonGLSL = /* glsl */ `
uniform float uTime;
uniform float uVent;
uniform float uAtria;
uniform float uIsch;
uniform float uNecro;
uniform float uFib;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x),
        mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x),
        mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y), f.z);
}

// Território da artéria descendente anterior (DA): parede anterior do
// ventrículo esquerdo, septo anterior e ponta (ápice).
float zoneW(vec3 p) {
  float t = p.y > 0.0 ? p.y / 0.95 : p.y / 1.6;
  float phi = atan(p.x / 1.08, p.z / 0.8);
  float d = phi - 0.8;
  d = atan(sin(d), cos(d));
  float wA = 1.0 - smoothstep(0.5, 1.2, abs(d));
  float wY = 1.0 - smoothstep(0.0, 0.45, t);
  float apex = 1.0 - smoothstep(-0.92, -0.6, t);
  float w = max(wA * wY, apex);
  float n = vnoise(p * 4.0) * 0.6 + vnoise(p * 9.0) * 0.4;
  w = smoothstep(0.3, 0.7, w + (n - 0.5) * 0.45);
  return w * (1.0 - smoothstep(0.5, 0.85, p.y));
}

vec3 deformHeart(vec3 p) {
  vec3 q = p;
  float vW = 1.0 - smoothstep(0.5, 0.95, p.y);
  float h = clamp((0.95 - p.y) / 2.55, 0.0, 1.0); // 0 na base, 1 no ápice

  // Área sem oxigênio não contrai (acinesia) e chega a estufar (discinesia)
  float z = zoneW(p) * max(uIsch, uNecro);
  float c = uVent * (1.0 - 1.3 * z);

  // encurtamento radial
  float rad = 0.13 * c * vW;
  q.x *= 1.0 - rad;
  q.z *= 1.0 - rad;
  // o ápice sobe em direção à base (encurtamento longitudinal)
  q.y += 0.17 * uVent * vW * h;
  // torção do ventrículo esquerdo (o coração "torce" como um pano)
  float ang = 0.2 * uVent * vW * h;
  float ca = cos(ang), sa = sin(ang);
  q.xz = vec2(ca * q.x - sa * q.z, sa * q.x + ca * q.z);

  // átrios: contraem na sístole atrial e enchem na sístole ventricular
  vec3 ra = vec3(-0.62, 1.05, 0.12);
  vec3 la = vec3(0.25, 1.02, -0.5);
  vec3 ctr = distance(p, ra) < distance(p, la) ? ra : la;
  float aW = smoothstep(0.62, 0.95, p.y) * (1.0 - smoothstep(0.55, 0.85, distance(p, ctr)));
  q += (ctr - p) * aW * (0.14 * uAtria - 0.04 * uVent);

  // fibrilação: tremor caótico, sem contração eficaz
  if (uFib > 0.001) {
    float n1 = sin(p.x * 9.0 + uTime * 31.0) * sin(p.y * 7.0 - uTime * 27.0) * sin(p.z * 8.0 + uTime * 37.0);
    float n2 = vnoise(p * 3.0 + vec3(uTime * 7.0)) - 0.5;
    vec3 dir = normalize(vec3(p.x, 0.0, p.z) + vec3(1e-4));
    q += dir * (n1 * 0.028 + n2 * 0.05) * uFib * vW;
  }
  return q;
}
`;

// Tempo de ativação elétrica de cada ponto (sistema de condução)
const electricGLSL = /* glsl */ `
uniform float uElecT;
uniform float uElecOn;
uniform float uFlash;
float actTime(vec3 p) {
  vec3 sa = vec3(-0.75, 1.45, 0.1);        // nó sinoatrial
  float ta = distance(p, sa) * 0.055;       // despolarização atrial
  float h = clamp((0.95 - p.y) / 2.55, 0.0, 1.0);
  // após o atraso do nó AV, as fibras de Purkinje ativam do ápice para a base
  float tv = 0.155 + (1.0 - h) * 0.055 + (1.0 - abs(p.x) / 1.1) * 0.006;
  float vW = 1.0 - smoothstep(0.6, 0.85, p.y);
  return mix(ta, tv, vW);
}
`;

/**
 * Injeta a deformação do batimento em um material padrão do three.js.
 * opts.zone   -> pinta a área isquêmica / necrosada
 * opts.pulse  -> dilata na sístole (artérias elásticas)
 * opts.elec   -> mostra a onda de despolarização
 * opts.grow   -> { center: Vector3 } escala a partir de um centro (coágulo/placa)
 */
export function patchMaterial(mat, opts = {}) {
  const local = {
    uZoneOn: { value: opts.zone ? 1 : 0 },
    uPulse: { value: opts.pulse || 0 },
    uElecLocal: { value: opts.elec ? 1 : 0 },
    uGrow: { value: 1 },
    uGrowCenter: { value: opts.grow ? opts.grow.center : null },
    uTint: { value: 0 },
  };
  mat.userData.local = local;
  mat.defines = mat.defines || {};
  if (opts.grow) mat.defines.USE_GROW = '';
  mat.onBeforeCompile = (shader) => {
    for (const k in heartUniforms) shader.uniforms[k] = heartUniforms[k];
    for (const k in local) if (local[k].value !== null) shader.uniforms[k] = local[k];

    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
${commonGLSL}
uniform float uPulse;
#ifdef USE_GROW
uniform float uGrow;
uniform vec3 uGrowCenter;
#endif
varying vec3 vHeartPos;`)
      .replace('#include <begin_vertex>', `
vec3 p0 = position;
#ifdef USE_GROW
p0 = uGrowCenter + (position - uGrowCenter) * uGrow;
#endif
vec3 transformed = deformHeart(p0) + objectNormal * (uPulse * 0.018 * uVent);
vHeartPos = p0;`);

    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
${commonGLSL}
${electricGLSL}
uniform float uZoneOn;
uniform float uElecLocal;
uniform float uTint;
varying vec3 vHeartPos;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
{
  float zw = zoneW(vHeartPos) * uZoneOn;
  float mott = vnoise(vHeartPos * 14.0);
  float mott2 = vnoise(vHeartPos * 38.0);
  // isquemia: músculo escurecido, arroxeado (cianótico)
  vec3 ischCol = mix(vec3(0.30, 0.10, 0.20), vec3(0.45, 0.20, 0.30), mott);
  diffuseColor.rgb = mix(diffuseColor.rgb, ischCol, zw * uIsch * 0.8);
  // necrose: pálido, amarelado, com manchas hemorrágicas
  vec3 necroCol = mix(vec3(0.55, 0.42, 0.30), vec3(0.28, 0.06, 0.07), smoothstep(0.45, 0.75, mott2 * 0.6 + mott * 0.4));
  diffuseColor.rgb = mix(diffuseColor.rgb, necroCol, zw * uNecro * 0.85);
  // escurecimento de artéria sem fluxo
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.04, 0.06), uTint);
}`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{
  float act = actTime(vHeartPos);
  float dt = uElecT - act;
  float g = exp(-dt * dt / 0.0005) + 0.25 * exp(-dt * dt / 0.004) * step(0.0, dt);
  vec3 glowCol = vec3(1.0, 0.82, 0.35);
  totalEmissiveRadiance += glowCol * g * uElecOn * uElecLocal * 1.4 * (1.0 - uFib);
  // fibrilação: frentes elétricas caóticas e desorganizadas
  float vW = 1.0 - smoothstep(0.55, 0.85, vHeartPos.y);
  float chaos = pow(vnoise(vHeartPos * 3.5 + vec3(uTime * 5.0, -uTime * 4.0, uTime * 3.0)), 5.0);
  totalEmissiveRadiance += glowCol * chaos * 3.0 * uFib * uElecOn * uElecLocal * vW;
  totalEmissiveRadiance += vec3(0.6, 0.8, 1.0) * uFlash * uElecLocal;
}`);
  };
  mat.customProgramCacheKey = () => 'heart' + (opts.grow ? 'g' : '');
  return mat;
}
