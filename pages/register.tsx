import type { NextPage } from "next";
import { useState, useEffect, FormEvent, ChangeEvent } from "react";
import { useRouter } from "next/router";
import { AuthShell } from "../src/components/AuthShell";
import { BRANCHES } from "../src/lib/repcard/branches";

const RegisterPage: NextPage = () => {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirmPassword: "",
    role: "sales",
    branch: "",
    managerId: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState("");
  const [emailError, setEmailError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  // Sales Team Leads a Sales rep can pick as their team (filtered by branch).
  const [teamLeads, setTeamLeads] = useState<Array<{ id: string; name: string; territory?: string }>>([]);

  useEffect(() => {
    fetch("/api/public/team-leads")
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setTeamLeads(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, []);

  function handleChange(e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value } = e.target;
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      // Team leads are branch-scoped, so a new branch clears the chosen team.
      if (name === "branch") next.managerId = "";
      // Branch/Team only apply to Sales; leaving Sales drops them.
      if (name === "role" && value !== "sales") { next.branch = ""; next.managerId = ""; }
      return next;
    });
    if (name === "email") setEmailError("");
  }

  async function checkEmailAvailability(email: string) {
    if (!email) return;
    try {
      const res = await fetch(`/api/users/check-email?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        setEmailError(data.exists ? "This email is already registered" : "");
      }
    } catch (error) {
      console.error("Failed to check email:", error);
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (emailError) { setError(emailError); return; }
    if (!formData.phone.trim()) { setError("Please enter your phone number."); return; }
    if (formData.password !== formData.confirmPassword) { setError("Passwords do not match"); return; }
    if (formData.password.length < 6) { setError("Password must be at least 6 characters"); return; }
    if (formData.role === "sales") {
      if (!formData.branch) { setError("Please select your Branch."); return; }
      if (!formData.managerId) { setError("Please select your Team (Sales Team Lead)."); return; }
    }

    setIsLoading(true);
    try {
      const res = await fetch("/api/user-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          password: formData.password,
          role: formData.role,
          branch: formData.role === "sales" ? formData.branch : "",
          managerId: formData.role === "sales" ? formData.managerId : "",
        }),
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
      <AuthShell>
        <div className="ms-auth__success">
          <div className="ms-auth__success-emoji">✓</div>
          <div className="ms-auth__success-title">Request Submitted</div>
          <div className="ms-auth__success-text">
            Your registration request has been sent to administration.
            <br />
            You&apos;ll receive access within 24 hours.
          </div>
          <button type="button" className="ms-auth__submit" onClick={() => router.push("/login")}>
            Back to Sign In
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell wide>
      <h1 className="ms-auth__title">Create Account</h1>
      <p className="ms-auth__subtitle">Register for access to Miller Storm.</p>

      <form className="ms-auth__form ms-auth__grid" onSubmit={handleSubmit}>
        {error && <div className="ms-auth__error ms-auth__full">{error}</div>}

        <label className="ms-auth__field">
          <span className="ms-auth__label">Full Name</span>
          <input className="ms-auth__input" type="text" name="name" value={formData.name}
            onChange={handleChange} placeholder="John Doe" autoComplete="name" required />
        </label>

        <label className="ms-auth__field">
          <span className="ms-auth__label">Work Email</span>
          <input className="ms-auth__input" type="email" name="email" value={formData.email}
            onChange={handleChange} onBlur={(e) => checkEmailAvailability(e.target.value)}
            placeholder="you@company.com" autoComplete="email" required />
          {emailError && <div className="ms-auth__hint">{emailError}</div>}
        </label>

        <label className="ms-auth__field">
          <span className="ms-auth__label">Phone Number</span>
          <input className="ms-auth__input" type="tel" name="phone" value={formData.phone}
            onChange={handleChange} placeholder="(555) 123-4567" autoComplete="tel" required />
        </label>

        <label className="ms-auth__field">
          <span className="ms-auth__label">Role</span>
          <select className="ms-auth__select" name="role" value={formData.role} onChange={handleChange} required>
            <option value="sales">Sales Rep</option>
            <option value="branch-manager">Branch Manager</option>
            <option value="sales-team-lead">Sales Team Lead</option>
            <option value="marketing">Marketing</option>
          </select>
        </label>

        {formData.role === "sales" && (
          <>
            <label className="ms-auth__field">
              <span className="ms-auth__label">Branch</span>
              <select className="ms-auth__select" name="branch" value={formData.branch} onChange={handleChange} required>
                <option value="">Select branch</option>
                {BRANCHES.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>

            <label className="ms-auth__field">
              <span className="ms-auth__label">Team</span>
              <select className="ms-auth__select" name="managerId" value={formData.managerId}
                onChange={handleChange} required disabled={!formData.branch}>
                <option value="">
                  {formData.branch ? "Select your Sales Team Lead" : "Select a branch first"}
                </option>
                {teamLeads
                  .filter((tl) => (tl.territory || "").trim().toLowerCase() === formData.branch.trim().toLowerCase())
                  .map((tl) => <option key={tl.id} value={tl.id}>{tl.name}</option>)}
              </select>
            </label>
          </>
        )}

        <label className="ms-auth__field">
          <span className="ms-auth__label">Password</span>
          <div className="ms-auth__password">
            <input className="ms-auth__input" type={showPassword ? "text" : "password"} name="password"
              value={formData.password} onChange={handleChange} placeholder="Enter your password"
              autoComplete="new-password" required />
            <button type="button" className="ms-auth__show" onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <label className="ms-auth__field">
          <span className="ms-auth__label">Confirm Password</span>
          <div className="ms-auth__password">
            <input className="ms-auth__input" type={showConfirmPassword ? "text" : "password"} name="confirmPassword"
              value={formData.confirmPassword} onChange={handleChange} placeholder="Confirm your password"
              autoComplete="new-password" required />
            <button type="button" className="ms-auth__show" onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              aria-label={showConfirmPassword ? "Hide password" : "Show password"}>
              {showConfirmPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <button className="ms-auth__submit ms-auth__full" type="submit" disabled={isLoading}>
          {isLoading ? "Submitting…" : "Submit Request"}
        </button>

        <div className="ms-auth__foot-link ms-auth__full">
          <span>Already have an account? </span>
          <a href="/login">Sign In</a>
        </div>
      </form>
    </AuthShell>
  );
};

export default RegisterPage;
