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
  // Ticket inboxes. Admins use the admin page; a ticket-type owner uses /tickets.
  // The person who raised a ticket has no page: they use the header's Support button.
  adminTicketsUrl: `${APP_URL}/admin/tickets`,
  ownerTicketsUrl: `${APP_URL}/tickets`,
};

export const GLOBAL_VARIABLES = ["{{appUrl}}", "{{iosAppUrl}}", "{{androidAppUrl}}"];

// Where the web app's Support button is, for emails that send a rep to it.
export const SUPPORT_BUTTON_HINT = "click Support at the top right of the screen, next to your name";

// Fields whose value is already HTML (built by the sender) and must not be escaped.
const RAW_HTML_FIELDS = new Set(["{{teamTable}}"]);

// A first-name field is derived from each of these full-name fields, so an
// email can open "Hi Jane" and still list "Jane Rivera" further down.
const FIRST_NAME_OF: Record<string, string> = {
  "{{name}}": "{{firstName}}",
  "{{managerName}}": "{{managerFirstName}}",
  "{{adminName}}": "{{adminFirstName}}",
};

const COPYRIGHT = "© 2026-2027 Miller Storm. All Rights Reserved.";

// The one sign-off every template ends with.
const SIGN_OFF = `Best regards,
The Miller Storm Team`;

