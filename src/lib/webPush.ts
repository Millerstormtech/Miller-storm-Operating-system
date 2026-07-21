/*
 * Web push (Firebase Cloud Messaging) for the PWA.
 *
 * After the user signs in we ask for notification permission, obtain an FCM web
 * token, and save it to the user's record — the SAME `fcmToken` field the
 * mobile app uses, so the existing backend push sender (firebase-admin) reaches
 * the browser/PWA too, with no backend changes.
 *
 * These Firebase web-config values are public by design (they ship in client
 * code); the VAPID key is a public application-identity key. Nothing secret.
 */
const firebaseConfig = {
  apiKey: "AIzaSyAI3VqBvXzht_UnNRorFVPsLpZcV5g3NiI",
  authDomain: "millerstorm-e531a.firebaseapp.com",
  projectId: "millerstorm-e531a",
  storageBucket: "millerstorm-e531a.firebasestorage.app",
  messagingSenderId: "2006320977",
  appId: "1:2006320977:web:8ede7c342648dd49d7f570",
  measurementId: "G-72YXKE568E",
};

const VAPID_KEY =
  "BETu2bjG5yPQgbfPpEvHrPPoxVHU0FcmLB9hnYzQPN1Sv5WtonN2Zqi7zjHTi9xj_a1pfMaAcCcBO_vK_ISDCW0";

let foregroundWired = false;

/**
 * Best-effort: enable web push for the signed-in user. Safe to call more than
 * once and on browsers without support — it just no-ops. Never throws.
 */
export async function enableWebPush(userId: string): Promise<void> {
  try {
    if (typeof window === "undefined" || !userId) return;
    if (!("serviceWorker" in navigator) || !("Notification" in window)) return;

    // Load Firebase only on the client, on demand (keeps it out of SSR + the
    // initial bundle for users who never enable notifications).
    const { isSupported, getMessaging, getToken, onMessage } = await import("firebase/messaging");
    const { initializeApp, getApps, getApp } = await import("firebase/app");

    if (!(await isSupported())) return;
    if (Notification.permission === "denied") return;

    // Ask permission (login is a user gesture, which iOS/Safari requires).
    const permission =
      Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
    if (permission !== "granted") return;

    const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
    const registration = await navigator.serviceWorker.ready;
    const messaging = getMessaging(app);

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: registration,
    });
    if (!token) return;

    // Persist the token on the user's record (same field the app uses).
    await fetch(`/api/users/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fcmToken: token }),
    }).catch(() => {});

    // Foreground messages don't trigger the service worker, so show them here.
    if (!foregroundWired) {
      foregroundWired = true;
      onMessage(messaging, (payload) => {
        const n = payload.notification;
        if (n && Notification.permission === "granted") {
          new Notification(n.title || "Miller Storm", {
            body: n.body || "",
            icon: "/icons/icon-192.png",
          });
        }
      });
    }
  } catch (err) {
    // Push is a nice-to-have; never let it break the app.
    console.warn("[webPush] setup skipped:", err);
  }
}
