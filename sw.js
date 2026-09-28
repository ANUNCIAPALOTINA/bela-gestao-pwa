// Service worker: PWA instalável e atualizável sozinha (web/iOS). O app Android (APK) não usa isto.
// Estratégia network-first: tenta a rede primeiro (pega a versão nova assim que existir) e cai no
// cache quando estiver offline. Ao mudar qualquer arquivo do app, aumente VERSION — isso cria um
// cache novo, o service worker novo assume sozinho (skipWaiting + clients.claim) e o app recarrega.
const VERSION = 'v1.3.0';
const CACHE = 'bela-gestao-' + VERSION;
const ASSETS = [
  './', 'index.html', 'manifest.webmanifest', 'css/app.css', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  'js/app.js', 'js/util.js', 'js/db.js', 'js/services.js', 'js/ui.js', 'js/nav.js', 'js/install.js', 'js/native.js', 'js/reportimg.js',
  'js/views/home.js', 'js/views/sell.js', 'js/views/stock.js', 'js/views/clients.js', 'js/views/more.js', 'js/views/alerts.js',
  'js/views/indicators.js', 'js/views/reports.js', 'js/views/history.js', 'js/views/purchases.js', 'js/views/receivables.js', 'js/views/settings.js',
  'data/catalog.json',
];

self.addEventListener('install', e => {
  self.skipWaiting(); // não espera as abas antigas fecharem: assume assim que instalar
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('bela-gestao-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  // Network-first: busca na rede (e atualiza o cache) e só usa o cache se estiver offline.
  e.respondWith(
    fetch(req).then(r => {
      if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return r;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(hit => hit || (req.mode === 'navigate' ? caches.match('index.html') : Response.error())))
  );
});
