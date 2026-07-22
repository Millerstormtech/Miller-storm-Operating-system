/*
 * Face ID / fingerprint login for the PWA — via WebAuthn (platform authenticator).
 *
 * This mirrors the mobile app's model exactly: the biometric is a LOCAL GATE.
 * The user first signs in with their password (which is what actually
 * authenticates them to the server); enabling biometrics registers a platform
 * passkey and stashes the current session (user + token). On a later visit the
 * device's real Face ID / Touch ID / fingerprint prompt unlocks that stored
 * session — no password is ever stored, and the OS never exposes the biometric
 * to us. Like the app, we don't do a server-side WebAuthn verification; a
 * successful device prompt is trusted to restore the saved session.
 */

const CRED_KEY = "bio_cred_id";
const ENABLED_KEY = "bio_enabled";
const USER_KEY = "bio_user";
const TOKEN_KEY = "bio_token";

function bufToB64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBuf(s: string): ArrayBuffer {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 ? "=".repeat(4 - (norm.length % 4)) : "";
  const bin = atob(norm + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function randomBytes(len = 32): ArrayBuffer {
  const a = new Uint8Array(len);
  crypto.getRandomValues(a);
  return a.buffer;
}

/** True only when running as an installed PWA / native-style app (home-screen
 *  or standalone window) — NOT in a normal desktop/mobile browser tab. Biometric
 *  login is gated on this so Face ID / fingerprint never appears on the web. */
export function isRunningAsApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const mm = window.matchMedia;
    const standalone =
      (!!mm && (mm("(display-mode: standalone)").matches ||
                mm("(display-mode: fullscreen)").matches ||
                mm("(display-mode: minimal-ui)").matches)) ||
      (navigator as any).standalone === true; // iOS Safari home-screen app
    return !!standalone;
  } catch {
    return false;
  }
}

/** True when the device has a usable platform authenticator (Face ID / Touch ID
 *  / fingerprint) reachable through WebAuthn. */
export async function isBiometricSupported(): Promise<boolean> {
  try {
    if (typeof window === "undefined" || !window.PublicKeyCredential) return false;
    return await (window.PublicKeyCredential as any).isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** Has the user turned on biometric login on THIS device? */
export function isBiometricEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(ENABLED_KEY) === "1" && !!localStorage.getItem(CRED_KEY);
  } catch {
    return false;
  }
}

/** The label to show — "Face ID" on Apple devices, otherwise generic. */
export function biometricLabel(): string {
  if (typeof navigator === "undefined") return "Biometrics";
  return /iphone|ipad|mac/i.test(navigator.userAgent) ? "Face ID" : "Fingerprint";
}

type SessionUser = { id: string; email?: string; name?: string; [k: string]: any };

/** Register a platform passkey (prompts Face ID / fingerprint enrolment) and
 *  stash the current session so it can be unlocked later. Returns true on success. */
export async function enableBiometric(user: SessionUser, token: string): Promise<boolean> {
  try {
    if (!token || !user?.id) return false;
    // NOTE: do NOT `await` anything before create() — iOS Safari requires the
    // WebAuthn call to run within the button's user activation, and an
    // intervening await drops it (create() then throws NotAllowedError).
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge: randomBytes(),
        rp: { name: "Miller Storm", id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(user.id),
          name: user.email || user.id,
          displayName: user.name || user.email || "Miller Storm",
        },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },   // ES256
          { type: "public-key", alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "preferred",
        },
        timeout: 60000,
        attestation: "none",
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    localStorage.setItem(CRED_KEY, bufToB64url(cred.rawId));
    localStorage.setItem(ENABLED_KEY, "1");
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(TOKEN_KEY, token);
    return true;
  } catch (e) {
    console.warn("[biometric] enable failed:", e);
    return false;
  }
}

/** Prompt the device biometric and, on success, return the stored session to
 *  resume. Returns null if unavailable, cancelled, or nothing stored. */
export async function loginWithBiometric(): Promise<{ user: SessionUser; token: string } | null> {
  try {
    const credId = localStorage.getItem(CRED_KEY);
    const userStr = localStorage.getItem(USER_KEY);
    const token = localStorage.getItem(TOKEN_KEY);
    if (!credId || !userStr || !token) return null;
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(),
        allowCredentials: [{ id: b64urlToBuf(credId), type: "public-key" }],
        userVerification: "required",
        timeout: 60000,
      },
    });
    if (!assertion) return null; // cancelled / failed
    return { user: JSON.parse(userStr), token };
  } catch {
    return null; // user cancelled the prompt or it errored
  }
}

/** Keep the stored session fresh after a password login (same user only). If a
 *  DIFFERENT user signs in on this device, clear biometrics so it can't unlock
 *  the wrong account. */
export function syncBiometricSession(user: SessionUser, token: string): void {
  if (!isBiometricEnabled()) return;
  try {
    const stored = localStorage.getItem(USER_KEY);
    const storedId = stored ? (JSON.parse(stored).id as string) : null;
    if (storedId && storedId !== user.id) {
      disableBiometric();
      return;
    }
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function disableBiometric(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CRED_KEY);
    localStorage.removeItem(ENABLED_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
