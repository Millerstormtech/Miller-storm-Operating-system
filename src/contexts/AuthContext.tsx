import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useRouter } from "next/router";
import { setToken, clearToken, installAuthFetch, getToken } from "../lib/authToken";
import { enableWebPush } from "../lib/webPush";
import {
  enableBiometric as enableBio,
  isBiometricEnabled,
  isBiometricSupported,
  syncBiometricSession,
  biometricLabel,
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
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bioPrompt, setBioPrompt] = useState(false);
  const router = useRouter();

  useEffect(() => {
    installAuthFetch();
    const storedUser = localStorage.getItem("user");
    if (storedUser && storedUser !== "undefined") {
      try {
        const parsed = JSON.parse(storedUser);
        setUser(parsed);
        if (parsed?.id) enableWebPush(parsed.id);
      } catch (error) {
        localStorage.removeItem("user");
      }
    }
    setIsLoading(false);
  }, []);

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

    // Offer Face ID / fingerprint for next time — but only if the device
    // supports it and it isn't already on. The prompt's Enable button is a fresh
    // user gesture, which WebAuthn enrolment requires.
    if (!isBiometricEnabled() && (await isBiometricSupported())) {
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

  function logout() {
    setUser(null);
    localStorage.removeItem("user");
    clearToken();
    // Note: biometric enrolment is intentionally kept so the user can still
    // sign back in with Face ID from the login screen (matches the mobile app).
    router.push("/login");
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, isLoading, resumeSession, enableBiometric }}>
      {children}
      {bioPrompt && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 10001, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
          onClick={() => setBioPrompt(false)}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, maxWidth: 360, width: "100%", padding: "28px 24px", textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>🔐</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 8 }}>
              Enable {biometricLabel()} login?
            </div>
            <div style={{ fontSize: 14, color: "#6b7280", lineHeight: 1.55, marginBottom: 22 }}>
              Sign in faster next time with your {biometricLabel().toLowerCase()} — no password needed. You can turn this off anytime.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                onClick={() => setBioPrompt(false)}
                style={{ flex: 1, padding: "12px", borderRadius: 999, border: "1px solid #e5e7eb", background: "#fff", color: "#374151", fontWeight: 600, fontSize: 14, cursor: "pointer" }}
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
                style={{ flex: 1, padding: "12px", borderRadius: 999, border: "none", background: "#CB0002", color: "#fff", fontWeight: 700, fontSize: 14, cursor: "pointer" }}
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
