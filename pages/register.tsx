import type { NextPage } from "next";
import { useState, FormEvent, ChangeEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/router";
import logoImage from "../ref. images/MillerStorm-Logo_page-0001.jpg.jpeg";

const RegisterPage: NextPage = () => {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
    role: "sales"
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    if (e.target.name === "email") {
      setEmailError("");
    }
  }

  async function checkEmailAvailability(email: string) {
    if (!email) return;
    try {
      const res = await fetch(`/api/users/check-email?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.exists) {
          setEmailError("This email is already registered");
        } else {
          setEmailError("");
        }
      }
    } catch (error) {
      console.error("Failed to check email:", error);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (emailError) {
      setError(emailError);
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (formData.password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setIsLoading(true);

    try {
      const res = await fetch("/api/user-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role
        })
      });

      if (res.ok) {
        setSuccess(true);
      } else {
        const data = await res.json();
        setError(data.error || "Registration failed");
      }
    } catch (err: any) {
      setError(err.message || "Registration failed");
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
            <div style={{ fontSize: 24, fontWeight: 600, color: "#16a34a", marginBottom: 12 }}>
              ✓ Request Submitted
            </div>
            <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 24 }}>
              Your registration request has been sent to administration.
              <br />
              You will receive access within 24 hours.
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
        <div className="login-subtitle">Register for Access</div>
        <form className="login-form" onSubmit={handleSubmit}>
          {error && <div className="form-error">{error}</div>}
          
          <label className="field">
            <span className="field-label">Full Name</span>
            <input
              className="field-input"
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="John Doe"
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Work Email</span>
            <input
              className="field-input"
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              onBlur={(e) => checkEmailAvailability(e.target.value)}
              placeholder="you@company.com"
              required
            />
            {emailError && (
              <div style={{ fontSize: 12, color: "#dc2626", marginTop: 4 }}>
                {emailError}
              </div>
            )}
          </label>

          <label className="field">
            <span className="field-label">Role</span>
            <select
              className="field-input"
              name="role"
              value={formData.role}
              onChange={handleChange}
              required
            >
              <option value="sales">Sales</option>
              <option value="manager">Manager</option>
              <option value="marketing">Marketing</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">Password</span>
            <div className="password-input-wrap">
              <input
                className="field-input password-input"
                type={showPassword ? "text" : "password"}
                name="password"
                value={formData.password}
                onChange={handleChange}
                placeholder="Enter your password"
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
            <span className="field-label">Confirm Password</span>
            <div className="password-input-wrap">
              <input
                className="field-input password-input"
                type={showConfirmPassword ? "text" : "password"}
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                placeholder="Confirm your password"
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
            {isLoading ? "Submitting..." : "Submit Request"}
          </button>

          <div className="login-links" style={{marginTop: '12px'}}>
            <a href="/login" className="login-link">Already have an account? Sign In</a>
          </div>
        </form>
      </div>
      <div className="login-footer">
        © 2026-2027 Miller Storm. All Rights Reserved.
      </div>
    </div>
  );
};

export default RegisterPage;
