import { Resend } from "resend";
import { renderTemplate } from "./emailTemplates";
import { getEmailTemplate } from "./emailTemplatesServer";
import { roleDisplayName } from "./roleLabels";

type EmailOptions = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /**
   * Optional file attachments. Resend takes the raw bytes as `content`, so a
   * caller passes a Buffer rather than a path: nothing here reads the disk.
   * Resend's own ceiling is 40MB per message across all attachments; a
   * certificate PDF is far under that, but do not attach anything unbounded.
   */
  attachments?: Array<{ filename: string; content: Buffer }>;
};

export async function sendEmail(options: EmailOptions) {
  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is missing in environment variables");
    }
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from: process.env.RESEND_FROM || "Miller Storm OS <onboarding@resend.dev>",
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
      // Omitted entirely when there are none: Resend rejects an empty array.
      ...(options.attachments?.length ? { attachments: options.attachments } : {}),
    });
    if (error) {
      throw new Error(error.message || JSON.stringify(error));
    }
    console.log("Email sent successfully. Message ID:", data?.id);
    return data;
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
    "{{role}}": roleDisplayName(role),
  });
  return sendEmail({ to: email, subject, html, text });
}

export async function sendNewRegistrationAdminEmail(params: {
  adminName: string;
  adminEmail: string;
  name: string;
  email: string;
  role: string;
}) {
  const tmpl = await getEmailTemplate("newRegistrationAdmin");
  if (tmpl.status === "draft") { console.log("[Email] newRegistrationAdmin is draft — skipping"); return; }
  const base = (process.env.NEXT_PUBLIC_APP_URL || "https://yourdomain.com").replace(/\/$/, "");
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{adminName}}": params.adminName,
    "{{name}}": params.name,
    "{{email}}": params.email,
    "{{role}}": roleDisplayName(params.role),
    "{{reviewUrl}}": `${base}/admin/user-management`,
  });
  return sendEmail({ to: params.adminEmail, subject, html, text });
}

export async function sendAccountApprovedEmail(name: string, email: string, role: string, loginUrl: string) {
  const tmpl = await getEmailTemplate("accountApproved");
  if (tmpl.status === "draft") { console.log("[Email] accountApproved is draft — skipping"); return; }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{name}}": name,
    "{{email}}": email,
    "{{role}}": roleDisplayName(role),
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
    "{{role}}": params.roles.map(r => roleDisplayName(r)).join(", "),
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
    "{{role}}": params.roles.map(r => roleDisplayName(r)).join(", "),
    "{{managerName}}": params.managerName || "N/A",
    "{{passwordChanged}}": params.passwordChanged ? "Changed" : "Not Changed",
    "{{updatedAt}}": params.updatedAt,
  });
  return sendEmail({ to: params.adminEmail, subject, html, text });
}

export async function sendManagerDeadlineMissedEmail(params: {
  managerName: string;
  managerEmail: string;
  userName: string;
  playlistName: string;
  deadline: string;
  completedModules: number;
  totalModules: number;
}) {
  const tmpl = await getEmailTemplate("managerDeadlineMissed");
  if (tmpl.status === "draft") { console.log("[Email] managerDeadlineMissed is draft — skipping"); return; }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{managerName}}": params.managerName,
    "{{userName}}": params.userName,
    "{{playlistName}}": params.playlistName,
    "{{deadline}}": params.deadline,
    "{{completedModules}}": String(params.completedModules),
    "{{totalModules}}": String(params.totalModules),
  });
  return sendEmail({ to: params.managerEmail, subject, html, text });
}

export async function sendWeeklyTeamDigestEmail(params: {
  managerName: string;
  managerEmail: string;
  teamTableHtml: string;
}) {
  const tmpl = await getEmailTemplate("weeklyTeamDigest");
  if (tmpl.status === "draft") { console.log("[Email] weeklyTeamDigest is draft — skipping"); return; }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{managerName}}": params.managerName,
    "{{teamTable}}": params.teamTableHtml,
  });
  return sendEmail({ to: params.managerEmail, subject, html, text });
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
<p>Name: ${name} | Email: ${email} | Role: ${roleDisplayName(role)}</p>
<p>© 2026-2027 Miller Storm.</p>
</body></html>`;
  const text = `Hi ${name},\n\nYour registration is pending approval.\nName: ${name}\nEmail: ${email}\nRole: ${roleDisplayName(role)}\n\n© 2026-2027 Miller Storm.`;
  return { html, text };
}

export function generateApprovalEmail(name: string, email: string, role: string, loginUrl: string) {
  const html = `<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;">
