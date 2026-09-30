// Browser-safe: no mongoose imports here

// Links every template can use, filled in on every email by renderTemplate, so
// a template never hardcodes a URL and a changed link is fixed in one place.
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://millerstorm.tech").replace(/\/$/, "");

// One web link, not two: the home page only forwards to /login, and /login
// forwards a signed-in user to their dashboard, so both end in the same place.
export const APP_LINKS = {
  appUrl: APP_URL,
  // The US store. The old /in/ link opened Apple's India store.
  iosAppUrl: "https://apps.apple.com/us/app/millerstorm/id6771883296",
  // Matches applicationId in Jamesapk/android/app/build.gradle.
  androidAppUrl: "https://play.google.com/store/apps/details?id=com.millerstorm.millerstorm_app",
};

export const GLOBAL_VARIABLES = ["{{appUrl}}", "{{iosAppUrl}}", "{{androidAppUrl}}"];

// Fields whose value is already HTML (built by the sender) and must not be escaped.
const RAW_HTML_FIELDS = new Set(["{{teamTable}}"]);

const COPYRIGHT = "© 2026-2027 Miller Storm. All Rights Reserved.";

// The one sign-off every template ends with.
const SIGN_OFF = `Best regards,
MillerStorm.tech Team`;

// `variables` lists the fields this template's sender fills in. GLOBAL_VARIABLES
// are available to every template on top of these.
export const EMAIL_DEFAULTS: Record<string, { subject: string; body: string; variables: string[] }> = {
  certificateEarned: {
    subject: "You earned your {{credential}}",
    body: `Hi {{name}},

You have earned your {{credential}}.

Your certificate is attached to this email as a PDF. Print it, frame it, put it on the wall. You earned it.

What you completed:
{{courses}}

Issued: {{issuedDate}}
Certificate number: {{credentialId}}

Congratulations from everyone at Miller Storm.

{{appUrl}}

${SIGN_OFF}`,
    variables: ["{{name}}", "{{credential}}", "{{courses}}", "{{issuedDate}}", "{{credentialId}}"],
  },
  contractKingCertificate: {
    subject: "You are the {{monthLabel}} Contract King",
    body: `Hi {{name}},

You finished {{monthLabel}} at the top of the Miller Storm sales leaderboard. That makes you the Contract King for the month.

{{monthLabel}} by the numbers:
{{stats}}

Your certificate is attached to this email as a PDF. Print it, frame it, put it on the wall. You earned it.

Issued: {{issuedDate}}
Certificate number: {{certificateId}}

Congratulations from everyone at Miller Storm.

{{appUrl}}

${SIGN_OFF}`,
    variables: ["{{name}}", "{{monthLabel}}", "{{stats}}", "{{issuedDate}}", "{{certificateId}}"],
  },
  passwordReset: {
    subject: "Reset Your Password - Miller Storm OS",
    body: `Hi {{name}},

We received a request to reset your password for your Miller Storm OS account.

Click the link below to reset your password:
{{resetLink}}

This link will expire in 1 hour for security reasons.

If you didn't request a password reset, you can safely ignore this email.

${SIGN_OFF}`,
    variables: ["{{name}}", "{{resetLink}}"],
  },
  registrationConfirmation: {
    subject: "Registration Request Received - Miller Storm OS",
    body: `Hi {{name}},

Thank you for registering for **Miller Storm OS**.

We've received your account request and it's currently awaiting approval.

**Registration Details**

* Name: {{name}}
* Email: {{email}}
* Requested Role: {{role}}

Our admin team will review your request within **24–48 hours**.

Once your account has been approved, you'll receive another email with instructions on how to access the Miller Storm OS web app and mobile app.

Thank you for your patience, and we look forward to welcoming you to the Miller Storm team.

${SIGN_OFF}`,
    variables: ["{{name}}", "{{email}}", "{{role}}"],
  },
  accountApproved: {
    subject: "Account Approved - Miller Storm OS",
    body: `Hi {{name}},

Good news: your registration has been approved, and your {{role}} account is ready.

Sign in with the email and password you chose when you registered:
* Email: {{email}}

Use the same login on the web or on your phone:
* Web App: {{appUrl}}
* iPhone App: {{iosAppUrl}}
* Android App: {{androidAppUrl}}

If you forget your password, click "Forgot Password" on the login page and follow the steps.

Welcome to Miller Storm OS!

${SIGN_OFF}`,
    variables: ["{{name}}", "{{email}}", "{{role}}"],
  },
  accountRejected: {
    subject: "Registration Request Update - Miller Storm OS",
    body: `Hi {{name}},

Thank you for your interest in joining **Miller Storm OS**.

After reviewing your registration request, we are unable to approve your account at this time.

Reason for the decision:
{{reason}}

If you believe this decision was made in error or you have any questions, please contact your administrator for further assistance.

Thank you for your interest in Miller Storm, and we appreciate your understanding.

${SIGN_OFF}`,
    variables: ["{{name}}", "{{reason}}"],
  },
  quickStartUser: {
    subject: "Welcome to Miller Storm - Quick Start",
    body: `Hi {{name}},

Welcome to Miller Storm! We're excited to have you on the team.

Your goal for the first 48 hours is simple: **Start your training and get into the field as soon as possible!**

To get started, sign in to **Miller Storm OS** on the web or on your phone:

* Web App: {{appUrl}}
* iPhone App: {{iosAppUrl}}
* Android App: {{androidAppUrl}}

Here are your account details:
* Name: {{name}}
* Email: {{email}}
* Password: {{password}}
* Role: {{role}}

If you forget your password, click "Forgot Password" on the login page and follow the steps to set a new one.

Inside the app, you'll find your **Quick Start Success Path**, which will guide you through everything you need to begin.

Welcome aboard, and we're looking forward to your success!

${SIGN_OFF}`,
    variables: ["{{name}}", "{{email}}", "{{password}}", "{{role}}"],
  },
  quickStartManager: {
    subject: "New Sales Rep Joined Your Team - Miller Storm OS",
    body: `Hi {{managerName}},

A new sales representative has joined your team: {{hireName}}.

Their goal for the first 48 hours is simple: **Start the training and get into the field.**

Please connect with **{{hireName}}** as soon as possible to:

* Coordinate their ride-along.
* Ensure they complete their onboarding and training.
* Help them get into the field quickly and successfully.

Thank you for supporting your new team member's success.

${SIGN_OFF}`,
    variables: ["{{managerName}}", "{{hireName}}"],
  },
  userAccountUpdated: {
    subject: "Your Account Details - Miller Storm OS",
    body: `Hi {{name}},

Here are your account details:

* Name: {{name}}
* Email: {{email}}
* Password: {{password}}
* Role: {{role}}

Use the same login on the web or on your phone:
* Web App: {{appUrl}}
* iPhone App: {{iosAppUrl}}
* Android App: {{androidAppUrl}}

If you do not remember your password and would like to change it, click "Forgot Password" on the login page and follow the steps.

If you have any questions, please submit a support ticket.

${SIGN_OFF}`,
    variables: ["{{name}}", "{{email}}", "{{password}}", "{{branch}}", "{{role}}", "{{managerName}}"],
  },
  weeklyTeamDigest: {
    subject: "Weekly Team Training Digest - Miller Storm OS",
    body: `Hi {{managerName}},

Here is your team's **weekly training progress report**, organized by assigned playlist.

{{teamTable}}

Please review the progress and follow up with any team members who are behind on their assigned training to help keep everyone on track.

You can view additional details and manage your team's progress in **Miller Storm OS**: {{appUrl}}

Thank you for helping your team succeed.

${SIGN_OFF}`,
    variables: ["{{managerName}}", "{{teamTable}}"],
  },
  managerDeadlineMissed: {
    subject: "Training Deadline Missed - {{userName}}",
    body: `Hi {{managerName}},

A member of your team has missed a training deadline.

**Training Details**

* Team Member: {{userName}}
* Assigned Playlist: {{playlistName}}
* Deadline: {{deadline}}
* Progress: {{completedModules}} of {{totalModules}} modules completed

{{userName}} did not complete the required training, including watching the assigned videos and passing the quizzes, before the deadline.

Please follow up with them as soon as possible in **Miller Storm OS** to help them complete their training and get back on track: {{appUrl}}

Thank you for supporting your team's success.

${SIGN_OFF}`,
    variables: ["{{managerName}}", "{{userName}}", "{{playlistName}}", "{{deadline}}", "{{completedModules}}", "{{totalModules}}"],
  },
  adminConfirmation: {
    subject: "User Account Updated - {{userName}}",
    body: `Hi {{adminName}},

You have successfully updated the following user account:

* Name: {{userName}}
* Email: {{userEmail}}
* Role: {{role}}
* Manager: {{managerName}}
* Password: {{passwordChanged}}
* Updated At: {{updatedAt}}

This is an automated confirmation of the changes you made.

${SIGN_OFF}`,
    variables: ["{{adminName}}", "{{userName}}", "{{userEmail}}", "{{role}}", "{{managerName}}", "{{passwordChanged}}", "{{updatedAt}}"],
  },
  newRegistrationAdmin: {
    subject: "New registration request awaiting your review",
    body: `Hi {{adminName}},

A new registration request has been submitted to Miller Storm OS and is waiting for your review.

Registration Details:
* Name: {{name}}
* Email: {{email}}
* Requested Role: {{role}}

Review and approve or reject this request here:
{{reviewUrl}}

${SIGN_OFF}`,
    variables: ["{{adminName}}", "{{name}}", "{{email}}", "{{role}}", "{{reviewUrl}}"],
  },
  supportTicketCreated: {
    subject: "New Support Ticket {{ticketNumber}} — {{type}}",
    body: `Hi {{adminName}},

A new support ticket has been submitted and is ready for your review.

**Ticket Details**

* Ticket: {{ticketNumber}}
* Submitted By: {{userName}}
* Email: {{userEmail}}
* Ticket Type: {{type}}
* Description: {{note}}

Please review the ticket and take the appropriate action in the **Admin Portal → Tickets** at your earliest convenience.

Thank you for helping keep the Miller Storm platform running smoothly.

${SIGN_OFF}`,
    variables: ["{{adminName}}", "{{userName}}", "{{userEmail}}", "{{type}}", "{{note}}", "{{ticketNumber}}"],
  },
  ticketReply: {
    subject: "New reply on ticket {{ticketNumber}} — {{type}}",
    body: `{{intro}}

* Ticket: {{ticketNumber}}
* Ticket type: {{type}}
* From: {{senderName}}

Message:
{{message}}

Open the app to view the full conversation and reply.

${SIGN_OFF}`,
    variables: ["{{intro}}", "{{type}}", "{{senderName}}", "{{message}}", "{{ticketNumber}}"],
  },
  ticketInProgress: {
    subject: "Your ticket {{ticketNumber}} is now in progress 🔧",
    body: `Hi {{name}},

Your {{type}} ticket ({{ticketNumber}}) is now in progress. Our team is actively working on it and we'll let you know as soon as it's done.

Thank you for your patience.

${SIGN_OFF}`,
    variables: ["{{name}}", "{{type}}", "{{ticketNumber}}"],
  },
  ticketCompleted: {
    subject: "Your ticket {{ticketNumber}} has been completed 🎉",
    body: `Hi {{name}},

Your {{type}} ticket ({{ticketNumber}}) has been completed. If anything still isn't right, reply to the ticket in the app and we'll pick it back up.

${SIGN_OFF}`,
    variables: ["{{name}}", "{{type}}", "{{ticketNumber}}"],
  },
};

