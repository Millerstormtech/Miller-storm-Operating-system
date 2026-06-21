import type { NextPage } from "next";
import { useState, FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/router";
import logoImage from "../ref. images/MillerStorm-Logo_page-0001.jpg.jpeg";

const ForgotPasswordPage: NextPage = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setIsLoading(true);

    try {
      const res = await fetch("/api/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });

      const data = await res.json();

      if (res.ok) {
        setSuccess(true);
      } else {
        setError(data.error || "An error occurred");
      }
    } catch (err: any) {
      setError("An error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
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
            <div style={{ fontSize: 48, marginBottom: 16 }}>📧</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: "#16a34a", marginBottom: 12 }}>
              Check Your Email
            </div>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 24, lineHeight: 1.6 }}>
              If an account exists with <strong>{email}</strong>, you will receive a password reset link shortly.
              <br /><br />
              Please check your inbox and spam folder.
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => router.push("/login")}
            >
              Back to Login
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
        <div className="login-subtitle">Reset Your Password</div>
        <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 24, textAlign: "center" }}>
          Enter your email address and we'll send you a link to reset your password.
        </div>
        <form className="login-form" onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}
          
          <label className="field">
            <span className="field-label">Work Email</span>
            <input
              className="field-input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
            />
          </label>

          <button className="btn-primary" type="submit" disabled={isLoading}>
            {isLoading ? "Sending..." : "Send Reset Link"}
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

export default ForgotPasswordPage;
