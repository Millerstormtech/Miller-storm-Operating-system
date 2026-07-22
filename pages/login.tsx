import type { NextPage } from "next";
import { useState, FormEvent, ChangeEvent, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/router";
import { useAuth } from "../src/contexts/AuthContext";
import { isBiometricEnabled, isBiometricSupported, loginWithBiometric, biometricLabel, isRunningAsApp } from "../src/lib/biometricAuth";
import logoImage from "../ref. images/MillerStorm-Logo_page-0001.jpg.jpeg";

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
  // saved (localStorage), the user is NOT logged out — send them straight to
  // their dashboard instead of showing the login form. This fixes "the PWA logs
  // me out every time I reopen it".
  useEffect(() => {
    if (authLoading || !user) return;
    const routes: Record<string, string> = {
      admin: "/admin/user-management",
      "c-level": "/c-level/dashboard",
      "branch-manager": "/branch-manager/dashboard",
      "sales-team-lead": "/manager/dashboard",
      sales: "/sales/dashboard",
      marketing: "/marketing/dashboard",
    };
    router.replace((router.query.redirect_to as string) || routes[user.role] || "/sales/dashboard");
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
    const redirectTo = router.query.redirect_to as string;
    if (redirectTo) router.push(redirectTo);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      await login(email, password);
      // After successful login, redirect to the redirect_to URL if provided
      const redirectTo = router.query.redirect_to as string;
      if (redirectTo) {
        router.push(redirectTo);
      }
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="login-root">
      <div className="login-card">
        <div className="login-logo">
          <Image
            src={logoImage}
            alt="Miller Storm logo"
            width={180}
            height={96}
          />
        </div>
        <div className="login-title">
          The Miller Storm Operating System
        </div>
        <div className="login-subtitle" style={{ fontSize: '14px', color: '#6b7280', marginTop: '8px' }}>
          powered by Genesis, everything- it starts here
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}
          <label className="field">
            <span className="field-label">Work Email</span>
            <input
              className="field-input"
              type="email"
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) =>
                setEmail(e.target.value)
              }
              placeholder="you@company.com"
              required
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <div className="password-input-wrap">
              <input
                className="field-input password-input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e: ChangeEvent<HTMLInputElement>) =>
                  setPassword(e.target.value)
                }
                placeholder="Enter your password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M12 5c-7 0-10 7-10 7s3 7 10 7 10-7 10-7-3-7-10-7zm0 12a5 5 0 1 1 0-10 5 5 0 0 1 0 10zM4 12l-2-2 10-6 2 2-10 6z"
                    />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
                    <path
                      fill="currentColor"
                      d="M12 5c7 0 10 7 10 7s-3 7-10 7S2 12 2 12s3-7 10-7zm0 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10z"
                    />
                  </svg>
                )}
              </button>
            </div>
            <div className="login-links" style={{marginTop: '4px', justifyContent: 'flex-start'}}>
              <a href="/forgot-password" className="login-link">Forgot Password</a>
            </div>
          </label>
          <button className="btn-primary" type="submit" disabled={isLoading}>
            {isLoading ? "Signing In..." : "Sign In"}
          </button>
          {bioAvailable && (
            <button
              type="button"
              className="btn-primary"
              onClick={handleBiometricLogin}
              style={{ marginTop: 10, background: "#111827", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              🔒 Login with {bioLabel}
            </button>
          )}
          <div className="login-links" style={{marginTop: '12px'}}>
            <a href="/register" className="login-link">Register</a>
          </div>
        </form>
      </div>
      <div className="login-footer">
        © 2026-2027 Miller Storm. All Rights Reserved.
      </div>
    </div>
  );
};

export default LoginPage;
