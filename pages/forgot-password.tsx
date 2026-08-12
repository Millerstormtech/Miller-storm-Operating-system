import type { NextPage } from "next";
import { useState, FormEvent } from "react";
import { useRouter } from "next/router";
import { AuthShell } from "../src/components/AuthShell";

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
        body: JSON.stringify({ email }),
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
      <AuthShell>
        <div className="ms-auth__success">
          <div className="ms-auth__success-emoji">📧</div>
          <div className="ms-auth__success-title">Check Your Email</div>
          <div className="ms-auth__success-text">
            If an account exists with <strong>{email}</strong>, you&apos;ll receive a password
            reset link shortly.
            <br />
            <br />
            Please check your inbox and spam folder.
          </div>
          <button type="button" className="ms-auth__submit" onClick={() => router.push("/login")}>
            Back to Sign In
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <h1 className="ms-auth__title">Reset Password</h1>
      <p className="ms-auth__subtitle">
        Enter your email and we&apos;ll send you a link to reset your password.
      </p>

      <form className="ms-auth__form" onSubmit={handleSubmit}>
        {error && <div className="ms-auth__error">{error}</div>}

        <label className="ms-auth__field">
          <span className="ms-auth__label">Work Email</span>
          <input
            className="ms-auth__input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            autoComplete="email"
            required
          />
        </label>

        <button className="ms-auth__submit" type="submit" disabled={isLoading}>
          {isLoading ? "Sending…" : "Send Reset Link"}
        </button>

        <div className="ms-auth__foot-link">
          <a href="/login">Back to Sign In</a>
        </div>
      </form>
    </AuthShell>
  );
};

export default ForgotPasswordPage;
