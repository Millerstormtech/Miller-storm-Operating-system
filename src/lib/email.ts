import { Resend } from "resend";
import { renderTemplate, APP_LINKS, branchAndLead } from "./emailTemplates";
import { getEmailTemplate } from "./emailTemplatesServer";
import { roleDisplayName } from "./roleLabels";
import { formatTicketNumber } from "./support/ticketNumberFormat";

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
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{adminName}}": params.adminName,
    "{{name}}": params.name,
    "{{email}}": params.email,
    "{{role}}": roleDisplayName(params.role),
    "{{reviewUrl}}": `${APP_LINKS.appUrl}/admin/user-management`,
  });
  return sendEmail({ to: params.adminEmail, subject, html, text });
}

export async function sendAccountApprovedEmail(name: string, email: string, role: string) {
  const tmpl = await getEmailTemplate("accountApproved");
  if (tmpl.status === "draft") { console.log("[Email] accountApproved is draft — skipping"); return; }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{name}}": name,
    "{{email}}": email,
    "{{role}}": roleDisplayName(role),
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

// The welcome email carries the rep's login details. `password` is the plaintext
// the admin typed when creating the account (the only moment it exists), or a
// sentence saying where the password comes from when the app never saw it.
export async function sendQuickStartUserEmail(params: {
  name: string;
  email: string;
  role: string;
  password: string;
  branch: string | null;
  salesTeamLead: string | null;
}) {
  const tmpl = await getEmailTemplate("quickStartUser");
  if (tmpl.status === "draft") { console.log("[Email] quickStartUser is draft — skipping"); return; }
  const lines = branchAndLead([params.role], params.branch, params.salesTeamLead);
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{name}}": params.name,
    "{{email}}": params.email,
    "{{role}}": roleDisplayName(params.role),
    "{{password}}": params.password,
    "{{branch}}": lines.branch,
    "{{salesTeamLead}}": lines.salesTeamLead,
  });
  return sendEmail({ to: params.email, subject, html, text });
}

// Tells a Sales Team Lead a new rep joined, with the rep's contact details.
export async function sendQuickStartManagerEmail(params: {
  hireName: string;
  hireEmail: string;
  hirePhone: string | null | undefined;
  managerName: string;
  managerEmail: string;
}) {
  const tmpl = await getEmailTemplate("quickStartManager");
  if (tmpl.status === "draft") { console.log("[Email] quickStartManager is draft — skipping"); return; }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{hireName}}": params.hireName,
    "{{hireEmail}}": params.hireEmail,
    "{{hirePhone}}": (params.hirePhone || "").trim() || "Not on file",
    "{{managerName}}": params.managerName,
  });
  return sendEmail({ to: params.managerEmail, subject, html, text });
}

// The "Send Login Details" email. It never carries a password: the app only
// stores a scrambled copy, and the button works only once changes are saved.
export async function sendUserAccountUpdatedEmail(params: {
  name: string;
  email: string;
  roles: string[];
  branch: string | null;
  salesTeamLead: string | null;
}) {
  const tmpl = await getEmailTemplate("userAccountUpdated");
  // Draft = switched off in Email Config. Report it, so Send Login Details can say
  // "not sent" instead of showing "emailed" for an email that never went out.
  if (tmpl.status === "draft") { console.log("[Email] userAccountUpdated is draft — skipping"); return { skipped: "draft" as const }; }
  const lines = branchAndLead(params.roles, params.branch, params.salesTeamLead);
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{name}}": params.name,
    "{{email}}": params.email,
    // null drops the line from a template saved before the password line was removed.
    "{{password}}": null,
    "{{branch}}": lines.branch,
    "{{role}}": params.roles.map(r => roleDisplayName(r)).join(", "),
    "{{salesTeamLead}}": lines.salesTeamLead,
  });
  return sendEmail({ to: params.email, subject, html, text });
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
  ticketNumber: number;
  // Admins open tickets on the admin page; a ticket-type owner on /tickets.
  recipientIsAdmin: boolean;
}) {
  const tmpl = await getEmailTemplate("supportTicketCreated");
  if (tmpl.status === "draft") { console.log("[Email] supportTicketCreated is draft — skipping"); return; }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{adminName}}": params.adminName,
    "{{userName}}": params.userName,
    "{{userEmail}}": params.userEmail,
    "{{type}}": params.type,
    "{{note}}": params.note,
    "{{ticketNumber}}": formatTicketNumber(params.ticketNumber),
    "{{ticketsUrl}}": params.recipientIsAdmin ? APP_LINKS.adminTicketsUrl : APP_LINKS.ownerTicketsUrl,
  });
  return sendEmail({ to: params.adminEmail, subject, html, text });
}

