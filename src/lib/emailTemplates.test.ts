import { describe, it, expect } from "vitest";
import { EMAIL_DEFAULTS, GLOBAL_VARIABLES, APP_LINKS, renderTemplate, unknownVariables } from "./emailTemplates";

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
    expect(EMAIL_DEFAULTS[key].body.trimEnd()).toMatch(/Best regards,\nMillerStorm\.tech Team$/);
  });

  it.each(keys)("%s hardcodes no app link", (key) => {
    // Links come from {{loginUrl}}, {{iosAppUrl}} etc. so they are fixed in one place.
    expect(EMAIL_DEFAULTS[key].body).not.toMatch(/apps\.apple\.com|play\.google\.com|https?:\/\/millerstorm\.tech/);
  });

  it("the welcome email carries the login details it lists", () => {
    const t = EMAIL_DEFAULTS.quickStartUser;
    const { html, text } = renderTemplate(t.body, t.subject, {
      "{{name}}": "Jane Rep",
      "{{email}}": "jane@example.com",
      "{{password}}": "Storm123",
      "{{role}}": "Sales Rep",
    });
    expect(html).not.toMatch(/\{\{\w+\}\}/);
    expect(text).toContain("Password: Storm123");
    expect(text).toContain(`iPhone App: ${APP_LINKS.iosAppUrl}`);
    expect(text).not.toContain("Your manager has also received");
  });
});

describe("app links", () => {
  it("point at the US App Store, not the India one", () => {
    expect(APP_LINKS.iosAppUrl).toContain("apps.apple.com/us/");
  });

  it("are available to every template", () => {
    const { text } = renderTemplate("{{appUrl}} {{loginUrl}} {{iosAppUrl}} {{androidAppUrl}}", "", {});
    expect(text).not.toMatch(/\{\{\w+\}\}/);
    expect(GLOBAL_VARIABLES).toHaveLength(4);
  });

  it("build the login link from the app link, never localhost", () => {
    expect(APP_LINKS.loginUrl).toBe(`${APP_LINKS.appUrl}/login`);
    expect(APP_LINKS.loginUrl).not.toContain("localhost");
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
