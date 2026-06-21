/**
 * Training Timer SMS API
 * Called by PlaybookTimer at: start, midpoint, final (30-min), complete
 *
 * Body: { type: 'start'|'midpoint'|'final'|'complete', userId, courseTitle, durationHours, timeRemaining? }
 */
import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { UserModel } from "../../src/lib/models/User";
import { SmsTemplateModel, DEFAULT_SMS_TEMPLATES } from "../../src/lib/models/SmsTemplate";
import { sendSms, renderTemplate } from "../../src/lib/telnyx";

function formatDuration(hours: number): string {
  if (hours === 1) return "1 hour";
  if (hours === 1.5) return "1.5 hours";
  return `${hours} hours`;
}

function formatRemaining(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0 && m > 0) return `${h} hour${h > 1 ? "s" : ""} ${m} minute${m > 1 ? "s" : ""}`;
  if (h > 0) return `${h} hour${h > 1 ? "s" : ""}`;
  return `${m} minute${m > 1 ? "s" : ""}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  await connectMongo();

  const { type, userId, courseTitle, durationHours, timeRemainingSeconds } = req.body;

  if (!type || !userId) return res.status(400).json({ error: "Missing required fields" });

  const validTypes = ["start", "midpoint", "final", "complete"];
  if (!validTypes.includes(type)) return res.status(400).json({ error: "Invalid type" });

  try {
    const user = await UserModel.findOne({ id: userId }).lean() as any;
    if (!user) return res.status(404).json({ error: "User not found" });

    const manager = user.managerId
      ? (await UserModel.findOne({ id: user.managerId }).lean() as any)
      : null;

    // Get template from DB or fall back to default
    const tmplDoc = await SmsTemplateModel.findOne({ key: type }).lean() as any;
    const templateStatus = tmplDoc?.status ?? "published";
    if (templateStatus === "draft") {
      console.log(`[SMS] Template '${type}' is in draft — skipping send`);
      return res.status(200).json({ ok: true, sent: 0, note: "Template is in draft mode" });
    }
    const templateStr = tmplDoc?.template ?? DEFAULT_SMS_TEMPLATES[type].template;

    // Build variables
    const midpointRemaining = durationHours ? formatRemaining((durationHours * 3600) / 2) : "";
    const vars: Record<string, string> = {
      user_name: user.name ?? "User",
      manager_name: manager?.name ?? "Manager",
      course_name: courseTitle ?? "training",
      training_duration: durationHours ? formatDuration(durationHours) : "",
      time_remaining: timeRemainingSeconds != null
        ? formatRemaining(timeRemainingSeconds)
        : midpointRemaining,
    };

    const message = renderTemplate(templateStr, vars);

    // Collect phone numbers to SMS
    const phones: string[] = [];
    if (user.phone) phones.push(user.phone);
    if (manager?.phone) phones.push(manager.phone);

    if (phones.length === 0) {
      console.warn("[SMS] No phone numbers found for user", userId);
      return res.status(200).json({ ok: true, sent: 0, note: "No phone numbers on file" });
    }

    // Send to all recipients
    const results = await Promise.allSettled(phones.map(phone => sendSms(phone, message)));
    const failed = results.filter(r => r.status === "rejected");
    if (failed.length > 0) {
      console.error("[SMS] Some messages failed:", failed);
    }

    return res.status(200).json({ ok: true, sent: phones.length - failed.length });
  } catch (err) {
    console.error("[SMS] Error:", err);
    return res.status(500).json({ error: "Failed to send SMS" });
  }
}
