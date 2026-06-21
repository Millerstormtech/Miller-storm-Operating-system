// Browser-safe: no mongoose imports here
export const EMAIL_DEFAULTS: Record<string, { subject: string; body: string; variables: string[] }> = {
  passwordReset: {
    subject: "Reset Your Password - Miller Storm OS",
    body: `Hi {{name}},

We received a request to reset your password for your Miller Storm OS account.

Click the link below to reset your password:
{{resetLink}}

This link will expire in 1 hour for security reasons.

If you didn't request a password reset, you can safely ignore this email.

© 2026-2027 Miller Storm. All Rights Reserved.`,
    variables: ["{{name}}", "{{resetLink}}"],
  },
  registrationConfirmation: {
    subject: "Registration Request Received - Miller Storm OS",
    body: `Hi {{name}},

Thank you for requesting access to the Miller Storm Operating System.

Registration Details:
- Name: {{name}}
- Email: {{email}}
- Requested Role: {{role}}

Your request is currently pending approval. Our admin team will review it within 24 to 48 hours.

You will receive another email once your account has been approved.

© 2026-2027 Miller Storm. All Rights Reserved.`,
    variables: ["{{name}}", "{{email}}", "{{role}}"],
  },
  accountApproved: {
    subject: "Account Approved - Miller Storm OS",
    body: `Hi {{name}},

Great news! Your registration request has been approved.

Your Login Credentials:
- Email: {{email}}
- Role: {{role}}
- Password: The password you set during registration

Login here: {{loginUrl}}

Welcome to Miller Storm OS!

© 2026-2027 Miller Storm. All Rights Reserved.`,
    variables: ["{{name}}", "{{email}}", "{{role}}", "{{loginUrl}}"],
  },
  accountRejected: {
    subject: "Registration Request Update - Miller Storm OS",
    body: `Hi {{name}},

Thank you for your interest in the Miller Storm Operating System.

After careful review, we are unable to approve your registration request at this time.

Reason: {{reason}}

If you have any questions, please contact your administrator.

© 2026-2027 Miller Storm. All Rights Reserved.`,
    variables: ["{{name}}", "{{reason}}"],
  },
  quickStartUser: {
    subject: "Welcome to Miller Storm - Quick Start",
    body: `Hi {{name}},

Welcome to Miller Storm.

Your goal in the first 48 hours is simple: Complete training and get into the field.

Your Quick Start Success Path is available inside the Miller Storm Operating System.

Your manager has also received this plan so you can coordinate your ride-along.

© 2026-2027 Miller Storm. All Rights Reserved.`,
    variables: ["{{name}}"],
  },
  quickStartManager: {
    subject: "New Sales Rep Joined Your Team - Miller Storm OS",
    body: `Hi {{managerName}},

A new sales rep has joined your team: {{hireName}}.

Their goal in the first 48 hours is simple: Complete training and get into the field.

Their 48-Hour Quick Start Success Path is available inside the Miller Storm Operating System.

Please coordinate their ride-along as soon as possible.

© 2026-2027 Miller Storm. All Rights Reserved.`,
    variables: ["{{managerName}}", "{{hireName}}"],
  },
  userAccountUpdated: {
    subject: "Your Account Details - Miller Storm OS",
    body: `Hi {{name}},

Your account has been updated by an administrator. Here are your current login details:

- Name: {{name}}
- Email: {{email}}
- Password: {{password}}
- Role: {{role}}
- Manager: {{managerName}}

Login here: {{loginUrl}}

If you have any questions, please contact your administrator.

© 2026-2027 Miller Storm. All Rights Reserved.`,
    variables: ["{{name}}", "{{email}}", "{{password}}", "{{role}}", "{{managerName}}", "{{loginUrl}}"],
  },
  adminConfirmation: {
    subject: "User Account Updated - {{userName}}",
    body: `Hi {{adminName}},

You have successfully updated the following user account:

- Name: {{userName}}
- Email: {{userEmail}}
- Role: {{role}}
- Manager: {{managerName}}
- Password: {{passwordChanged}}
- Updated At: {{updatedAt}}

This is an automated confirmation of the changes you made.

© 2026-2027 Miller Storm. All Rights Reserved.`,
    variables: ["{{adminName}}", "{{userName}}", "{{userEmail}}", "{{role}}", "{{managerName}}", "{{passwordChanged}}", "{{updatedAt}}"],
  },
};

export function renderTemplate(body: string, subject: string, vars: Record<string, string>): { html: string; text: string; subject: string } {
  let renderedBody = body;
  let renderedSubject = subject;
  Object.entries(vars).forEach(([key, val]) => {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    renderedBody = renderedBody.replace(new RegExp(escaped, "g"), val || "N/A");
    renderedSubject = renderedSubject.replace(new RegExp(escaped, "g"), val || "N/A");
  });

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f3f4f6;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:40px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;box-shadow:0 2px 4px rgba(0,0,0,0.1);">
<tr><td style="padding:40px 40px 20px;text-align:center;">
  <h1 style="margin:0;color:#111827;font-size:24px;font-weight:600;">Miller Storm Operating System</h1>
</td></tr>
<tr><td style="padding:20px 40px 40px;">
  ${renderedBody.split("\n").map(line => line.trim() ? `<p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.6;">${line}</p>` : "<br/>").join("")}
</td></tr>
<tr><td style="padding:20px 40px 40px;border-top:1px solid #e5e7eb;">
  <p style="margin:0;color:#9ca3af;font-size:12px;text-align:center;">© 2026-2027 Miller Storm. All Rights Reserved.</p>
</td></tr>
</table></td></tr></table></body></html>`;

  return { html, text: renderedBody, subject: renderedSubject };
}
