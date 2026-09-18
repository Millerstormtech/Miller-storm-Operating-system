import { describe, expect, it } from "vitest";
import { MAX_CATCH_UP_DAYS, dailySteps, dayAfter, failureAlert, stormDaysToFetch, type StepInput } from "./dailyRun";

describe("stormDaysToFetch", () => {
  it("fetches from the day after the newest loaded day up to yesterday", () => {
    expect(stormDaysToFetch("2026-09-14", "2026-09-18")).toEqual({ from: "2026-09-15", to: "2026-09-17", capped: false });
  });

  it("is null when yesterday is already loaded (the file for today is never ready)", () => {
    expect(stormDaysToFetch("2026-09-17", "2026-09-18")).toBeNull();
    expect(stormDaysToFetch("2026-09-18", "2026-09-18")).toBeNull();
  });

  it("crosses a month end and a year end", () => {
    expect(stormDaysToFetch("2026-09-30", "2026-10-02")).toEqual({ from: "2026-10-01", to: "2026-10-01", capped: false });
    expect(stormDaysToFetch("2026-12-31", "2027-01-02")).toEqual({ from: "2027-01-01", to: "2027-01-01", capped: false });
  });

  it("reaches back at most MAX_CATCH_UP_DAYS and says so", () => {
    expect(MAX_CATCH_UP_DAYS).toBe(45);
    expect(stormDaysToFetch("2026-01-01", "2026-09-18")).toEqual({ from: "2026-08-04", to: "2026-09-17", capped: true });
    expect(stormDaysToFetch(null, "2026-09-18")).toEqual({ from: "2026-08-04", to: "2026-09-17", capped: true });
    // Exactly 45 days behind is not capped; one more is.
    expect(stormDaysToFetch("2026-08-03", "2026-09-18")).toEqual({ from: "2026-08-04", to: "2026-09-17", capped: false });
    expect(stormDaysToFetch("2026-08-02", "2026-09-18")).toEqual({ from: "2026-08-04", to: "2026-09-17", capped: true });
  });

  it("dayAfter handles a leap day", () => {
    expect(dayAfter("2028-02-28")).toBe("2028-02-29");
    expect(dayAfter("2028-02-29")).toBe("2028-03-01");
  });
});

const input: StepInput = {
  uri: "mongodb://user:secret@127.0.0.1:27017/millerstorm?authSource=admin",
  envFile: "/var/www/millerstorm/.env",
  python: "/opt/kp-hail/bin/python",
  hailDir: "/var/www/millerstorm-data/hail",
  node: "/usr/bin/node",
  viteNodeScript: "/var/www/millerstorm/node_modules/vite-node/vite-node.mjs",
  scriptsDir: "/var/www/millerstorm/scripts",
  hail: { from: "2026-09-15", to: "2026-09-17" },
  dryRun: false,
};

describe("dailySteps", () => {
  it("runs the nine steps in dependency order", () => {
    expect(dailySteps(input).map((s) => s.name)).toEqual(["hail-fetch", "hail-load", "hail-assign", "doors", "jobs", "jobs-signed", "match", "grade", "grid"]);
  });

  it("fetches with the hail reader's Python and gives only the requested days to the houses", () => {
    const [fetch, load, assign] = dailySteps(input);
    expect(fetch.command).toBe("/opt/kp-hail/bin/python");
    expect(fetch.args).toEqual(["/var/www/millerstorm/scripts/canvass-hail/decode.py", "--from", "2026-09-15", "--to", "2026-09-17", "--out-dir", "/var/www/millerstorm-data/hail"]);
    expect(load.args).toContain("--path");
    expect(assign.args.slice(-4)).toEqual(["--from", "2026-09-15", "--to", "2026-09-17"]);
  });

  it("passes the database address and --allow-remote to every script, and the .env file to the ones that need keys", () => {
    for (const step of dailySteps(input).filter((s) => s.command === input.node)) {
      expect(step.args[0]).toBe(input.viteNodeScript);
      expect(step.args[1]).toMatch(/^\/var\/www\/millerstorm\/scripts\/canvass-.*\.ts$/);
      expect(step.args).toContain("--allow-remote");
      expect(step.args[step.args.indexOf("--uri") + 1]).toBe(input.uri);
    }
    const withKeys = dailySteps(input).filter((s) => s.args.includes("--env")).map((s) => s.name);
    expect(withKeys).toEqual(["doors", "jobs", "jobs-signed"]);
  });

  it("skips the hail steps when hail is up to date", () => {
    expect(dailySteps({ ...input, hail: null }).map((s) => s.name)).toEqual(["doors", "jobs", "jobs-signed", "match", "grade", "grid"]);
  });

  it("a dry run counts only: every script gets --dry-run and nothing is fetched", () => {
    const steps = dailySteps({ ...input, dryRun: true });
    expect(steps.map((s) => s.name)).toEqual(["doors", "jobs", "jobs-signed", "match", "grade", "grid"]);
    for (const step of steps) expect(step.args).toContain("--dry-run");
  });
});

describe("failureAlert", () => {
  it("names the step, what completed, and the log to check, without the address or keys", () => {
    const alert = failureAlert("doors", "RepCard answered 503", ["hail-fetch", "hail-load", "hail-assign"]);
    expect(alert.subject).toBe('Canvass Map refresh failed at "doors"');
    expect(alert.text).toContain("Steps completed first: hail-fetch, hail-load, hail-assign");
    expect(alert.text).toContain("pm2 logs canvass-daily");
    expect(alert.html).toContain("RepCard answered 503");
    expect(alert.text).not.toContain("mongodb://");
    expect(alert.text).not.toMatch(/—/);
  });

  it("escapes the error in the html and says none when nothing completed", () => {
    const alert = failureAlert("hail-fetch", "<timeout>", []);
    expect(alert.html).toContain("&lt;timeout&gt;");
    expect(alert.text).toContain("Steps completed first: none");
  });
});
