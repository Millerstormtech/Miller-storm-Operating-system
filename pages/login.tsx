import type { NextPage } from "next";
import { useState, FormEvent, ChangeEvent, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../src/contexts/AuthContext";
import { AuthShell } from "../src/components/AuthShell";
import { isBiometricEnabled, isBiometricSupported, loginWithBiometric, biometricLabel, isRunningAsApp } from "../src/lib/biometricAuth";

// Each role's home page and the URL prefix that role is allowed to land on.
const ROLE_HOME: Record<string, string> = {
  admin: "/admin/leaderboard",
  "c-level": "/c-level/dashboard",
  "branch-manager": "/branch-manager/dashboard",
  "sales-team-lead": "/manager/dashboard",
  sales: "/sales/dashboard",
  marketing: "/marketing/dashboard",
};
const ROLE_PREFIX: Record<string, string> = {
  admin: "/admin",
  "c-level": "/c-level",
  "branch-manager": "/branch-manager",
  "sales-team-lead": "/manager",
  sales: "/sales",
  marketing: "/marketing",
};

// Where to send a user right after login. A leftover `redirect_to` (e.g. from
// being bounced off another role's page) is only honoured when it belongs to
// THIS user's role — otherwise, e.g., an admin who logged in on a page that was
// redirected from /sales would wrongly land in the sales panel. Cross-role
// redirects fall back to the user's own home.
function destForRole(role: string, redirectTo?: string | null): string {
  const home = ROLE_HOME[role] || "/sales/dashboard";
  const prefix = ROLE_PREFIX[role];
  if (redirectTo && prefix && redirectTo.startsWith(prefix)) return redirectTo;
  return home;
}

const LoginPage: NextPage = () => {
  const router = useRouter();
  const { login, resumeSession, user, isLoading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [popup, setPopup] = useState<{ title: string; message: string } | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [bioLabel, setBioLabel] = useState("Face ID");

  // The PWA always launches at /login (its start_url). If a session is already
  // saved, the user is NOT logged out — send them straight to their dashboard
  // instead of showing the login form.
  useEffect(() => {
    if (authLoading || !user) return;
    router.replace(destForRole(user.role, router.query.redirect_to as string));
  }, [authLoading, user]);

  // Show the "Login with Face ID" button only inside the installed app/PWA (never
  // in a plain web browser), and only when biometrics are enrolled on this device.
  useEffect(() => {
    (async () => {
      if (isRunningAsApp() && isBiometricEnabled() && (await isBiometricSupported())) {
        setBioLabel(biometricLabel());
        setBioAvailable(true);
      }
    })();
  }, []);

  async function handleBiometricLogin() {
    setError("");
    const result = await loginWithBiometric();
    if (!result) {
      setError("Biometric sign-in was cancelled. Please use your email and password.");
      return;
    }
    resumeSession(result.user as any, result.token);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setIsLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      // Account-deletion states get a dedicated popup, not the inline error.
      if (err.code === "deletion_pending") {
        setPopup({ title: "Deletion request pending", message: "Your account deletion request is still pending admin review. You can't sign in until an admin approves or rejects it." });
      } else if (err.code === "account_deleted") {
        setPopup({ title: "Account deleted", message: "Your account has been deleted. If this is a mistake, contact your administrator." });
      } else {
        setError(err.message || "Login failed");
      }
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthShell>
      {popup && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setPopup(null)}
          style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: "min(92vw, 400px)", background: "#fff", borderRadius: 16, padding: 24, boxShadow: "0 24px 60px rgba(0,0,0,0.28)", textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 8 }}>🗑️</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 8 }}>{popup.title}</div>
            <div style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.5, marginBottom: 20 }}>{popup.message}</div>
            <button type="button" onClick={() => setPopup(null)} style={{ width: "100%", padding: "11px 18px", borderRadius: 24, border: "none", background: "#CB0002", color: "#fff", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>OK</button>
          </div>
        </div>
      )}
      <h1 className="ms-auth__title" style={{ whiteSpace: 'nowrap', fontSize: 'clamp(15px, 4.4vw, 26px)', textWrap: 'nowrap', textTransform: 'none' }}>Miller Storm Operating System</h1>
      <p className="ms-auth__subtitle">Sign in to your Miller Storm account.</p>

      <form className="ms-auth__form" onSubmit={handleSubmit}>
        {error && <div className="ms-auth__error">{error}</div>}

        <label className="ms-auth__field">
          <span className="ms-auth__label">Work Email</span>
          <input
            className="ms-auth__input"
            type="email"
            value={email}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            required
          />
        </label>

        <label className="ms-auth__field">
          <span className="ms-auth__label">Password</span>
          <div className="ms-auth__password">
            <input
              className="ms-auth__input"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
            />
            <button
              type="button"
              className="ms-auth__show"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <div className="ms-auth__forgot">
          <a href="/forgot-password">Forgot Password</a>
        </div>

        <button className="ms-auth__submit" type="submit" disabled={isLoading}>
          {isLoading ? "Signing In…" : "Sign In"}
        </button>

        {bioAvailable && (
          <button type="button" className="ms-auth__bio" onClick={handleBiometricLogin}>
            🔒 Login with {bioLabel}
          </button>
        )}

        <div className="ms-auth__foot-link">
          <span>New here? </span>
          <a href="/register">Register</a>
        </div>
      </form>
    </AuthShell>
  );
};

export default LoginPage;
