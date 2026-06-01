const CACHE_VERSION = "v1";
// INCREMENT on every deploy to bust stale cache: v1 → v2 → v3
const CACHE_NAME = `chatgpt-as-pdf-${CACHE_VERSION}`;

// Explicitly cached on install — minimal set to keep SW size small.
// All other static assets (fonts, _next/static/) are cached lazily by the fetch handler below.
const STATIC_ASSETS = [
  "/",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/fonts/Roboto-Regular.ttf",
  "/fonts/Roboto-Bold.ttf",
  "/fonts/RobotoMono-Regular.ttf",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)),
        ),
      ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Always use network for API routes — never cache conversions
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    caches.match(event.request).then(
      (cached) =>
        cached ??
        fetch(event.request).then((response) => {
          if (response.ok) {
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(event.request, response.clone()));
          }
          return response;
        }),
    ),
  );
});