<p>Hi ${name},</p>
<p>Your account has been approved!</p>
<p>Email: ${email} | Role: ${roleDisplayName(role)}</p>
<p><a href="${loginUrl}">Login Now</a></p>
<p>© 2026-2027 Miller Storm.</p>
</body></html>`;
  const text = `Hi ${name},\n\nYour account has been approved!\nEmail: ${email}\nRole: ${roleDisplayName(role)}\nLogin: ${loginUrl}\n\n© 2026-2027 Miller Storm.`;
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

// ── Support ticket emails ────────────────────────────────────────────────────

export async function sendSupportTicketCreatedEmail(params: {
  adminName: string;
  adminEmail: string;
  userName: string;
  userEmail: string;
  type: string;
  note: string;
}) {
  const tmpl = await getEmailTemplate("supportTicketCreated");
  if (tmpl.status === "draft") { console.log("[Email] supportTicketCreated is draft — skipping"); return; }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{adminName}}": params.adminName,
    "{{userName}}": params.userName,
    "{{userEmail}}": params.userEmail,
    "{{type}}": params.type,
    "{{note}}": params.note,
  });
  return sendEmail({ to: params.adminEmail, subject, html, text });
}

const TICKET_STATUS_TEMPLATE: Record<string, string> = {
  approved: "ticketApproved",
  in_progress: "ticketInProgress",
  completed: "ticketCompleted",
  rejected: "ticketRejected",
};

export async function sendTicketStatusEmail(params: {
  status: string;
  name: string;
  email: string;
  type: string;
  adminNote?: string;
}) {
  const key = TICKET_STATUS_TEMPLATE[params.status];
  if (!key) return; // no email for "open"
  const tmpl = await getEmailTemplate(key);
  if (tmpl.status === "draft") { console.log(`[Email] ${key} is draft — skipping`); return; }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{name}}": params.name,
    "{{type}}": params.type,
    "{{adminNote}}": params.adminNote || "",
  });
  return sendEmail({ to: params.email, subject, html, text });
}

/**
 * The certificate a rep earned, emailed to them with the PDF attached
 * (2026-08-19). The attachment is the point: Jay asked for something they
 * "can print out and frame".
 *
 * `pdf` may be null when the render failed. The email still goes, without the
 * attachment and without the line promising one, because telling someone they
 * earned a credential is worth more than silence. The caller records that so it
 * can be reissued.
 */
export async function sendCertificateEarnedEmail(params: {
  name: string;
  email: string;
  credential: string;
  courses: string[];
  issuedDate: string;
  credentialId: string;
  pdf: { filename: string; content: Buffer } | null;
}) {
  const tmpl = await getEmailTemplate("certificateEarned");
  if (tmpl.status === "draft") {
    console.log("[Email] certificateEarned is draft, skipping");
    return;
  }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{name}}": params.name,
    "{{credential}}": params.credential,
    "{{courses}}": params.courses.map((c) => `- ${c}`).join("\n"),
    "{{issuedDate}}": params.issuedDate,
    "{{credentialId}}": params.credentialId,
    "{{appUrl}}": process.env.NEXT_PUBLIC_APP_URL || "https://millerstorm.tech",
  });

  // Do not promise an attachment that is not there.
  const body = params.pdf
    ? { html, text }
    : {
        html: html.replace(
          /Your certificate is attached[^<]*/i,
          "Your certificate is being prepared and will follow shortly."
        ),
        text: (text || "").replace(
          /Your certificate is attached.*/i,
          "Your certificate is being prepared and will follow shortly."
        ),
      };

  return sendEmail({
    to: params.email,
    subject,
    html: body.html,
    text: body.text,
    ...(params.pdf ? { attachments: [params.pdf] } : {}),
  });
}
