import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../src/lib/mongodb";
import { UserModel } from "../../src/lib/models/User";
import { sendEmail } from "../../src/lib/email";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  await connectMongo();

  const { type, userId, courseTitle, durationHours, progressPct, lessonsCompleted, lessonsTotal } = req.body;

  if (!type || !userId) return res.status(400).json({ error: "Missing required fields" });

  try {
    const user = await UserModel.findOne({ id: userId }).lean() as any;
    if (!user) return res.status(404).json({ error: "User not found" });

    const manager = user.managerId
      ? (await UserModel.findOne({ id: user.managerId }).lean() as any)
      : null;

    const recipients = [user.email];
    if (manager?.email) recipients.push(manager.email);

    if (type === "start") {
      const subject = "Training Started – Playbook Timer";
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#111827">Training Started – Playbook Timer</h2>
          <p style="color:#374151;font-size:15px">
            <strong>${user.name}</strong> has started the <strong>${courseTitle}</strong> training timer.
          </p>
          <p style="color:#374151;font-size:15px">Selected timer: <strong>${durationHours} hour${durationHours !== 1 ? "s" : ""}</strong></p>
          <p style="color:#6b7280;font-size:14px">Training progress will be tracked and you will receive an update when the timer ends.</p>
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
          <p style="color:#9ca3af;font-size:12px">Miller Storm OS – Training Center</p>
        </div>`;
      const text = `${user.name} has started the ${courseTitle} training timer.\nSelected timer: ${durationHours} hour(s)\nTraining progress will be tracked and you will receive an update when the timer ends.`;

      await Promise.all(recipients.map(to => sendEmail({ to, subject, html, text })));
      return res.status(200).json({ ok: true });
    }

    if (type === "complete") {
      const subject = "Training Timer Completed – Status Update";
      const isFullyComplete = progressPct >= 100;
      const html = `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px">
          <h2 style="color:#111827">Training Timer Completed – Status Update</h2>
          <p style="color:#374151;font-size:15px">
            The training timer for <strong>${user.name}</strong> has completed.
          </p>
          ${isFullyComplete
            ? `<p style="color:#10b981;font-size:15px;font-weight:600">✅ The training was completed successfully!</p>`
            : `<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0">
                <p style="margin:0 0 8px;color:#374151;font-size:14px;font-weight:600">Current training progress:</p>
                <p style="margin:0 0 4px;color:#374151;font-size:14px">Completion Status: <strong>${progressPct}%</strong></p>
                <p style="margin:0;color:#374151;font-size:14px">Lessons Completed: <strong>${lessonsCompleted} / ${lessonsTotal}</strong></p>
              </div>`
          }
          <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0"/>
          <p style="color:#9ca3af;font-size:12px">Miller Storm OS – Training Center</p>
        </div>`;
      const text = isFullyComplete
        ? `The training timer for ${user.name} has completed.\nThe training was completed successfully!`
        : `The training timer for ${user.name} has completed.\nCompletion Status: ${progressPct}%\nLessons Completed: ${lessonsCompleted} / ${lessonsTotal}`;

      await Promise.all(recipients.map(to => sendEmail({ to, subject, html, text })));
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Invalid type" });
  } catch (err) {
    console.error("Training timer email error:", err);
    return res.status(500).json({ error: "Failed to send email" });
  }
}