// No email for a ticket chat message any more (2026-10-28): replies notify by
// app alert and phone notification only. See pages/api/tickets/[id].ts.

const TICKET_STATUS_TEMPLATE: Record<string, string> = {
  in_progress: "ticketInProgress",
  approved: "ticketApproved",
  rejected: "ticketRejected",
  completed: "ticketCompleted",
};

// To the person who raised the ticket, when a handler changes its status.
export async function sendTicketStatusEmail(params: {
  status: string;
  name: string;
  email: string;
  type: string;
  decidedBy?: string;
  adminNote?: string;
  ticketNumber: number;
}) {
  const key = TICKET_STATUS_TEMPLATE[params.status];
  if (!key) return; // no email for "open"
  const tmpl = await getEmailTemplate(key);
  if (tmpl.status === "draft") { console.log(`[Email] ${key} is draft — skipping`); return; }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{name}}": params.name,
    "{{type}}": params.type,
    "{{decidedBy}}": params.decidedBy || "the team",
    // null drops the "Reason:" line when no reason was given.
    "{{adminNote}}": params.adminNote?.trim() ? params.adminNote.trim() : null,
    "{{ticketNumber}}": formatTicketNumber(params.ticketNumber),
  });
  return sendEmail({ to: params.email, subject, html, text });
}

// To everyone who got the new-ticket email, when a Billing or Draw Request
// ticket is Approved, Rejected or Completed, so billing and office always know
// the outcome whoever decided it (Nadine, 2026-10-27).
export async function sendTicketStatusStaffEmail(params: {
  to: string;
  recipientIsAdmin: boolean;
  userName: string;
  type: string;
  status: string;      // the status's display label
  decidedBy: string;
  details?: string;    // "Acculynx Job#: 123, Amount: $4,000"
  adminNote?: string;
  ticketNumber: number;
}) {
  const tmpl = await getEmailTemplate("ticketStatusStaff");
  if (tmpl.status === "draft") { console.log("[Email] ticketStatusStaff is draft — skipping"); return; }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{adminName}}": "Team",
    "{{userName}}": params.userName,
    "{{type}}": params.type,
    "{{status}}": params.status,
    "{{decidedBy}}": params.decidedBy,
    "{{details}}": params.details?.trim() ? params.details.trim() : null,
    "{{adminNote}}": params.adminNote?.trim() ? params.adminNote.trim() : null,
    "{{ticketNumber}}": formatTicketNumber(params.ticketNumber),
    "{{ticketsUrl}}": params.recipientIsAdmin ? APP_LINKS.adminTicketsUrl : APP_LINKS.ownerTicketsUrl,
  });
  return sendEmail({ to: params.to, subject, html, text });
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

/**
 * The Contract King certificate, mailed on the 1st alongside the Storm Chat
 * crowning.
 *
 * Separate from sendCertificateEarnedEmail rather than a variant of it: the two
 * have different variables and an admin editing one in Email Config must not
 * silently reword the other. The missing-PDF fallback is the same rule, and
 * both templates keep the literal phrase "Your certificate is attached" so the
 * one regex below can find and soften it.
 */
export async function sendKingCertificateEmail(params: {
  name: string;
  email: string;
  monthLabel: string;
  /** Already-formatted lines, e.g. ["$412,880 in signed contracts"]. */
  stats: string[];
  issuedDate: string;
  certificateId: string;
  pdf: { filename: string; content: Buffer } | null;
}) {
  const tmpl = await getEmailTemplate("contractKingCertificate");
  if (tmpl.status === "draft") {
    console.log("[Email] contractKingCertificate is draft, skipping");
    return;
  }
  const { html, text, subject } = renderTemplate(tmpl.body, tmpl.subject, {
    "{{name}}": params.name,
    "{{monthLabel}}": params.monthLabel,
    "{{stats}}": params.stats.map((s) => `- ${s}`).join("\n"),
    "{{issuedDate}}": params.issuedDate,
    "{{certificateId}}": params.certificateId,
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
