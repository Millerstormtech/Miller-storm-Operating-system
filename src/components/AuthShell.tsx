import type { ReactNode } from "react";
// Crisp original logo (dark charcoal + red on white) — reads clearly and looks
// identical in dark AND light. The transparent PNG below is only the faded
// background watermark.
import logoMark from "../../ref. images/MillerStorm-Logo_page-0001.jpg.jpeg";

// The transparent Miller Storm logo — used only as the faded background watermark.
const LOGO_SRC = "/ChatGPT_Image_Feb_23__2026__07_00_52_PM-removebg-preview.png";

/**
 * Shared shell for the signed-out pages (login, register, forgot/reset password):
 * the brand background + faded logo watermark, the glass card, the logo, and the
 * footer — plus the whole `ms-auth__*` design system (dark + light via
 * prefers-color-scheme). Pages render their heading/form as children using the
 * `ms-auth__*` classes below, so all three stay visually identical.
 */
export function AuthShell({ children, wide = false }: { children: ReactNode; wide?: boolean }) {
  return (
    <div className={`ms-auth${wide ? " ms-auth--wide" : ""}`}>
      <img className="ms-auth__watermark" src={LOGO_SRC} alt="" aria-hidden="true" />
      <div className="ms-auth__card">
        <img className="ms-auth__logo" src={logoMark.src} alt="Miller Storm" />
        {children}
      </div>
      <div className="ms-auth__footer">© 2026–2027 Miller Storm. All Rights Reserved.</div>

      <style jsx global>{`
        .ms-auth {
          /* Light theme (default) */
          --ms-bg: #eef0f3;
          --ms-glow: rgba(202, 0, 2, 0.06);
          --ms-card: #ffffff;
          --ms-card-border: #eceef1;
          --ms-card-shadow: 0 30px 80px rgba(0, 0, 0, 0.1);
          --ms-text: #0f1115;
          --ms-muted: #6b7280;
          --ms-input-bg: #f3f4f6;
          --ms-input-border: #e5e7eb;
          --ms-input-text: #0f1115;
          --ms-placeholder: #9ca3af;
          --ms-wm-opacity: 0.06;
          --ms-glass-blur: 0px;
          --ms-red: #ca0002;
          --ms-good: #16a34a;

          position: fixed;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 24px;
          overflow: auto;
          background:
            radial-gradient(120% 90% at 50% -10%, var(--ms-glow), transparent 55%),
            var(--ms-bg);
        }

        .ms-auth__watermark {
          position: fixed;
          top: 50%;
          left: 50%;
          width: min(1000px, 130vw);
          transform: translate(-50%, -48%);
          opacity: var(--ms-wm-opacity);
          pointer-events: none;
          user-select: none;
          z-index: 0;
        }

        .ms-auth__card {
          position: relative;
          z-index: 1;
          width: 100%;
          max-width: 480px;
          padding: 38px 44px 32px;
          border-radius: 22px;
          background: var(--ms-card);
          border: 1px solid var(--ms-card-border);
          box-shadow: var(--ms-card-shadow);
          backdrop-filter: blur(var(--ms-glass-blur));
          -webkit-backdrop-filter: blur(var(--ms-glass-blur));
        }

        /* Crisp logo that reads the same in dark and light. Its own white ground
           keeps the dark wordmark legible on the glass card; rounded corners
           soften that ground so it doesn't read as a hard box. */
        .ms-auth__logo {
          display: block;
          height: 96px;
          width: auto;
          margin: 0 auto 18px;
          object-fit: contain;
          border-radius: 14px;
        }

        .ms-auth__title {
          margin: 0;
          font-family: "Arial Narrow", "Roboto Condensed", "Helvetica Neue", Arial, sans-serif;
          font-size: clamp(23px, 2.9vw, 31px);
          line-height: 0.94;
          font-weight: 800;
          letter-spacing: 0.01em;
          text-transform: uppercase;
          color: var(--ms-text);
          text-wrap: balance;
        }
        .ms-auth__subtitle {
          margin: 12px 0 28px;
          font-size: 15px;
          color: var(--ms-muted);
        }

        .ms-auth__form {
          display: flex;
          flex-direction: column;
        }

        /* Wide, two-column variant for the taller Register page — fits one screen. */
        .ms-auth--wide .ms-auth__card {
          max-width: 720px;
          padding: 30px 40px 26px;
        }
        .ms-auth--wide .ms-auth__logo {
          height: 80px;
          margin-bottom: 12px;
        }
        .ms-auth--wide .ms-auth__title {
          font-size: clamp(26px, 3.2vw, 34px);
        }
        .ms-auth--wide .ms-auth__subtitle {
          margin: 8px 0 20px;
        }
        .ms-auth__grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          column-gap: 22px;
        }
        .ms-auth__grid .ms-auth__field {
          margin-bottom: 12px;
        }
        .ms-auth__full {
          grid-column: 1 / -1;
        }
        @media (max-width: 560px) {
          .ms-auth__grid {
            grid-template-columns: 1fr;
          }
        }

        .ms-auth__error {
          background: rgba(202, 0, 2, 0.1);
          border: 1px solid rgba(202, 0, 2, 0.3);
          color: var(--ms-red);
          font-size: 13px;
          font-weight: 600;
          padding: 10px 14px;
          border-radius: 10px;
          margin-bottom: 16px;
        }

        .ms-auth__field {
          display: block;
          margin-bottom: 16px;
        }
        .ms-auth__label {
          display: block;
          font-size: 14px;
          font-weight: 700;
          color: var(--ms-text);
          margin-bottom: 8px;
        }

        .ms-auth__input,
        .ms-auth__select {
          width: 100%;
          box-sizing: border-box;
          padding: 14px 16px;
          font-size: 15px;
          color: var(--ms-input-text);
          background: var(--ms-input-bg);
          border: 1px solid var(--ms-input-border);
          border-radius: 12px;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .ms-auth__input::placeholder {
          color: var(--ms-placeholder);
        }
        .ms-auth__input:focus,
        .ms-auth__select:focus {
          border-color: var(--ms-red);
          box-shadow: 0 0 0 3px rgba(202, 0, 2, 0.15);
        }

        .ms-auth__select {
          appearance: none;
          -webkit-appearance: none;
          padding-right: 40px;
          cursor: pointer;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%236b7280' d='M6 8 0 0h12z'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 16px center;
        }
        .ms-auth__select:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }

        .ms-auth__password {
          position: relative;
        }
        .ms-auth__password .ms-auth__input {
          padding-right: 74px;
        }
        .ms-auth__show {
          position: absolute;
          right: 14px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          color: var(--ms-muted);
          padding: 4px;
        }
        .ms-auth__show:hover {
          color: var(--ms-text);
        }

        .ms-auth__hint {
          font-size: 12px;
          color: var(--ms-red);
          margin-top: 6px;
        }

        .ms-auth__forgot {
          text-align: right;
          margin: 2px 0 22px;
        }
        .ms-auth__forgot a {
          color: var(--ms-red);
          font-size: 14px;
          font-weight: 600;
          text-decoration: none;
        }
        .ms-auth__forgot a:hover {
          text-decoration: underline;
        }

        .ms-auth__submit {
          width: 100%;
          margin-top: 6px;
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
        .ms-auth__submit:hover {
          filter: brightness(1.06);
        }
        .ms-auth__submit:active {
          transform: translateY(1px);
        }
        .ms-auth__submit:disabled {
          opacity: 0.65;
          cursor: default;
        }

        .ms-auth__bio {
          width: 100%;
          margin-top: 12px;
          padding: 14px;
          font-size: 15px;
          font-weight: 600;
          color: var(--ms-text);
          background: var(--ms-input-bg);
          border: 1px solid var(--ms-input-border);
          border-radius: 12px;
          cursor: pointer;
        }

        .ms-auth__foot-link {
          text-align: center;
          margin-top: 22px;
          font-size: 15px;
          color: var(--ms-muted);
        }
        .ms-auth__foot-link a {
          color: var(--ms-red);
          font-weight: 700;
          text-decoration: none;
        }
        .ms-auth__foot-link a:hover {
          text-decoration: underline;
        }

        .ms-auth__footer {
          position: relative;
          z-index: 1;
          margin-top: 22px;
          font-size: 12px;
          color: var(--ms-muted);
          text-align: center;
        }

        /* Success / confirmation panel (register + forgot-password) */
        .ms-auth__success {
          text-align: center;
          padding: 12px 0 8px;
        }
        .ms-auth__success-emoji {
          font-size: 46px;
          margin-bottom: 12px;
        }
        .ms-auth__success-title {
          font-size: 22px;
          font-weight: 800;
          color: var(--ms-good);
          margin-bottom: 12px;
        }
        .ms-auth__success-text {
          font-size: 14px;
          color: var(--ms-muted);
          line-height: 1.6;
          margin-bottom: 24px;
        }

        /* Dark theme — follows the app-wide toggle (data-theme on <html>). */
        html[data-theme="dark"] .ms-auth {
          --ms-bg: #0a0a0b;
          --ms-glow: rgba(202, 0, 2, 0.22);
          --ms-card: rgba(26, 26, 28, 0.55);
          --ms-card-border: rgba(255, 255, 255, 0.08);
          --ms-card-shadow: 0 30px 90px rgba(0, 0, 0, 0.6);
          --ms-text: #f5f5f7;
          --ms-muted: #9aa0a6;
          --ms-input-bg: rgba(0, 0, 0, 0.35);
          --ms-input-border: rgba(255, 255, 255, 0.1);
          --ms-input-text: #f5f5f7;
          --ms-placeholder: #6b7280;
          --ms-wm-opacity: 0.14;
          --ms-glass-blur: 22px;
          --ms-good: #34d399;
        }
        html[data-theme="dark"] .ms-auth__watermark {
          filter: saturate(1.4);
        }
        html[data-theme="dark"] .ms-auth__select {
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%239aa0a6' d='M6 8 0 0h12z'/%3E%3C/svg%3E");
        }

        @media (prefers-reduced-motion: reduce) {
          .ms-auth * { transition: none !important; }
        }
      `}</style>
    </div>
  );
}
