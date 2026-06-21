import type { NextPage } from "next";
import { useState, useEffect, FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/router";
import logoImage from "../ref. images/MillerStorm-Logo_page-0001.jpg.jpeg";

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
    if (token) {
      verifyToken();
    }
  }, [token]);

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

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password })
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
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 14, color: "#6b7280" }}>
              Verifying reset link...
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (success) {
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
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>✓</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: "#16a34a", marginBottom: 12 }}>
              Password Reset Successful
            </div>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 24 }}>
              Your password has been reset successfully.
              <br />
              You can now login with your new password.
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => router.push("/login")}
            >
              Go to Login
            </button>
          </div>
        </div>
        <div className="login-footer">
          © 2026-2027 Miller Storm. All Rights Reserved.
        </div>
      </div>
    );
  }

  if (!tokenValid) {
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
          <div style={{ textAlign: "center", padding: "32px 0" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: "#dc2626", marginBottom: 12 }}>
              Invalid Reset Link
            </div>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 24 }}>
              {error || "This password reset link is invalid or has expired."}
              <br />
              Please request a new password reset link.
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => router.push("/forgot-password")}
            >
              Request New Link
            </button>
          </div>
        </div>
        <div className="login-footer">
          © 2026-2027 Miller Storm. All Rights Reserved.
        </div>
      </div>
    );
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
        <div className="login-subtitle">Set New Password</div>
        <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 24, textAlign: "center" }}>
          Resetting password for <strong>{userEmail}</strong>
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}
          
          <label className="field">
            <span className="field-label">New Password</span>
            <div className="password-input-wrap">
              <input
                className="field-input password-input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter new password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
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
          </label>

          <label className="field">
            <span className="field-label">Confirm New Password</span>
            <div className="password-input-wrap">
              <input
                className="field-input password-input"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                required
              />
              <button
                type="button"
                className="password-toggle"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                aria-label={showConfirmPassword ? "Hide password" : "Show password"}
              >
                {showConfirmPassword ? (
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
          </label>

          <button className="btn-primary" type="submit" disabled={isLoading}>
            {isLoading ? "Resetting..." : "Reset Password"}
          </button>

          <div className="login-links" style={{marginTop: '12px'}}>
            <a href="/login" className="login-link">Back to Login</a>
          </div>
        </form>
      </div>
      <div className="login-footer">
        © 2026-2027 Miller Storm. All Rights Reserved.
      </div>
    </div>
  );
};

export default ResetPasswordPage;
