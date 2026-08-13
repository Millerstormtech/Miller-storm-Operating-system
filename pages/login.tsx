import type { NextPage } from "next";
import { useState, FormEvent, ChangeEvent, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../src/contexts/AuthContext";
import { AuthShell } from "../src/components/AuthShell";
import { isBiometricEnabled, isBiometricSupported, loginWithBiometric, biometricLabel, isRunningAsApp } from "../src/lib/biometricAuth";

// Each role's home page and the URL prefix that role is allowed to land on.
const ROLE_HOME: Record<string, string> = {
  admin: "/admin/user-management",
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
      setError(err.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <AuthShell>
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
