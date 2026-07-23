const CACHE_NAME = "timesheet-v4";
const APP_SHELL = [
  "./",
  "./index.html",
  "./recover.html",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith("timesheet-") && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // 1) 頁面導覽：network-first，失敗時才回退到快取
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((resp) => {
          if (!resp.ok) return resp;
          const copy = resp.clone();
          return caches.open(CACHE_NAME)
            .then((cache) => cache.put(req, copy))
            .catch(() => {})
            .then(() => resp);
        })
        .catch(() =>
          caches.match(req)
            .then((cached) => cached || caches.match("./index.html"))
        )
    );
    return;
  }

  // 2) 其他同源資源：cache-first（App 外殼）
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((resp) => {
          const copy = resp.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return resp;
        });
      })
    );
    return;
  }

  // 3) CDN：stale-while-revalidate（先快取、背景更新）
  if (["cdn.tailwindcss.com", "unpkg.com"].includes(url.hostname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((resp) => {
            const copy = resp.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
            return resp;
          })
          .catch(() => cached);

        return cached || network;
      })
    );
  }
});
