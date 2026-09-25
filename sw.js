// Guarda o site no aparelho para funcionar sem internet na feira.
// Troque a versão quando publicar mudanças.
const CACHE = 'coracao3d-v2';
const FILES = [
  './', './index.html', './css/style.css', './manifest.webmanifest',
  './js/main.js', './js/heart.js', './js/shaders.js', './js/ecg.js', './js/artery.js', './js/audio.js', './js/stages.js',
  './vendor/three/three.module.js', './vendor/three/OrbitControls.js', './vendor/three/CSS2DRenderer.js', './vendor/three/RoomEnvironment.js',
  './icons/icon.svg', './icons/icon-180.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// Rede primeiro (pega atualizações); sem internet, usa o que está guardado.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
  );
});
