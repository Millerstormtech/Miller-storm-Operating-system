import { describe, it, expect } from "vitest";
import { EMAIL_DEFAULTS, GLOBAL_VARIABLES, APP_LINKS, renderTemplate, unknownVariables, firstNameOf, branchAndLead } from "./emailTemplates";

const COPYRIGHT = "© 2026-2027 Miller Storm. All Rights Reserved.";
const keys = Object.keys(EMAIL_DEFAULTS);

describe("built-in email templates", () => {
  it.each(keys)("%s only uses fields its email fills in", (key) => {
    // A field outside this list reaches the inbox as raw "{{password}}" text,
    // which is exactly what the Quick Start welcome email did in Sep 2026.
    const t = EMAIL_DEFAULTS[key];
    expect(unknownVariables(key, t.subject, t.body)).toEqual([]);
  });

  it.each(keys)("%s leaves the copyright line to the email builder", (key) => {
    const body = EMAIL_DEFAULTS[key].body;
    expect(body).not.toContain("©");
    expect(body).not.toMatch(/\(c\) 20/);
  });

  it.each(keys)("%s ends with the shared sign-off", (key) => {
    expect(EMAIL_DEFAULTS[key].body.trimEnd()).toMatch(/Best regards,\nThe Miller Storm Team$/);
  });

  it.each(keys)("%s calls the app Miller Storm, not Miller Storm OS or MillerStorm.tech", (key) => {
    const t = EMAIL_DEFAULTS[key];
    expect(`${t.subject}\n${t.body}`).not.toMatch(/Miller Storm OS|Operating System|MillerStorm\.tech/);
  });

  it.each(keys)("%s greets by first name, if it greets at all", (key) => {
    const first = EMAIL_DEFAULTS[key].body.split("\n")[0];
    if (first.startsWith("Hi ")) expect(first).toMatch(/^Hi \{\{(firstName|managerFirstName|adminFirstName)\}\},$/);
  });

  it.each(keys)("%s hardcodes no app link", (key) => {
    // Links come from {{appUrl}}, {{iosAppUrl}} etc. so they are fixed in one place.
    expect(EMAIL_DEFAULTS[key].body).not.toMatch(/apps\.apple\.com|play\.google\.com|https?:\/\/millerstorm\.tech/);
  });

  it("the welcome email carries the login details it lists", () => {
    const t = EMAIL_DEFAULTS.quickStartUser;
    const { html, text, subject } = renderTemplate(t.body, t.subject, {
      "{{name}}": "Jane Rivera",
      "{{email}}": "jane@example.com",
      "{{password}}": "Storm123",
      "{{role}}": "Sales Rep",
      "{{branch}}": "Austin",
      "{{salesTeamLead}}": "Daniel Reyes",
    });
    expect(subject).toBe("Welcome to Miller Storm!");
    expect(html).not.toMatch(/\{\{\w+\}\}/);
    expect(text.startsWith("Hi Jane,")).toBe(true);
    expect(text).toContain("- Name: Jane Rivera");
    expect(text).toContain("- Password: Storm123");
    expect(text).toContain("- Sales Team Lead: Daniel Reyes");
    expect(text).toContain(`- iPhone: ${APP_LINKS.iosAppUrl}`);
    expect(text).not.toMatch(/Success Path|48 hours|manager has also received/);
  });

  it("the Send Login Details email never shows a password line", () => {
    expect(EMAIL_DEFAULTS.userAccountUpdated.body).not.toMatch(/password:/i);
    // A template saved before the line was removed drops it too (the sender passes null).
    const { text } = renderTemplate("* Email: {{email}}\n* Password: {{password}}", "", { "{{email}}": "a@b.co", "{{password}}": null });
    expect(text).not.toContain("Password");
  });
});

describe("firstNameOf", () => {
  it("takes the first word of the full name", () => {
    expect(firstNameOf("Jane Rivera")).toBe("Jane");
    expect(firstNameOf("  Mary Ann Smith ")).toBe("Mary");
  });

  it("says 'there' when there is no real name", () => {
    expect(firstNameOf("")).toBe("there");
    expect(firstNameOf(null)).toBe("there");
    expect(firstNameOf("jane.rivera@example.com")).toBe("there");
  });

  it("is filled in for every greeting field", () => {
    const { text } = renderTemplate("{{firstName}} {{managerFirstName}} {{adminFirstName}}", "", {
      "{{name}}": "Jane Rivera", "{{managerName}}": "Daniel Reyes", "{{adminName}}": "Alex Morgan",
    });
    expect(text.split("\n")[0]).toBe("Jane Daniel Alex");
  });
});

