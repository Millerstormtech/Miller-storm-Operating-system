import { createContext, useContext, useState, useEffect, useRef, ReactNode } from "react";
import { useRouter } from "next/router";
import { setToken, clearToken, installAuthFetch, getToken, setViewOnly } from "../lib/authToken";
import { enableWebPush } from "../lib/webPush";
import {
  enableBiometric as enableBio,
  isBiometricEnabled,
  isBiometricSupported,
  syncBiometricSession,
  disableBiometric,
  biometricLabel,
  isRunningAsApp,
} from "../lib/biometricAuth";

// Install the global Authorization-header fetch wrapper as early as possible,
// before any component fires off API requests.
installAuthFetch();

type User = {
  _id?: string; // MongoDB ID
  id: string;
  name: string;
  email: string;
  role: "admin" | "sales-team-lead" | "sales" | "marketing" | "c-level" | "branch-manager";
  managerId?: string;
};

type AuthContextType = {
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  // Restore a session from a biometric unlock (user + token already trusted).
  resumeSession: (user: User, token: string) => void;
  // Turn on Face ID / fingerprint login for the current signed-in user.
  enableBiometric: () => Promise<boolean>;
  // Admin "View As": enter a read-only view of another user's account (no
  // password), then exit back to the admin account. `impersonating` is true and
  // `realUser` holds the admin while a view-as session is active.
  viewAs: (target: User) => void;
  exitViewAs: () => void;
  impersonating: boolean;
  realUser: User | null;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// The signed-in user, mirrored to sessionStorage so a page refresh restores the
// session (paired with the token in authToken.ts). Cleared on logout / no session.
const SESSION_USER_KEY = "ms_auth_user";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bioPrompt, setBioPrompt] = useState(false);
  // The admin behind an active "View As" session (null when not impersonating).
  const [realUser, setRealUser] = useState<User | null>(null);
  const router = useRouter();
  // Live user (for the cross-tab responder closure) + the shared auth channel.
  const userRef = useRef<User | null>(null);
  userRef.current = user;
  const channelRef = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    installAuthFetch();
    // Session persistence: the token + user are mirrored to sessionStorage, which
    // survives a page REFRESH in the same tab but is wiped when the tab closes.
    // So a refresh keeps you signed in (the panel no longer logs you out on F5),
    // while closing every tab still ends the session. A brand-new tab (empty
    // sessionStorage) still adopts a live session from an already-open tab over a
    // same-origin BroadcastChannel instead of forcing a fresh login.
    const chan = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("ms-auth") : null;
    channelRef.current = chan;
    let resolved = false;

    // 1) Refresh restore: rebuild the session from sessionStorage if present.
    const persistedToken = getToken(); // authToken hydrates this from sessionStorage
    let persistedUser: User | null = null;
    try {
      const raw = sessionStorage.getItem(SESSION_USER_KEY);
      if (raw) persistedUser = JSON.parse(raw);
    } catch { /* ignore */ }
    if (persistedToken && persistedUser) {
      resolved = true;
      setUser(persistedUser);
      try { enableWebPush(persistedUser.id); } catch { /* ignore */ }
      setIsLoading(false);
    }

    const finishNoSession = () => {
      if (resolved) return;
      resolved = true;
      try { sessionStorage.removeItem(SESSION_USER_KEY); } catch { /* ignore */ }
      try { localStorage.removeItem("user"); } catch { /* ignore */ }
      clearToken();
      setIsLoading(false);
    };

    if (chan) {
      chan.onmessage = (e) => {
        const msg = e.data;
        if (!msg || typeof msg !== "object") return;
        if (msg.type === "session-request") {
          // A starting-up tab wants a session — hand ours over if we have one.
          const t = getToken();
          if (t && userRef.current) {
            chan.postMessage({ type: "session-offer", user: userRef.current, token: t });
          }
        } else if (msg.type === "session-offer" && !resolved && msg.user && msg.token) {
          // Adopt the existing tab's session instead of forcing a fresh login.
          resolved = true;
          setToken(msg.token);
          setUser(msg.user);
          try { sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(msg.user)); } catch { /* ignore */ }
          try { enableWebPush(msg.user.id); } catch { /* ignore */ }
          setIsLoading(false);
        } else if (msg.type === "logout") {
          // Signed out in another tab → drop the session here too.
          clearToken();
          setUser(null);
          try { sessionStorage.removeItem(SESSION_USER_KEY); } catch { /* ignore */ }
          try { localStorage.removeItem("user"); } catch { /* ignore */ }
        }
      };
      // Already restored from sessionStorage → don't need to ask other tabs.
      if (resolved) return;
      chan.postMessage({ type: "session-request" });
      // No answer in time → cold start; fall back to the login flow.
      const timer = setTimeout(finishNoSession, 400);
      return () => { clearTimeout(timer); };
    }

    if (!resolved) finishNoSession();
  }, []);

  // Web guard: with no restored session, any protected page must bounce to the
  // login form so the user is forced to type email + password. Public auth pages
  // are exempt. `redirect_to` preserves where they were headed after login.
  useEffect(() => {
    if (isLoading || user) return;
    const publicRoutes = ["/login", "/register", "/forgot-password", "/reset-password", "/"];
    if (!publicRoutes.includes(router.pathname)) {
      const target =
        router.asPath && !router.asPath.startsWith("/login")
          ? `/login?redirect_to=${encodeURIComponent(router.asPath)}`
          : "/login";
      router.replace(target);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, user, router.pathname]);

  function goToDashboard(u: User) {
    if (u.role === "admin") router.push("/admin/user-management");
    else if (u.role === "c-level") router.push("/c-level/dashboard");
    else if (u.role === "branch-manager") router.push("/branch-manager/dashboard");
    else if (u.role === "sales-team-lead") router.push("/manager/dashboard");
    else if (u.role === "sales") router.push("/sales/dashboard");
    else if (u.role === "marketing") router.push("/marketing/dashboard");
  }

  // Set the active session everywhere (state, storage, token), keep biometrics
  // and web push in sync, then route to the right dashboard.
  function applySession(u: User, token: string | null) {
    if (token) setToken(token);
    setUser(u);
    // Persist for refresh-restore (survives F5, cleared on tab close / logout).
    try { sessionStorage.setItem(SESSION_USER_KEY, JSON.stringify(u)); } catch { /* ignore */ }
    localStorage.setItem("user", JSON.stringify(u));
    if (token) syncBiometricSession(u as any, token);
    enableWebPush(u.id);
    goToDashboard(u);
  }

  async function login(email: string, password: string) {
    const response = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || "Login failed");
    }

    const userData = await response.json();
    const user: User = {
      id: userData.id,
      name: userData.name,
      email: userData.email,
      role: userData.role,
      managerId: userData.managerId,
    };

    applySession(user, userData.token || null);

    // Offer Face ID / fingerprint for next time — but only inside the installed
    // app/PWA (never on the plain web), if the device supports it and it isn't
    // already on. The prompt's Enable button is a fresh user gesture, which
    // WebAuthn enrolment requires.
    if (isRunningAsApp() && !isBiometricEnabled() && (await isBiometricSupported())) {
      setBioPrompt(true);
    }
  }

  // Called by the login screen after a successful biometric unlock.
  function resumeSession(u: User, token: string) {
    applySession(u, token);
  }

  async function enableBiometric(): Promise<boolean> {
    const token = getToken();
    if (!user || !token) return false;
    return enableBio(user as any, token);
  }

  // Enter a read-only view of another user's account. Keeps the admin's own
  // token (so reads stay authorized) but flips the fetch layer into view-only,
  // so no write can ever reach the API. Uses client-side navigation so the
  // AuthProvider never remounts (a full reload would clear the session).
  function viewAs(target: User) {
    if (!user) return;
    setRealUser((prev) => prev ?? user); // remember the admin, even if called twice
    setViewOnly(true);
    setUser(target);
    try { localStorage.setItem("user", JSON.stringify(target)); } catch { /* ignore */ }
    goToDashboard(target);
  }

  // Leave the read-only view and restore the admin account.
  function exitViewAs() {
    if (!realUser) return;
    const admin = realUser;
    setViewOnly(false);
    setRealUser(null);
    setUser(admin);
    try { localStorage.setItem("user", JSON.stringify(admin)); } catch { /* ignore */ }
    router.push("/admin/user-management");
  }

  function logout() {
    setViewOnly(false);
    setRealUser(null);
    setUser(null);
    try { sessionStorage.removeItem(SESSION_USER_KEY); } catch { /* ignore */ }
    localStorage.removeItem("user");
    clearToken();
    // Fully clear the session: also drop the stored biometric credential + JWT,
    // otherwise the leftover bio_token/bio_user let the app re-establish the
    // session (auto-login) without the user re-entering email/password.
    disableBiometric();
    // Sign out every other open tab too, so a shared session can't linger.
    try { channelRef.current?.postMessage({ type: "logout" }); } catch { /* ignore */ }
    router.push("/login");
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, resumeSession, enableBiometric, viewAs, exitViewAs, impersonating: !!realUser, realUser }}>
      {children}
      {bioPrompt && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setBioPrompt(false)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--surface-default)", borderRadius: 16, maxWidth: 360, width: "100%", padding: "28px 24px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>🔐</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>
              Enable {biometricLabel()} login?
            </div>
            <div style={{ fontSize: 14, color: "var(--text-muted)", lineHeight: 1.55, marginBottom: 22 }}>
              Sign in faster next time with your {biometricLabel().toLowerCase()} — no password needed. You can turn this off anytime.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setBioPrompt(false)}
                style={{ flex: 1, padding: "12px", borderRadius: 999, border: "1px solid var(--border-default)", background: "var(--surface-default)", color: "var(--text-tertiary)", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
              >
                Not now
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await enableBiometric();
                  setBioPrompt(false);
                  if (!ok) {
                    alert(
                      "Couldn't turn on " + biometricLabel() +
                      ". Make sure it's set up on your device, then try again."
                    );
                  }
                }}
                style={{ flex: 1, padding: "12px", borderRadius: 999, border: "none", background: "#CB0002", color: "var(--text-inverse)", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
              >
                Enable
              </button>
            </div>
          </div>
        </div>
      )}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
