// src/lib/teamhistory/record.ts
// I/O: the hourly team-history step, run by the RepCard sync after it mirrors
// its directory. Places every RepCard rep with the board's own rule (placeRep),
// advances their history, then stores and emails new team warnings (each once).
// Never throws: a problem here must not fail the knock sync.
import { RepTeamHistoryModel } from "../models/RepTeamHistory";
import { TeamWarningModel } from "../models/TeamWarning";
import { loadSharedRosterData, computeSalesRows } from "../leaderboard/compute";
import { placeRep } from "./placement";
import { planRecording, diffWarnings, stickyNoTeamKeys, NO_TEAM_NUMBERS_TEXT, type Period, type Placement } from "./periods";
import { officeToBranch } from "../repcard/branches";
import { centralDateStr, getWindowRange } from "../acculynx/windows";
import { normEmail } from "../leaderboard/identity";
import { sendEmail } from "../email";

const SEEDED_KEY = "__seeded__";

function recipients(): string[] {
  return (process.env.TEAM_WARNING_EMAILS || "tech@millerstorm.com,youssofradwan@gmail.com")
    .split(",").map((s) => s.trim()).filter(Boolean);
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const cleanName = (s: string) => String(s || "").replace(/^❌\s*/, "").trim();

async function sendWarningEmail(items: string[]): Promise<boolean> {
  const html = `<p>The app found ${items.length} team ${items.length === 1 ? "problem" : "problems"} in User Management:</p><ul>${items
    .map((t) => `<li>${esc(t)}</li>`).join("")}</ul><p>Open User Management or the Team History page in the admin menu. You will not be emailed about the same problem again.</p>`;
  let anySent = false;
  for (const to of recipients()) {
    try { await sendEmail({ to, subject: "Team setup needs attention", html, text: items.map((t) => `- ${t}`).join("\n") }); anySent = true; }
    catch (e) { console.error("[teamhistory] warning email failed:", e); }
  }
  return anySent;
}

export async function recordTeamHistory(now: Date = new Date()): Promise<{ changed: number; newWarnings: number; failed: number; error?: string }> {
  try {
    const shared = await loadSharedRosterData();

    // 1. Place every RepCard rep exactly as the board does.
    const placements = new Map<string, Placement>();
    const names = new Map<string, { name: string; email: string }>();
    for (const [id, rc] of shared.rcById) {
      const email = normEmail((rc as any).email || "");
      const place = placeRep({
        org: shared.org,
        live: email ? shared.byEmail.get(email) : null,
        former: email ? shared.deletedByEmail.get(email) : null,
        repcardTeam: (rc as any).team, repcardOffice: (rc as any).office,
        appTeamForRepCardTeam: shared.appTeamForRepCardTeam, officeToBranch,
      });
      placements.set(id, { team: place.team, branch: place.branch });
      names.set(id, { name: cleanName(String((rc as any).name || "")), email });
    }

    // 2. Advance histories, version-checked so an admin edit is never overwritten.
    const docs = (await RepTeamHistoryModel.find({}).select("repcardUserId periods version").lean()) as any[];
    const versions = new Map(docs.map((d) => [String(d.repcardUserId), Number(d.version) || 0]));
    const histories = new Map<string, Period[]>(docs.map((d) => [String(d.repcardUserId), (d.periods || []) as Period[]]));
    const changed = planRecording({ histories, placements, today: centralDateStr(now) });
    const failedIds: string[] = [];
    for (const [id, periods] of changed) {
      const version = versions.get(id);
      const meta = names.get(id);
      try {
        await RepTeamHistoryModel.updateOne(
          version === undefined ? { repcardUserId: id, version: { $exists: false } } : { repcardUserId: id, version },
          { $set: { periods, repName: meta?.name || "", repEmail: meta?.email || "" }, $inc: { version: 1 } },
          { upsert: version === undefined }
        );
      } catch (e: any) {
        if (e?.code === 11000) continue;
        console.error(`[teamhistory] could not save history for rep ${id}:`, e);
        failedIds.push(id);
      }
    }

    // 3. Warnings: every live org-chart warning, plus D9 for live accounts with
    //    numbers this month but no team.
    const current: Array<{ key: string; userId: string; kind: string; text: string }> = [];
    const nameById = new Map<string, string>();
    for (const u of shared.byEmail.values()) nameById.set(String((u as any).id), String((u as any).name || ""));
    for (const [userId, list] of shared.org.warnings) {
      for (const w of list) current.push({ key: `org:${w.kind}:${userId}`, userId, kind: w.kind, text: `${nameById.get(userId) || userId}: ${w.message}` });
    }
    const month = await computeSalesRows(getWindowRange("month", now), shared);
    for (const r of month) {
      const busy = r.verifiedKnocks || r.leadsCreated || r.filed || r.won || r.revenue;
      if (r.team || !busy || !r.repUserId) continue;
      current.push({ key: `no-team-numbers:${r.repUserId}`, userId: r.repUserId, kind: "no-team-numbers", text: `${r.name}: ${NO_TEAM_NUMBERS_TEXT}` });
    }

    const all = (await TeamWarningModel.find({}).select("key active emailedAt").lean()) as any[];
    // D9 stays on while the person still has a live account with no team, even
    // in a month with no numbers yet (so it is not re-emailed monthly).
    const noTeamIds = new Set<string>();
    for (const u of shared.byEmail.values()) if (shared.org.teamOf(u) === "") noTeamIds.add(String((u as any).id));
    const have = new Set(current.map((w) => w.key));
    for (const key of stickyNoTeamKeys(all.map((w) => ({ key: String(w.key), active: !!w.active })), noTeamIds)) {
      if (have.has(key)) continue;
      const userId = key.slice("no-team-numbers:".length);
      current.push({ key, userId, kind: "no-team-numbers", text: `${nameById.get(userId) || userId}: ${NO_TEAM_NUMBERS_TEXT}` });
    }
    if (failedIds.length) {
      current.push({ key: "teamhistory-write-failed", userId: "", kind: "system", text: `Team history could not be saved for ${failedIds.length} rep(s) this hour. Check the server logs (repcard-sync).` });
    }
    const firstRun = !all.some((w) => w.key === SEEDED_KEY);
    const existing = all.filter((w) => w.key !== SEEDED_KEY).map((w) => ({ key: String(w.key), active: !!w.active, emailedAt: (w.emailedAt as Date | null) || null }));
    const plan = diffWarnings(existing, current, firstRun);
    const byKey = new Map(current.map((w) => [w.key, w]));
    for (const key of plan.toCreate) {
      const w = byKey.get(key)!;
      await TeamWarningModel.create({ ...w, active: true, emailedAt: plan.toEmail.includes(key) ? null : new Date() });
    }
    for (const key of plan.toReactivate) await TeamWarningModel.updateOne({ key }, { $set: { active: true, text: byKey.get(key)!.text, emailedAt: null } });
    if (plan.toDeactivate.length) await TeamWarningModel.updateMany({ key: { $in: plan.toDeactivate } }, { $set: { active: false } });
    // Keep texts current for still-active warnings (names can change).
    for (const w of current) await TeamWarningModel.updateOne({ key: w.key, active: true }, { $set: { text: w.text } });
    if (firstRun) await TeamWarningModel.create({ key: SEEDED_KEY, userId: "", kind: "marker", text: "First-run marker", active: false, emailedAt: new Date() });

    if (plan.toEmail.length) {
      const items = plan.toEmail.map((k) => byKey.get(k)!.text);
      const anySent = await sendWarningEmail(items);
      // If every send failed, leave emailedAt empty so the next hour retries.
      if (anySent) await TeamWarningModel.updateMany({ key: { $in: plan.toEmail } }, { $set: { emailedAt: new Date() } });
    }
    return { changed: changed.size, newWarnings: plan.toEmail.length, failed: failedIds.length };
  } catch (e: any) {
    console.error("[teamhistory] recording failed:", e);
    const message = String(e?.message || e);
    try {
      const text = `Team history recording failed: ${message}`;
      const r: any = await TeamWarningModel.updateOne(
        { key: "teamhistory-step-failed" },
        { $set: { active: true, kind: "system", userId: "", text }, $setOnInsert: { emailedAt: null } },
        { upsert: true }
      );
      if (r?.upsertedCount === 1) {
        if (await sendWarningEmail([text])) await TeamWarningModel.updateOne({ key: "teamhistory-step-failed" }, { $set: { emailedAt: new Date() } });
      }
    } catch (e2) {
      console.error("[teamhistory] could not record the step failure:", e2);
    }
    return { changed: 0, newWarnings: 0, failed: 0, error: message };
  }
}
