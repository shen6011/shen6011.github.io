// Service Worker：离线缓存 + 每日后台推送通知
const CACHE = 'expiry-keeper-v4';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './styles.css',
  './vendor/dexie.min.js', './vendor/xlsx.full.min.js', './vendor/html5-qrcode.min.js',
  './js/main.js', './js/app.js', './js/util.js', './js/db.js', './js/scan.js',
  './js/barcodeLookup.js', './js/export.js', './js/notify.js',
  './js/views/dashboard.js', './js/views/add.js', './js/views/list.js',
  './js/views/settings.js',
  './data/aldilib.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/icon-maskable-512.png'
];
importScripts('./vendor/dexie.min.js');

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => cached))
  );
});

self.addEventListener('periodicsync', event => {
  if (event.tag === 'expiry-daily') event.waitUntil(showDailyNotification());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then(cls => {
    for (const c of cls) if ('focus' in c) return c.focus();
    return self.clients.openWindow('./index.html');
  }));
});

async function showDailyNotification() {
  const Dexie = self.Dexie;
  const db = new Dexie('expiryKeeper');
  db.version(1).stores({ records: 'id,expiryDate', settings: 'key' });
  const rows = await db.settings.toArray();
  const s = {}; rows.forEach(r => s[r.key] = r.value);
  const warn = s.warningDays ?? 30, urgent = s.urgentDays ?? 7;
  const recs = await db.records.toArray();
  const statusOf = (exp) => {
    if (!exp) return 'unknown';
    const d = Math.round((new Date(exp + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000);
    if (d < 0) return 'expired';
    if (d <= urgent) return 'urgent';
    if (d <= warn) return 'warning';
    return 'ok';
  };
  const expiring = recs.filter(r => { const st = statusOf(r.expiryDate); return st === 'expired' || st === 'urgent' || st === 'warning'; });
  if (!expiring.length) return;
  const expiredN = expiring.filter(r => statusOf(r.expiryDate) === 'expired').length;
  const soonN = expiring.length - expiredN;
  await self.registration.showNotification('保质期管家 · 每日提醒', {
    body: `过期 ${expiredN} 件，临期 ${soonN} 件，请及时整理`,
    icon: 'icons/icon-192.png', badge: 'icons/icon-192.png'
  });
}