describe("branchAndLead", () => {
  it("gives a sales rep both lines", () => {
    expect(branchAndLead(["sales"], "Austin", "Daniel Reyes")).toEqual({ branch: "Austin", salesTeamLead: "Daniel Reyes" });
  });

  it("says 'Not assigned yet' for a rep missing either", () => {
    expect(branchAndLead(["sales"], "", null)).toEqual({ branch: "Not assigned yet", salesTeamLead: "Not assigned yet" });
  });

  it("gives a team lead or branch manager a branch but no Sales Team Lead line", () => {
    expect(branchAndLead(["sales-team-lead"], "", "Someone")).toEqual({ branch: "Not assigned yet", salesTeamLead: null });
    expect(branchAndLead(["branch-manager"], "Austin", null)).toEqual({ branch: "Austin", salesTeamLead: null });
  });

  it("leaves both lines out for C-level and admin accounts without a branch", () => {
    expect(branchAndLead(["c-level"], "", null)).toEqual({ branch: null, salesTeamLead: null });
    expect(branchAndLead(["admin"], null, null)).toEqual({ branch: null, salesTeamLead: null });
  });

  it("drops the lines that do not apply from the email", () => {
    const t = EMAIL_DEFAULTS.userAccountUpdated;
    const lines = branchAndLead(["c-level"], "", null);
    const { text } = renderTemplate(t.body, t.subject, {
      "{{name}}": "Pat Lee", "{{email}}": "pat@example.com", "{{role}}": "C-Level",
      "{{branch}}": lines.branch, "{{salesTeamLead}}": lines.salesTeamLead,
    });
    expect(text).not.toMatch(/Branch:|Sales Team Lead:/);
    expect(text).toContain("- Role: C-Level");
  });
});

describe("app links", () => {
  it("point at the US App Store, not the India one", () => {
    expect(APP_LINKS.iosAppUrl).toContain("apps.apple.com/us/");
  });

  it("are available to every template", () => {
    const { text } = renderTemplate("{{appUrl}} {{iosAppUrl}} {{androidAppUrl}}", "", {});
    expect(text).not.toMatch(/\{\{\w+\}\}/);
    expect(GLOBAL_VARIABLES).toEqual(["{{appUrl}}", "{{iosAppUrl}}", "{{androidAppUrl}}"]);
  });

  it("never point at localhost", () => {
    expect(APP_LINKS.appUrl).not.toContain("localhost");
  });

  it("still fill the old {{loginUrl}} name, so not-yet-updated templates keep working", () => {
    const { text } = renderTemplate("{{loginUrl}}", "", {});
    expect(text.startsWith(APP_LINKS.appUrl)).toBe(true);
  });

  it("are no longer offered as {{loginUrl}}, so there is one web link to pick", () => {
    expect(unknownVariables("quickStartUser", "", "{{loginUrl}}")).toEqual(["{{loginUrl}}"]);
  });
});

describe("renderTemplate", () => {
  it("turns **text** into bold and never shows the asterisks", () => {
    const { html, text } = renderTemplate("Goal: **Get into the field**", "", {});
    expect(html).toContain("<strong>Get into the field</strong>");
    expect(html).not.toContain("**");
    expect(text).toContain("Goal: Get into the field");
  });

  it("turns * and - lines into bullets", () => {
    const { html, text } = renderTemplate("* One\n- Two", "", {});
    expect(html).toContain("&bull;&nbsp;One");
    expect(html).toContain("&bull;&nbsp;Two");
    expect(text).toBe(`- One\n- Two\n\n${COPYRIGHT}`);
  });

  it("adds the copyright line exactly once, in both parts", () => {
    const { html, text } = renderTemplate("Hi", "", {});
    expect(html.split(COPYRIGHT)).toHaveLength(2);
    expect(text.split(COPYRIGHT)).toHaveLength(2);
  });

  it("escapes what a user typed, so a ticket note cannot inject a link", () => {
    const { html } = renderTemplate("Details: {{note}}", "", { "{{note}}": '<a href="https://evil.example">Click</a>' });
    expect(html).not.toContain('<a href="https://evil.example">');
    expect(html).toContain("&lt;a href=&quot;https://evil.example&quot;&gt;");
  });

  it("keeps the weekly digest table as a table", () => {
    const { html, text } = renderTemplate("{{teamTable}}", "", { "{{teamTable}}": "<table><tr><td>Jane</td></tr></table>" });
    expect(html).toContain("<table><tr><td>Jane</td></tr></table>");
    expect(text).not.toContain("<table>");
  });

  it("does not fill a value in twice", () => {
    const { text } = renderTemplate("{{message}}", "", { "{{message}}": "I typed {{name}}", "{{name}}": "Jane" });
    expect(text).toContain("I typed {{name}}");
  });

  it("fills the subject and drops bold markers there", () => {
    const { subject } = renderTemplate("", "**Ticket** {{ticketNumber}}", { "{{ticketNumber}}": "MS-042" });
    expect(subject).toBe("Ticket MS-042");
  });
});
