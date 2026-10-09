// POST /api/dmo/reminders-cron
// Sends the DMO reminders: the weekly and monthly reminders to each person who
// has not sent their form, then the "not sent yet" list to their Team Lead and
// Branch Manager. Triggered every few minutes by the dmo-reminders PM2 cron
// (scripts/dmo-reminders-cron.js); the cron only keeps the clock, this decides.
// Who gets what, and when, is src/lib/dmo/reminders.ts.
//
// Each message goes to the bell and, when the person has a device token, as a
// push to their phone or browser. Never WhatsApp (Youssef, 2026-09-18).
//
// Idempotency: each (person, reminder) is claimed in DmoReminderModel before it
// is sent, so an overlapping tick or a re-run never sends it twice.
//
// DMO_REMINDERS_MODE in .env: "on" (default) sends, "dry" only reports who
// would be reminded, "off" does nothing.
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { UserModel } from "../../../src/lib/models/User";
import { NotificationModel } from "../../../src/lib/models/Notification";
import { DmoWeeklyModel } from "../../../src/lib/models/DmoWeekly";
import { DmoMonthlyModel } from "../../../src/lib/models/DmoMonthly";
import { DmoReminderModel } from "../../../src/lib/models/DmoReminder";
import { logToDb } from "../../../src/lib/models/SystemLog";
import { sendPushNotification } from "../../../src/lib/firebase-admin";
import { loadSharedRosterData } from "../../../src/lib/leaderboard/compute";
import { DMO_ROLES } from "../../../src/lib/dmo/config";
import { dueStages, stageMessages, type Member } from "../../../src/lib/dmo/reminders";

function hasSyncSecret(req: NextApiRequest): boolean {
  const secret = req.headers["x-sync-secret"];
  return !!secret && secret === process.env.ACCULYNX_SYNC_SECRET;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method Not Allowed" });
  }
  if (!hasSyncSecret(req)) return res.status(401).json({ error: "Unauthorized" });

  const mode = (process.env.DMO_REMINDERS_MODE || "on").toLowerCase();
  if (mode === "off") return res.status(200).json({ mode, stages: [] });

  // Outside production a test can pretend it is another time ({ "now": ISO }).
  const fake = process.env.NODE_ENV !== "production" && typeof req.body?.now === "string" ? new Date(req.body.now) : null;
  const now = fake && !isNaN(fake.getTime()) ? fake : new Date();
  const stages = dueStages(now);
  if (stages.length === 0) return res.status(200).json({ mode, stages: [] });

  await connectMongo();
  const shared = await loadSharedRosterData();
  const people: Member[] = [...shared.byEmail.values()]
    .filter((u: any) => (DMO_ROLES as readonly string[]).includes(String(u.role || "")))
    .map((u: any) => ({
      userId: String(u.id),
      name: String(u.name || u.email || "Unnamed").trim(),
      role: String(u.role),
      team: shared.org.teamOf(u) || "",
      branch: shared.org.branchOf(u) || "",
    }));
  const ids = people.map((p) => p.userId);

  const report: Array<{ key: string; messages: number; sent: number; pushed: number }> = [];
  for (const stage of stages) {
    const docs =
      stage.kind === "weekly"
        ? await DmoWeeklyModel.find({ userId: { $in: ids }, weekOf: stage.form }).select("userId").lean()
        : await DmoMonthlyModel.find({ userId: { $in: ids }, month: stage.form }).select("userId").lean();
    const sentForm = new Set((docs as any[]).map((d) => String(d.userId)));
    const messages = stageMessages(stage, people, sentForm);
    const row = { key: stage.key, messages: messages.length, sent: 0, pushed: 0 };
    report.push(row);
    if (mode !== "on" || messages.length === 0) continue;

    const tokens = new Map(
      ((await UserModel.find({ id: { $in: messages.map((m) => m.userId) } }).select("id role fcmToken").lean()) as any[]).map(
        (u) => [String(u.id), u]
      )
    );

    for (const m of messages) {
      // Claim before sending: a second tick collides on the unique index and skips.
      try {
        await DmoReminderModel.create({ userId: m.userId, key: m.key, sentAt: now });
      } catch (e: any) {
        if (e?.code === 11000) continue;
        throw e;
      }
      try {
        await NotificationModel.create({
          id: `notif-dmo-${m.userId}-${m.key}`,
          userId: m.userId,
          type: "dmo_reminder",
          title: m.title,
          message: m.body,
          read: false,
          metadata: { reminder: m.key },
        });
        row.sent++;
        const token = tokens.get(m.userId)?.fcmToken;
        if (token && (await sendPushNotification(String(token), m.title, m.body, { type: "dmo_reminder", reminder: m.key }))) {
          row.pushed++;
          await DmoReminderModel.updateOne({ userId: m.userId, key: m.key }, { $set: { pushed: true } }).catch(() => {});
        }
      } catch (e: any) {
        await logToDb("error", "DMO-REMINDERS", `reminder ${m.key} to ${m.userId} failed: ${e?.message}`).catch(() => {});
      }
    }
  }

  return res.status(200).json({ mode, stages: report });
}
