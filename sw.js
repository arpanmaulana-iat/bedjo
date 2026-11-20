/* ============================================================
   Service Worker — Kartu Ucapan Sempro · IAT B «Bedjo» 2023
   Naikkan VERSION setiap kali index.html / roster.json berubah.
   ============================================================ */
   const VERSION = "bedjo-v20";
   const SHELL   = VERSION + "-shell";
   const RUNTIME = VERSION + "-runtime";
   
   /* Berkas inti: tanpa ini situs tidak bisa jalan offline. */
   const CORE = [
     "./",
     "./index.html",
     "./manifest.webmanifest",
     "./data/roster.json"
   ];
   
   /* Aset pelengkap: kalau belum diunggah, pemasangan SW tetap berhasil. */
   const EXTRA = [
     "./assets/icon.svg",
     "./assets/icon-192.png",
     "./assets/icon-512.png",
     "./assets/apple-touch-icon.png",
     "./assets/favicon-32.png",
     "./assets/og.png"
   ];
   
   /* ---------- INSTALL ---------- */
   self.addEventListener("install", (event) => {
     event.waitUntil((async () => {
       const cache = await caches.open(SHELL);
       // Di-cache satu per satu agar satu berkas 404 tidak membatalkan semuanya.
       await Promise.all(
         CORE.concat(EXTRA).map((url) =>
           cache.add(new Request(url, { cache: "reload" })).catch(() => null)
         )
       );
       self.skipWaiting();
     })());
   });
   
   /* ---------- ACTIVATE ---------- */
   self.addEventListener("activate", (event) => {
     event.waitUntil((async () => {
       const keys = await caches.keys();
       await Promise.all(
         keys.filter((k) => k.indexOf(VERSION) !== 0).map((k) => caches.delete(k))
       );
       await self.clients.claim();
     })());
   });
   
   /* ---------- PESAN DARI HALAMAN ---------- */
   self.addEventListener("message", (event) => {
     if (event.data === "SKIP_WAITING") self.skipWaiting();
     if (event.data === "CLEAR_CACHE") {
       event.waitUntil(
         caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
       );
     }
   });
   
   /* ---------- STRATEGI ---------- */
   async function networkFirst(request, fallbackURL) {
     const cache = await caches.open(RUNTIME);
     try {
       const fresh = await fetch(request);
       if (fresh && fresh.status === 200 && fresh.type === "basic") {
         cache.put(request, fresh.clone());
       }
       return fresh;
     } catch (err) {
       const hit = await caches.match(request);
       if (hit) return hit;
       if (fallbackURL) {
         const shell = await caches.match(fallbackURL);
         if (shell) return shell;
       }
       return new Response(
         "Offline dan berkas belum tersimpan di perangkat ini.",
         { status: 504, statusText: "Offline", headers: { "Content-Type": "text/plain; charset=utf-8" } }
       );
     }
   }
   
   async function cacheFirst(request) {
     const hit = await caches.match(request);
     if (hit) {
       // Perbarui diam-diam di latar belakang untuk kunjungan berikutnya.
       fetch(request)
         .then((fresh) => {
           if (fresh && fresh.status === 200 && fresh.type === "basic") {
             caches.open(RUNTIME).then((c) => c.put(request, fresh));
           }
         })
         .catch(() => null);
       return hit;
     }
     try {
       const fresh = await fetch(request);
       if (fresh && fresh.status === 200 && fresh.type === "basic") {
         const cache = await caches.open(RUNTIME);
         cache.put(request, fresh.clone());
       }
       return fresh;
     } catch (err) {
       if (request.destination === "image") {
         const icon = await caches.match("./assets/icon.svg");
         if (icon) return icon;
       }
       return new Response("", { status: 504, statusText: "Offline" });
     }
   }
   
   /* ---------- FETCH ---------- */
   self.addEventListener("fetch", (event) => {
     const request = event.request;
     if (request.method !== "GET") return;
   
     let url;
     try { url = new URL(request.url); } catch (e) { return; }
   
     // CDN (JSZip, SheetJS, font) dibiarkan lewat jaringan — tidak di-cache di sini.
     if (url.origin !== self.location.origin) return;
     if (url.protocol !== "https:" && url.protocol !== "http:") return;
   
     // Navigasi halaman: selalu coba versi terbaru, jatuh ke cangkang saat offline.
     if (request.mode === "navigate") {
       event.respondWith(networkFirst(request, "./index.html"));
       return;
     }
   
     // Data roster: utamakan yang terbaru agar perubahan admin langsung terlihat.
     if (url.pathname.endsWith("/roster.json")) {
       event.respondWith(networkFirst(request, "./data/roster.json"));
       return;
     }
   
     // Sisanya (ikon, manifest, gambar): cache dulu, cepat dan hemat kuota.
     event.respondWith(cacheFirst(request));
   });