// `variables` lists the fields this template's sender fills in. GLOBAL_VARIABLES
// are available to every template on top of these.
export const EMAIL_DEFAULTS: Record<string, { subject: string; body: string; variables: string[] }> = {
  certificateEarned: {
    subject: "You earned your {{credential}}",
    body: `Hi {{firstName}},

You have earned your {{credential}}.

Your certificate is attached to this email as a PDF. Print it, frame it, put it on the wall. You earned it.

What you completed:
{{courses}}

Issued: {{issuedDate}}
Certificate number: {{credentialId}}

Congratulations from everyone at Miller Storm.

Open Miller Storm: {{appUrl}}

${SIGN_OFF}`,
    variables: ["{{name}}", "{{firstName}}", "{{credential}}", "{{courses}}", "{{issuedDate}}", "{{credentialId}}"],
  },
  contractKingCertificate: {
    subject: "You are the {{monthLabel}} Contract King",
    body: `Hi {{firstName}},

You finished {{monthLabel}} at the top of the Miller Storm sales leaderboard. That makes you the Contract King for the month.

{{monthLabel}} by the numbers:
{{stats}}

Your certificate is attached to this email as a PDF. Print it, frame it, put it on the wall. You earned it.

Issued: {{issuedDate}}
Certificate number: {{certificateId}}

Congratulations from everyone at Miller Storm.

Open Miller Storm: {{appUrl}}

${SIGN_OFF}`,
    variables: ["{{name}}", "{{firstName}}", "{{monthLabel}}", "{{stats}}", "{{issuedDate}}", "{{certificateId}}"],
  },
  passwordReset: {
    subject: "Reset Your Password - Miller Storm",
    body: `Hi {{firstName}},

We received a request to reset your password for your Miller Storm account.

Click the link below to reset your password:
{{resetLink}}

This link will expire in 1 hour for security reasons.

If you didn't request a password reset, you can safely ignore this email.

${SIGN_OFF}`,
    variables: ["{{name}}", "{{firstName}}", "{{resetLink}}"],
  },
  registrationConfirmation: {
    subject: "Registration Request Received - Miller Storm",
    body: `Hi {{firstName}},

Thank you for registering for Miller Storm.

We've received your account request and it's currently awaiting approval.

**Registration Details**

* Name: {{name}}
* Email: {{email}}
* Requested Role: {{role}}

Our admin team will review your request and email you once it's done, with instructions for signing in on the web and on your phone.

${SIGN_OFF}`,
    variables: ["{{name}}", "{{firstName}}", "{{email}}", "{{role}}"],
  },
  accountApproved: {
    subject: "Account Approved - Miller Storm",
    body: `Hi {{firstName}},

Good news! Your registration has been approved, and your {{role}} account is ready.

Sign in with the email and password you chose when you registered:
* Email: {{email}}

Use the same login on the web or on your phone:
* Web App: {{appUrl}}
* iPhone App: {{iosAppUrl}}
* Android App: {{androidAppUrl}}

If you forget your password, click "Forgot Password" on the login page and follow the steps.

Welcome to Miller Storm!

${SIGN_OFF}`,
    variables: ["{{name}}", "{{firstName}}", "{{email}}", "{{role}}"],
  },
  accountRejected: {
    subject: "Registration Request Update - Miller Storm",
    body: `Hi {{firstName}},

Thank you for your interest in joining Miller Storm.

After reviewing your registration request, we are unable to approve your account at this time.

Reason for the decision:
{{reason}}

If you think this is a mistake or have any questions, email tech@millerstorm.com.

${SIGN_OFF}`,
    variables: ["{{name}}", "{{firstName}}", "{{reason}}"],
  },
  quickStartUser: {
    subject: "Welcome to Miller Storm!",
    body: `Hi {{firstName}},

Welcome to Miller Storm! We're excited to have you on the team.

Here are your login details:
* Name: {{name}}
* Email: {{email}}
* Password: {{password}}
* Role: {{role}}
* Branch: {{branch}}
* Sales Team Lead: {{salesTeamLead}}

Here are your next steps:

**1. Sign in on your computer**
Go to {{appUrl}} and sign in with the email and password above.

**2. Add a profile photo**
In the menu, open Profile and click "Upload a new photo". This photo shows next to your name on the leaderboard.

**3. Start your training**
Open the Training Center and start your first course.

**4. Get the app on your phone**
Install the Miller Storm app and sign in with the same email and password, so you can train, check the leaderboard and message your team from the field.
* iPhone: {{iosAppUrl}}
* Android: {{androidAppUrl}}

If you forget your password, click "Forgot Password" on the login page and follow the steps to set a new one.

${SIGN_OFF}`,
    variables: ["{{name}}", "{{firstName}}", "{{email}}", "{{password}}", "{{role}}", "{{branch}}", "{{salesTeamLead}}"],
  },
  quickStartManager: {
    subject: "New Sales Rep Joined Your Team - Miller Storm",
    body: `Hi {{managerFirstName}},

A new sales rep has joined your team: {{hireName}}.
* Email: {{hireEmail}}
* Phone: {{hirePhone}}

${SIGN_OFF}`,
    variables: ["{{managerName}}", "{{managerFirstName}}", "{{hireName}}", "{{hireEmail}}", "{{hirePhone}}"],
  },
  userAccountUpdated: {
    subject: "Your Account Details - Miller Storm",
    body: `Hi {{firstName}},

Here are your account details:
* Name: {{name}}
* Email: {{email}}
* Role: {{role}}
* Branch: {{branch}}
* Sales Team Lead: {{salesTeamLead}}

If you do not remember your password and would like to change it, click "Forgot Password" on the login page and follow the steps.

If you have any questions, please submit a support ticket: open Miller Storm ({{appUrl}}) and ${SUPPORT_BUTTON_HINT}.

${SIGN_OFF}`,
    variables: ["{{name}}", "{{firstName}}", "{{email}}", "{{role}}", "{{branch}}", "{{salesTeamLead}}"],
  },
  weeklyTeamDigest: {
    subject: "Weekly Team Training Digest - Miller Storm",
    body: `Hi {{managerFirstName}},

Here is your team's weekly training progress report, organized by assigned playlist.

{{teamTable}}

Please review the progress and follow up with any team members who are behind on their assigned training.

You can see more details and manage your team's progress in Miller Storm: {{appUrl}}

${SIGN_OFF}`,
    variables: ["{{managerName}}", "{{managerFirstName}}", "{{teamTable}}"],
  },
  managerDeadlineMissed: {
    subject: "Training Deadline Missed - {{userName}}",
    body: `Hi {{managerFirstName}},

A member of your team has missed a training deadline.

**Training Details**

* Team Member: {{userName}}
* Assigned Playlist: {{playlistName}}
* Deadline: {{deadline}}
* Progress: {{completedModules}} of {{totalModules}} videos completed

{{userName}} did not complete the required training, including watching the assigned videos and passing the quizzes, before the deadline.

Please follow up with them in Miller Storm: {{appUrl}}

${SIGN_OFF}`,
    variables: ["{{managerName}}", "{{managerFirstName}}", "{{userName}}", "{{playlistName}}", "{{deadline}}", "{{completedModules}}", "{{totalModules}}"],
  },
  newRegistrationAdmin: {
    subject: "New registration request awaiting your review",
    body: `Hi {{adminFirstName}},

A new registration request has been submitted to Miller Storm and is waiting for your review.

Registration Details:
* Name: {{name}}
* Email: {{email}}
* Requested Role: {{role}}

Review and approve or reject this request here:
{{reviewUrl}}

${SIGN_OFF}`,
    variables: ["{{adminName}}", "{{adminFirstName}}", "{{name}}", "{{email}}", "{{role}}", "{{reviewUrl}}"],
  },
  supportTicketCreated: {
    subject: "New Support Ticket {{ticketNumber}} — {{type}}",
    body: `Hi {{adminFirstName}},

A new support ticket has been submitted and is ready for your review.

**Ticket Details**

* Ticket: {{ticketNumber}}
* Submitted By: {{userName}}
* Email: {{userEmail}}
* Ticket Type: {{type}}
* Description: {{note}}

Open it here: {{ticketsUrl}}

${SIGN_OFF}`,
    variables: ["{{adminName}}", "{{adminFirstName}}", "{{userName}}", "{{userEmail}}", "{{type}}", "{{note}}", "{{ticketNumber}}", "{{ticketsUrl}}"],
  },
  ticketReply: {
    subject: "New reply on ticket {{ticketNumber}} — {{type}}",
    body: `{{intro}}

* Ticket: {{ticketNumber}}
* Ticket type: {{type}}
* From: {{senderName}}

Message:
{{message}}

{{howToReply}}

${SIGN_OFF}`,
    variables: ["{{intro}}", "{{type}}", "{{senderName}}", "{{message}}", "{{ticketNumber}}", "{{howToReply}}"],
  },
  ticketInProgress: {
    subject: "Your ticket {{ticketNumber}} is now in progress 🔧",
    body: `Hi {{firstName}},

Your {{type}} ticket ({{ticketNumber}}) is now in progress. Our team is actively working on it and we'll let you know as soon as it's done.

To see your ticket, open Miller Storm ({{appUrl}}) and ${SUPPORT_BUTTON_HINT}.

${SIGN_OFF}`,
    variables: ["{{name}}", "{{firstName}}", "{{type}}", "{{ticketNumber}}"],
  },
  ticketCompleted: {
    subject: "Your ticket {{ticketNumber}} has been completed 🎉",
    body: `Hi {{firstName}},

Your {{type}} ticket ({{ticketNumber}}) has been completed. If anything still isn't right, reply to the ticket in the app and we'll pick it back up.

To see your ticket, open Miller Storm ({{appUrl}}) and ${SUPPORT_BUTTON_HINT}.

${SIGN_OFF}`,
    variables: ["{{name}}", "{{firstName}}", "{{type}}", "{{ticketNumber}}"],
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

/** "Jane Rivera" → "Jane". Falls back to "there" ("Hi there") when there is no real name. */
export function firstNameOf(fullName: string | null | undefined): string {
  const name = (fullName || "").trim();
  if (!name || name.includes("@")) return "there";
  return name.split(/\s+/)[0];
}

const BRANCH_ROLES = ["sales", "sales-team-lead", "branch-manager"];
const NOT_ASSIGNED = "Not assigned yet";

/**
 * The Branch and Sales Team Lead lines of a person's details, by role. null
 * means the line does not apply to this person and is left out of the email:
 * only a sales rep has a Sales Team Lead, and C-level, admin and marketing
 * accounts do not belong to a branch (the line still shows if one is set).
 */
export function branchAndLead(
  roles: string[],
  branch: string | null | undefined,
  salesTeamLead: string | null | undefined
): { branch: string | null; salesTeamLead: string | null } {
  const has = (r: string) => roles.includes(r);
  const b = (branch || "").trim();
  const lead = (salesTeamLead || "").trim();
  return {
    branch: b || (BRANCH_ROLES.some(has) ? NOT_ASSIGNED : null),
    salesTeamLead: has("sales") ? lead || NOT_ASSIGNED : null,
  };
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

/**
 * Builds the email. A field given as null does not apply to this recipient, so
 * every line that uses it is dropped (an admin's details have no "Sales Team
 * Lead" line). A field given as "" still shows, as "N/A".
 */
export function renderTemplate(
  body: string,
  subject: string,
  vars: Record<string, string | null>
): { html: string; text: string; subject: string } {
  const all: Record<string, string> = {
    "{{appUrl}}": APP_LINKS.appUrl,
    // Old name for the same link. Not offered in Email Config any more; it is
    // still filled so templates saved before 2026-09-30 keep working until
    // they are updated.
    "{{loginUrl}}": APP_LINKS.appUrl,
    "{{iosAppUrl}}": APP_LINKS.iosAppUrl,
    "{{androidAppUrl}}": APP_LINKS.androidAppUrl,
  };
  const skipped = new Set<string>();
  for (const [key, val] of Object.entries(vars)) {
    if (val === null) skipped.add(key);
    else all[key] = val;
  }
  for (const [full, first] of Object.entries(FIRST_NAME_OF)) {
    if (full in all && !(first in vars)) all[first] = firstNameOf(all[full]);
  }

  const kept = body
    .split("\n")
    .filter((line) => !(line.match(/\{\{\w+\}\}/g) || []).some((k) => skipped.has(k)))
    .join("\n");

  const renderedSubject = fill(subject, all, (_k, v) => v).replace(/\*\*/g, "");

  // Plain-text part: bold markers dropped, bullets as "- ", HTML values stripped.
  const text = fill(kept, all, (k, v) => (RAW_HTML_FIELDS.has(k) ? v.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim() : v))
    .split("\n")
    .map((line) => line.replace(/\*\*(.+?)\*\*/g, "$1").replace(BULLET, "- "))
    .join("\n") + `\n\n${COPYRIGHT}`;

  // HTML part: the template and every value are escaped (a ticket note is typed
  // by a user and must not be able to inject links or markup), then **bold** and
  // bullets are turned into markup.
  const htmlBody = fill(escapeHtml(kept), all, (k, v) => (RAW_HTML_FIELDS.has(k) ? v : escapeHtml(v)))
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
  <h1 style="margin:0;color:#111827;font-size:24px;font-weight:600;">Miller Storm</h1>
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
