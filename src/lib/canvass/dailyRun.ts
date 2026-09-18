// src/lib/canvass/dailyRun.ts
// The plan behind the Canvass Map's daily refresh (plan Milestone 7, spec B5):
// which storm days still need fetching from NOAA, the steps in the order they
// must run, and the words of the alert when one fails. Pure: no clock, no
// database, no processes. scripts/canvass-daily.ts runs the plan.

import { daysBetween } from "./dates";

/** A refresh never reaches back further than this on its own; an operator passes --from for older gaps. */
export const MAX_CATCH_UP_DAYS = 45;

/** A "YYYY-MM-DD" day moved by whole days, counted in UTC like daysBetween. */
function shiftDay(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** The day after a "YYYY-MM-DD" day. */
export function dayAfter(day: string): string {
  return shiftDay(day, 1);
}

/**
 * The storm days to fetch: from the day after the newest loaded one up to
 * yesterday. NOAA's 24-hour file for a storm day is stamped the next day at
 * 12:00 UTC, so "today" is never ready when the refresh runs. Null when nothing
 * is missing. With no hail loaded at all, only the last MAX_CATCH_UP_DAYS days
 * are fetched; the same cap applies after a long outage, and `capped` says so.
 */
export function stormDaysToFetch(lastLoadedDay: string | null, today: string): { from: string; to: string; capped: boolean } | null {
  const to = shiftDay(today, -1);
  const earliest = shiftDay(to, -(MAX_CATCH_UP_DAYS - 1));
  const wanted = lastLoadedDay ? dayAfter(lastLoadedDay) : null;
  const capped = wanted === null || daysBetween(wanted, earliest) > 0;
  const from = capped ? earliest : (wanted as string);
  if (daysBetween(from, to) < 0) return null;
  return { from, to, capped };
}

export type Step = { name: string; description: string; command: string; args: string[] };

export type StepInput = {
  /** The app's database address; passed to every script, never printed. */
  uri: string;
  /** The .env file holding the RepCard and AccuLynx keys. */
  envFile: string;
  /** The Python that has the hail reader installed. */
  python: string;
  /** Where the decoded hail days live, one YYYY-MM-DD.jsonl each. */
  hailDir: string;
  /** The Node binary, and vite-node's own entry file that runs the TypeScript scripts (spawned as node + file, which works on Linux and Windows alike; the .bin shim is a shell script). */
  node: string;
  viteNodeScript: string;
  /** The repo's scripts folder. */
  scriptsDir: string;
  /** The storm days to fetch this run, or null when hail is up to date. */
  hail: { from: string; to: string } | null;
  /** Count only, write nothing (the fetch itself is skipped). */
  dryRun: boolean;
};

/** The refresh, in order. Each later step reads what the earlier ones wrote. */
export function dailySteps(input: StepInput): Step[] {
  const script = (file: string, args: string[]): Pick<Step, "command" | "args"> => ({
    command: input.node,
    args: [input.viteNodeScript, `${input.scriptsDir}/${file}`, "--uri", input.uri, "--allow-remote", ...args, ...(input.dryRun ? ["--dry-run"] : [])],
  });
  const steps: Step[] = [];
  if (input.hail && !input.dryRun) {
    steps.push({
      name: "hail-fetch",
      description: `fetch and decode NOAA hail for ${input.hail.from} to ${input.hail.to}`,
      command: input.python,
      args: [`${input.scriptsDir}/canvass-hail/decode.py`, "--from", input.hail.from, "--to", input.hail.to, "--out-dir", input.hailDir],
    });
    steps.push({ name: "hail-load", description: "load the decoded hail squares", ...script("canvass-hail-load.ts", ["--path", input.hailDir]) });
    steps.push({ name: "hail-assign", description: "give the new hail days to the houses under them", ...script("canvass-hail-assign.ts", ["--from", input.hail.from, "--to", input.hail.to]) });
  }
  steps.push({ name: "doors", description: "read every door from RepCard", ...script("canvass-doors.ts", ["--env", input.envFile]) });
  steps.push({ name: "jobs", description: "read every job from AccuLynx", ...script("canvass-jobs-backfill.ts", ["--env", input.envFile]) });
  steps.push({ name: "jobs-signed", description: "find the signing date of jobs not yet checked", ...script("canvass-jobs-signed.ts", ["--env", input.envFile]) });
  steps.push({ name: "match", description: "match doors and jobs to houses", ...script("canvass-match.ts", []) });
  steps.push({ name: "grade", description: "work out every house's colour for today", ...script("canvass-grade.ts", []) });
  steps.push({ name: "grid", description: "rebuild the zoomed-out pre-count", ...script("canvass-grid.ts", []) });
  return steps;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);
}

/** The email when a step fails. Plain words, no addresses, no keys. */
export function failureAlert(step: string, error: string, stepsDone: string[]): { subject: string; text: string; html: string } {
  const done = stepsDone.length ? stepsDone.join(", ") : "none";
  const why = error || "unknown";
  const text =
    `The Canvass Map's daily refresh failed at the "${step}" step. Steps completed first: ${done}.\n` +
    `The map keeps showing yesterday's data until the refresh succeeds; the freshness line under the map says how old it is.\n` +
    `Last error: ${why}\n` +
    `Check: pm2 logs canvass-daily`;
  const html =
    `<p>The <strong>Canvass Map</strong> daily refresh failed at the <strong>${escapeHtml(step)}</strong> step. Steps completed first: ${escapeHtml(done)}.</p>` +
    `<p>The map keeps showing yesterday's data until the refresh succeeds; the freshness line under the map says how old it is.</p>` +
    `<p><strong>Last error:</strong> ${escapeHtml(why)}</p>` +
    `<p>Check the PM2 logs on the server (<code>pm2 logs canvass-daily</code>).</p>`;
  return { subject: `Canvass Map refresh failed at "${step}"`, text, html };
}
