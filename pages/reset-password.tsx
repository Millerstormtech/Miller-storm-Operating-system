import type { NextPage } from "next";
import { useState, useEffect, FormEvent } from "react";
import { useRouter } from "next/router";
import { AuthShell } from "../src/components/AuthShell";

const ResetPasswordPage: NextPage = () => {
  const router = useRouter();
  const { token } = router.query;

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [verifying, setVerifying] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [userEmail, setUserEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    // Wait until Next.js has populated the query, then either verify the token
    // or stop the spinner and show a clear error (no token = bad link).
    if (!router.isReady) return;
    if (token) {
      verifyToken();
    } else {
      setError("No reset token provided. Please use the link from your email.");
      setVerifying(false);
    }
  }, [router.isReady, token]);

  async function verifyToken() {
    try {
      const res = await fetch(`/api/reset-password?token=${token}`);
      const data = await res.json();
      if (res.ok && data.valid) {
        setTokenValid(true);
        setUserEmail(data.email);
      } else {
        setError(data.error || "Invalid or expired reset link");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters"); return; }

    setIsLoading(true);
    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json();
      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data.error || "Failed to reset password");
      }
    } catch (err: any) {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  }

  if (verifying) {
    return (
      <AuthShell>
        <div className="ms-auth__success">
          <div className="ms-auth__success-text" style={{ marginBottom: 0 }}>
            Verifying reset link…
          </div>
        </div>
      </AuthShell>
    );
  }

  if (success) {
    return (
      <AuthShell>
        <div className="ms-auth__success">
          <div className="ms-auth__success-emoji">✓</div>
          <div className="ms-auth__success-title">Password Reset</div>
          <div className="ms-auth__success-text">
            Your password has been reset. You can now sign in with your new password.
          </div>
          <button type="button" className="ms-auth__submit" onClick={() => router.push("/login")}>
            Go to Sign In
          </button>
        </div>
      </AuthShell>
    );
  }

  if (!tokenValid) {
    return (
      <AuthShell>
        <div className="ms-auth__success">
          <div className="ms-auth__success-emoji">⚠️</div>
          <div className="ms-auth__success-title" style={{ color: "var(--ms-red)" }}>
            Invalid Reset Link
          </div>
          <div className="ms-auth__success-text">
            {error || "This password reset link is invalid or has expired."}
            <br />
            Please request a new one.
          </div>
          <button type="button" className="ms-auth__submit" onClick={() => router.push("/forgot-password")}>
            Request New Link
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="ms-auth__title">New Password</h1>
      <p className="ms-auth__subtitle">
        Resetting password for <strong>{userEmail}</strong>
      </p>

      <form className="ms-auth__form" onSubmit={handleSubmit}>
        {error && <div className="ms-auth__error">{error}</div>}

        <label className="ms-auth__field">
          <span className="ms-auth__label">New Password</span>
          <div className="ms-auth__password">
            <input className="ms-auth__input" type={showPassword ? "text" : "password"} value={password}
              onChange={(e) => setPassword(e.target.value)} placeholder="Enter new password"
              autoComplete="new-password" required />
            <button type="button" className="ms-auth__show" onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <label className="ms-auth__field">
          <span className="ms-auth__label">Confirm New Password</span>
          <div className="ms-auth__password">
            <input className="ms-auth__input" type={showConfirmPassword ? "text" : "password"} value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm new password"
              autoComplete="new-password" required />
            <button type="button" className="ms-auth__show" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}>
              {showConfirmPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <button className="ms-auth__submit" type="submit" disabled={isLoading}>
          {isLoading ? "Resetting…" : "Reset Password"}
        </button>

        <div className="ms-auth__foot-link">
          <a href="/login">Back to Sign In</a>
        </div>
      </form>
    </AuthShell>
  );
};

export default ResetPasswordPage;
