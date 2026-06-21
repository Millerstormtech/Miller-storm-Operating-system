import nodemailer from "nodemailer";
import { renderTemplate } from "./emailTemplates";
import { getEmailTemplate } from "./emailTemplatesServer";

type EmailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
};

export async function sendEmail(options: EmailOptions) {
  try {
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
      throw new Error("SMTP configuration is missing in environment variables");
    }
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || `"Miller Storm OS" <${process.env.SMTP_USER}>`,
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html
    });
    console.log("Email sent successfully. Message ID:", info.messageId);
    return info;
  } catch (error: any) {
    console.error("Email sending error:", error.message || error);
    throw error;
  }
}

// ── Dynamic template-based senders ──────────────────────────────────────────

export async function sendPasswordResetEmail(name: string, resetLink: string, to: string) {
  const tmpl = await getEmailTemplate("passwordReset");
  if (tmpl.status === "draft") { console.log("[Email] passwordReset is draft — skipping"); return; }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{name}}": name,
    "{{resetLink}}": resetLink,
  });
  return sendEmail({ to, subject, html, text });
}

export async function sendRegistrationConfirmationEmail(name: string, email: string, role: string) {
  const tmpl = await getEmailTemplate("registrationConfirmation");
  if (tmpl.status === "draft") { console.log("[Email] registrationConfirmation is draft — skipping"); return; }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{name}}": name,
    "{{email}}": email,
    "{{role}}": role.charAt(0).toUpperCase() + role.slice(1),
  });
  return sendEmail({ to: email, subject, html, text });
}

export async function sendAccountApprovedEmail(name: string, email: string, role: string, loginUrl: string) {
  const tmpl = await getEmailTemplate("accountApproved");
  if (tmpl.status === "draft") { console.log("[Email] accountApproved is draft — skipping"); return; }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{name}}": name,
    "{{email}}": email,
    "{{role}}": role.charAt(0).toUpperCase() + role.slice(1),
    "{{loginUrl}}": loginUrl,
  });
  return sendEmail({ to: email, subject, html, text });
}

export async function sendAccountRejectedEmail(name: string, email: string, reason: string) {
  const tmpl = await getEmailTemplate("accountRejected");
  if (tmpl.status === "draft") { console.log("[Email] accountRejected is draft — skipping"); return; }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{name}}": name,
    "{{reason}}": reason,
  });
  return sendEmail({ to: email, subject, html, text });
}

export async function sendQuickStartUserEmail(name: string, email: string) {
  const tmpl = await getEmailTemplate("quickStartUser");
  if (tmpl.status === "draft") { console.log("[Email] quickStartUser is draft — skipping"); return; }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{name}}": name,
  });
  return sendEmail({ to: email, subject, html, text });
}

export async function sendQuickStartManagerEmail(hireName: string, managerName: string, managerEmail: string) {
  const tmpl = await getEmailTemplate("quickStartManager");
  if (tmpl.status === "draft") { console.log("[Email] quickStartManager is draft — skipping"); return; }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{hireName}}": hireName,
    "{{managerName}}": managerName,
  });
  return sendEmail({ to: managerEmail, subject, html, text });
}

export async function sendUserAccountUpdatedEmail(params: {
  name: string;
  email: string;
  password: string | null;
  roles: string[];
  managerName: string | null;
  loginUrl: string;
}) {
  const tmpl = await getEmailTemplate("userAccountUpdated");
  if (tmpl.status === "draft") { console.log("[Email] userAccountUpdated is draft — skipping"); return; }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{name}}": params.name,
    "{{email}}": params.email,
    "{{password}}": params.password || "Unchanged (use your existing password)",
    "{{role}}": params.roles.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(", "),
    "{{managerName}}": params.managerName || "N/A",
    "{{loginUrl}}": params.loginUrl,
  });
  return sendEmail({ to: params.email, subject, html, text });
}

export async function sendAdminConfirmationEmail(params: {
  adminName: string;
  adminEmail: string;
  userName: string;
  userEmail: string;
  roles: string[];
  managerName: string | null;
  passwordChanged: boolean;
  updatedAt: string;
}) {
  const tmpl = await getEmailTemplate("adminConfirmation");
  if (tmpl.status === "draft") { console.log("[Email] adminConfirmation is draft — skipping"); return; }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{adminName}}": params.adminName,
    "{{userName}}": params.userName,
    "{{userEmail}}": params.userEmail,
    "{{role}}": params.roles.map(r => r.charAt(0).toUpperCase() + r.slice(1)).join(", "),
    "{{managerName}}": params.managerName || "N/A",
    "{{passwordChanged}}": params.passwordChanged ? "Changed" : "Not Changed",
    "{{updatedAt}}": params.updatedAt,
  });
  return sendEmail({ to: params.adminEmail, subject, html, text });
}

// ── Legacy static generators (kept for backward compatibility) ───────────────

export function generatePasswordResetEmail(name: string, resetLink: string) {
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;">
<p>Hi ${name},</p>
<p>Click the link below to reset your password:</p>
<p><a href="${resetLink}">${resetLink}</a></p>
<p>This link expires in 1 hour.</p>
<p>© 2026-2027 Miller Storm.</p>
</body></html>`;
  const text = `Hi ${name},\n\nReset your password: ${resetLink}\n\nExpires in 1 hour.\n\n© 2026-2027 Miller Storm.`;
  return { html, text };
}

export function generateRegistrationConfirmationEmail(name: string, email: string, role: string) {
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;">
<p>Hi ${name},</p>
<p>Your registration request is pending approval.</p>
<p>Name: ${name} | Email: ${email} | Role: ${role}</p>
<p>© 2026-2027 Miller Storm.</p>
</body></html>`;
  const text = `Hi ${name},\n\nYour registration is pending approval.\nName: ${name}\nEmail: ${email}\nRole: ${role}\n\n© 2026-2027 Miller Storm.`;
  return { html, text };
}

export function generateApprovalEmail(name: string, email: string, role: string, loginUrl: string) {
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;">
<p>Hi ${name},</p>
<p>Your account has been approved!</p>
<p>Email: ${email} | Role: ${role}</p>
<p><a href="${loginUrl}">Login Now</a></p>
<p>© 2026-2027 Miller Storm.</p>
</body></html>`;
  const text = `Hi ${name},\n\nYour account has been approved!\nEmail: ${email}\nRole: ${role}\nLogin: ${loginUrl}\n\n© 2026-2027 Miller Storm.`;
  return { html, text };
}

export function generateRejectionEmail(name: string, email: string, role: string, reason: string) {
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;">
<p>Hi ${name},</p>
<p>Your registration request could not be approved at this time.</p>
<p>Reason: ${reason}</p>
<p>© 2026-2027 Miller Storm.</p>
</body></html>`;
  const text = `Hi ${name},\n\nYour registration was not approved.\nReason: ${reason}\n\n© 2026-2027 Miller Storm.`;
  return { html, text };
}

export function generateQuickStartEmail(name: string): string {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;">
<p>Hi ${name},</p>
<p>Welcome to Miller Storm. Complete training and get into the field within 48 hours.</p>
<p>© 2026-2027 Miller Storm.</p>
</body></html>`;
}

export function generateQuickStartManagerEmail(hireName: string, managerName: string): string {
  return `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;">
<p>Hi ${managerName},</p>
<p>A new sales rep has joined your team: ${hireName}. Please coordinate their ride-along.</p>
<p>© 2026-2027 Miller Storm.</p>
</body></html>`;
}
