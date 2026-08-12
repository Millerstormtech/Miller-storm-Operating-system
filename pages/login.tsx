import type { NextPage } from "next";
import { useState, FormEvent, ChangeEvent, useEffect } from "react";
import { useRouter } from "next/router";
import { useAuth } from "../src/contexts/AuthContext";
import { isBiometricEnabled, isBiometricSupported, loginWithBiometric, biometricLabel, isRunningAsApp } from "../src/lib/biometricAuth";

// The transparent Miller Storm logo (used for the card mark AND the faded
// background watermark).
const LOGO_SRC = "/ChatGPT_Image_Feb_23__2026__07_00_52_PM-removebg-preview.png";

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
    <div className="ms-login">
      {/* Faded brand watermark behind the card */}
      <img className="ms-login__watermark" src={LOGO_SRC} alt="" aria-hidden="true" />

      <div className="ms-login__card">
        <img className="ms-login__logo" src={LOGO_SRC} alt="Miller Storm" />

        <h1 className="ms-login__title">Welcome Back</h1>
        <p className="ms-login__subtitle">Sign in to your Miller Storm account.</p>

        <form className="ms-login__form" onSubmit={handleSubmit}>
          {error && <div className="ms-login__error">{error}</div>}

          <label className="ms-login__field">
            <span className="ms-login__label">Work Email</span>
            <input
              className="ms-login__input"
              type="email"
              value={email}
              onChange={(e: ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
            />
          </label>

          <label className="ms-login__field">
            <span className="ms-login__label">Password</span>
            <div className="ms-login__password">
              <input
                className="ms-login__input"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="current-password"
                required
              />
              <button
                type="button"
                className="ms-login__show"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
          </label>

          <div className="ms-login__forgot">
            <a href="/forgot-password">Forgot Password</a>
          </div>

          <button className="ms-login__submit" type="submit" disabled={isLoading}>
            {isLoading ? "Signing In…" : "Sign In"}
          </button>

          {bioAvailable && (
            <button type="button" className="ms-login__bio" onClick={handleBiometricLogin}>
              🔒 Login with {bioLabel}
            </button>
          )}

          <div className="ms-login__register">
            <span>New here? </span>
            <a href="/register">Register</a>
          </div>
        </form>
      </div>

      <div className="ms-login__footer">© 2026–2027 Miller Storm. All Rights Reserved.</div>

      <style jsx>{`
        .ms-login {
          /* Light theme (default) */
          --bg: #eef0f3;
          --glow: rgba(202, 0, 2, 0.06);
          --card: #ffffff;
          --card-border: #eceef1;
          --text: #0f1115;
          --muted: #6b7280;
          --input-bg: #f3f4f6;
          --input-border: #e5e7eb;
          --input-text: #0f1115;
          --placeholder: #9ca3af;
          --wm-opacity: 0.05;
          --card-shadow: 0 30px 80px rgba(0, 0, 0, 0.1);
          --red: #ca0002;

          position: fixed;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
          overflow: hidden;
          background:
            radial-gradient(120% 90% at 50% -10%, var(--glow), transparent 55%),
            var(--bg);
        }

        .ms-login__watermark {
          position: absolute;
          top: 50%;
          left: 50%;
          width: min(1100px, 130vw);
          transform: translate(-50%, -46%);
          opacity: var(--wm-opacity);
          pointer-events: none;
          user-select: none;
          filter: saturate(1.1);
          z-index: 0;
        }

        .ms-login__card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 480px;
          padding: 40px 44px 34px;
          border-radius: 22px;
          background: var(--card);
          border: 1px solid var(--card-border);
          box-shadow: var(--card-shadow);
        }

        .ms-login__logo {
          display: block;
          height: 58px;
          width: auto;
          margin: 0 auto 22px;
          object-fit: contain;
        }

        .ms-login__title {
          margin: 0;
          font-size: clamp(40px, 6vw, 58px);
          line-height: 0.95;
          font-weight: 800;
          letter-spacing: -0.02em;
          text-transform: uppercase;
          color: var(--text);
        }

        .ms-login__subtitle {
          margin: 12px 0 30px;
          font-size: 15px;
          color: var(--muted);
        }

        .ms-login__form {
          display: flex;
          flex-direction: column;
        }

        .ms-login__error {
          background: rgba(202, 0, 2, 0.1);
          border: 1px solid rgba(202, 0, 2, 0.3);
          color: var(--red);
          font-size: 13px;
          font-weight: 600;
          padding: 10px 14px;
          border-radius: 10px;
          margin-bottom: 16px;
        }

        .ms-login__field {
          display: block;
          margin-bottom: 18px;
        }

        .ms-login__label {
          display: block;
          font-size: 14px;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 8px;
        }

        .ms-login__input {
          width: 100%;
          box-sizing: border-box;
          padding: 15px 16px;
          font-size: 15px;
          color: var(--input-text);
          background: var(--input-bg);
          border: 1px solid var(--input-border);
          border-radius: 12px;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .ms-login__input::placeholder {
          color: var(--placeholder);
        }
        .ms-login__input:focus {
          border-color: var(--red);
          box-shadow: 0 0 0 3px rgba(202, 0, 2, 0.15);
        }

        .ms-login__password {
          position: relative;
        }
        .ms-login__password .ms-login__input {
          padding-right: 74px;
        }
        .ms-login__show {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          color: var(--muted);
          padding: 4px;
        }
        .ms-login__show:hover {
          color: var(--text);
        }

        .ms-login__forgot {
          text-align: right;
          margin: 2px 0 22px;
        }
        .ms-login__forgot a {
          color: var(--red);
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
        }
        .ms-login__forgot a:hover {
          text-decoration: underline;
        }

        .ms-login__submit {
          width: 100%;
          padding: 16px;
          font-size: 16px;
          font-weight: 700;
          color: #fff;
          border: none;
          border-radius: 12px;
          cursor: pointer;
          background: linear-gradient(90deg, #8b0002 0%, #d51418 100%);
          box-shadow: 0 10px 24px rgba(202, 0, 2, 0.3);
          transition: filter 0.15s, transform 0.05s;
        }
        .ms-login__submit:hover {
          filter: brightness(1.06);
        }
        .ms-login__submit:active {
          transform: translateY(1px);
        }
        .ms-login__submit:disabled {
          opacity: 0.65;
          cursor: default;
        }

        .ms-login__bio {
          width: 100%;
          margin-top: 12px;
          padding: 14px;
          font-size: 15px;
          font-weight: 600;
          color: var(--text);
          background: var(--input-bg);
          border: 1px solid var(--input-border);
          border-radius: 12px;
          cursor: pointer;
        }

        .ms-login__register {
          text-align: center;
          margin-top: 22px;
          font-size: 15px;
          color: var(--muted);
        }
        .ms-login__register a {
          color: var(--red);
          font-weight: 700;
          text-decoration: none;
        }
        .ms-login__register a:hover {
          text-decoration: underline;
        }

        .ms-login__footer {
          position: relative;
          z-index: 1;
          margin-top: 22px;
          font-size: 12px;
          color: var(--muted);
        }

        /* Dark theme — follows the viewer's system setting */
        @media (prefers-color-scheme: dark) {
          .ms-login {
            --bg: #0a0a0b;
            --glow: rgba(202, 0, 2, 0.22);
            --card: rgba(26, 26, 28, 0.55);
            --card-border: rgba(255, 255, 255, 0.08);
            --text: #f5f5f7;
            --muted: #9aa0a6;
            --input-bg: rgba(0, 0, 0, 0.35);
            --input-border: rgba(255, 255, 255, 0.1);
            --input-text: #f5f5f7;
            --placeholder: #6b7280;
            --wm-opacity: 0.14;
            --card-shadow: 0 30px 90px rgba(0, 0, 0, 0.6);
          }
          .ms-login__card {
            backdrop-filter: blur(22px);
            -webkit-backdrop-filter: blur(22px);
          }
          /* The logo mark has dark text — brighten it so it reads on the glass card. */
          .ms-login__logo {
            filter: brightness(0) invert(1);
            opacity: 0.92;
          }
          .ms-login__watermark {
            filter: saturate(1.4) hue-rotate(-4deg);
          }
        }
      `}</style>
    </div>
  );
};

export default LoginPage;
