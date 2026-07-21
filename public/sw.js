/*
 * Miller Storm PWA service worker.
 *
 * Two jobs:
 *   1. Make the site installable + offline-tolerant, WITHOUT changing online
 *      behaviour (network-first — online users always get fresh content).
 *   2. Receive Firebase Cloud Messaging web push in the background and display
 *      the notification.
 */

/* ── Firebase Cloud Messaging (background push) ─────────────────────────────
 * Loaded from the gstatic CDN in the worker. Wrapped in try/catch so that if
 * the CDN is unreachable during install, PWA caching below still works and only
 * push is disabled.
 */
try {
  importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js");

  // eslint-disable-next-line no-undef
  firebase.initializeApp({
    apiKey: "AIzaSyAI3VqBvXzht_UnNRorFVPsLpZcV5g3NiI",
    authDomain: "millerstorm-e531a.firebaseapp.com",
    projectId: "millerstorm-e531a",
    storageBucket: "millerstorm-e531a.firebasestorage.app",
    messagingSenderId: "2006320977",
    appId: "1:2006320977:web:8ede7c342648dd49d7f570",
  });

  // Enabling messaging in the SW lets FCM auto-display background notification
  // payloads (the backend already sends { notification: { title, body } }) and
  // route a tap back into the app.
  // eslint-disable-next-line no-undef
  firebase.messaging();
} catch (e) {
  // Push unavailable (offline install / CDN blocked) — PWA still works.
}

/* ── PWA install + offline cache ────────────────────────────────────────────*/
const CACHE = "millerstorm-v1";

self.addEventListener("install", () => {
  // Activate the new SW immediately instead of waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin GET navigations/assets. Everything else — API
  // calls, uploads, cross-origin embeds (Vimeo/YouTube/Firebase) — passes
  // straight through, untouched.
  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    (async () => {
      try {
        // Network-first: online users always get the freshest content, so
        // instant deploys keep working. Stash a copy for offline fallback.
        const fresh = await fetch(request);
        if (fresh && fresh.ok && fresh.type === "basic") {
          const copy = fresh.clone();
          caches.open(CACHE).then((c) => c.put(request, copy)).catch(() => {});
        }
        return fresh;
      } catch (err) {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (request.mode === "navigate") {
          const shell = await caches.match("/login");
          if (shell) return shell;
        }
        throw err;
      }
    })()
  );
});
