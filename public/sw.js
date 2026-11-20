const SHELL_CACHE_NAME = "ldkh-gis-shell-v1";

const STATIC_SHELL_ASSETS = [
  "/manifest.webmanifest",
  "/icons/icon-192x192.png",
  "/icons/icon-512x512.png",
  "/icons/icon-maskable-512x512.png",
  "/icons/apple-touch-icon.png",
];

const OFFLINE_FALLBACK_HTML = `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Offline — Web GIS LDKH</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100dvh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      background: #f8fafc;
      color: #0f172a;
    }
    .card {
      width: 100%;
      max-width: 400px;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 16px;
      padding: 24px;
      text-align: center;
      box-shadow: 0 10px 25px -5px rgba(15, 23, 42, 0.08);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: #2563eb;
      color: #ffffff;
      font-weight: 700;
      font-size: 16px;
      margin-bottom: 16px;
    }
    h1 {
      margin: 0 0 8px;
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
    }
    p {
      margin: 0 0 20px;
      font-size: 13px;
      line-height: 1.5;
      color: #475569;
    }
    button {
      appearance: none;
      border: 0;
      border-radius: 10px;
      background: #2563eb;
      color: #ffffff;
      font-size: 13px;
      font-weight: 600;
      padding: 10px 18px;
      min-height: 44px;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">GIS</div>
    <h1>Koneksi Terputus</h1>
    <p>Koneksi terputus — hubungkan internet untuk memuat peta dan dokumen LDKH.</p>
    <button type="button" onclick="window.location.reload()">Coba Muat Ulang</button>
  </main>
</body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE_NAME)
      .then((cache) => cache.addAll(STATIC_SHELL_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== SHELL_CACHE_NAME)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isSensitiveOrApiRequest(request, url) {
  if (url.pathname.startsWith("/api/")) return true;
  if (url.pathname.startsWith("/api/v1/files/")) return true;
  if (url.pathname.toLowerCase().endsWith(".pdf")) return true;
  if (request.headers.has("authorization")) return true;
  return false;
}

function isStaticAppShellAsset(url) {
  return (
    url.pathname === "/manifest.webmanifest" ||
    url.pathname.startsWith("/icons/")
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // KEBIJAKAN KEAMANAN KETAT:
  // Jangan pernah cache /api/*, token autentikasi, atau stream PDF (/api/v1/files/*).
  if (isSensitiveOrApiRequest(request, url)) {
    event.respondWith(fetch(request));
    return;
  }

  // Navigasi halaman: NetworkOnly mutlak dengan fallback offline statis agar halaman terproteksi tidak tersimpan di cache.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(
        () =>
          new Response(OFFLINE_FALLBACK_HTML, {
            status: 503,
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
            },
          }),
      ),
    );
    return;
  }

  // Aset app shell ringan (ikon & manifest): sajikan dari cache sambil perbarui di latar belakang.
  if (isStaticAppShellAsset(url)) {
    event.respondWith(
      caches.open(SHELL_CACHE_NAME).then(async (cache) => {
        const cached = await cache.match(request);
        const networkPromise = fetch(request)
          .then((response) => {
            if (response && response.ok && response.type === "basic") {
              cache.put(request, response.clone()).catch(() => undefined);
            }
            return response;
          })
          .catch(() => undefined);

        return cached || (await networkPromise) || Response.error();
      }),
    );
  }
});