/** The fields a template may use: its own plus the shared links. */
export function allowedVariables(key: string): string[] {
  return [...(EMAIL_DEFAULTS[key]?.variables || []), ...GLOBAL_VARIABLES];
}

/** Placeholders in a subject/body that the template's sender never fills in. */
export function unknownVariables(key: string, subject: string, body: string): string[] {
  const allowed = new Set(allowedVariables(key));
  const used = `${subject}\n${body}`.match(/\{\{\s*\w+\s*\}\}/g) || [];
  return [...new Set(used)].filter((v) => !allowed.has(v));
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// One pass over the text, so a value that itself contains "{{x}}" is never
// substituted a second time. Placeholders with no value are left as written.
function fill(src: string, vars: Record<string, string>, transform: (key: string, val: string) => string): string {
  return src.replace(/\{\{\w+\}\}/g, (key) => (key in vars ? transform(key, vars[key] || "N/A") : key));
}

// Lines that start with "* " or "- " are bullets.
const BULLET = /^\s*[*-]\s+/;

export function renderTemplate(body: string, subject: string, vars: Record<string, string>): { html: string; text: string; subject: string } {
  const all: Record<string, string> = {
    "{{appUrl}}": APP_LINKS.appUrl,
    // Old name for the same link. Not offered in Email Config any more; it is
    // still filled so templates saved before 2026-09-30 keep working until
    // they are updated.
    "{{loginUrl}}": APP_LINKS.appUrl,
    "{{iosAppUrl}}": APP_LINKS.iosAppUrl,
    "{{androidAppUrl}}": APP_LINKS.androidAppUrl,
    ...vars,
  };

  const renderedSubject = fill(subject, all, (_k, v) => v).replace(/\*\*/g, "");

  // Plain-text part: bold markers dropped, bullets as "- ", HTML values stripped.
  const text = fill(body, all, (k, v) => (RAW_HTML_FIELDS.has(k) ? v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : v))
    .split("\n")
    .map((line) => line.replace(/\*\*(.+?)\*\*/g, "$1").replace(BULLET, "- "))
    .join("\n") + `\n\n${COPYRIGHT}`;

  // HTML part: the template and every value are escaped (a ticket note is typed
  // by a user and must not be able to inject links or markup), then **bold** and
  // bullets are turned into markup.
  const htmlBody = fill(escapeHtml(body), all, (k, v) => (RAW_HTML_FIELDS.has(k) ? v : escapeHtml(v)))
    .split("\n")
    .map((line) => {
      if (!line.trim()) return "<br/>";
      const bullet = BULLET.test(line);
      const content = line.replace(BULLET, "").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      return `<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">${bullet ? "&bull;&nbsp;" : ""}${content}</p>`;
    })
    .join("");

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f3f4f6;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
<tr><td style="padding:40px 40px 20px;text-align:center;">
  <h1 style="margin:0;color:#111827;font-size:24px;font-weight:600;">Miller Storm OS</h1>
</td></tr>
<tr><td style="padding:20px 40px 40px;">
  ${htmlBody}
</td></tr>
<tr><td style="padding:20px 40px 40px;border-top:1px solid #e5e7eb;">
  <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">${COPYRIGHT}</p>
</td></tr>
</table></td></tr></table></body></html>`;

  return { html, text, subject: renderedSubject };
}
