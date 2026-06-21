import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { SmsTemplateModel, DEFAULT_SMS_TEMPLATES } from "../../../src/lib/models/SmsTemplate";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();

  if (req.method === "GET") {
    // Return all 4 templates, seeding defaults if missing
    const keys = Object.keys(DEFAULT_SMS_TEMPLATES);
    const existing = await SmsTemplateModel.find({ key: { $in: keys } }).lean() as any[];
    const map: Record<string, any> = {};
    existing.forEach(t => { map[t.key] = t; });

    const result = keys.map(key => ({
      key,
      label: map[key]?.label ?? DEFAULT_SMS_TEMPLATES[key].label,
      template: map[key]?.template ?? DEFAULT_SMS_TEMPLATES[key].template,
      status: map[key]?.status ?? "published",
    }));

    return res.status(200).json(result);
  }

  if (req.method === "PUT") {
    // Save a single template: { key, template }
    const { key, template, status } = req.body;
    if (!key || !template) return res.status(400).json({ error: "Missing key or template" });
    if (template.length > 200) return res.status(400).json({ error: "Template exceeds 200 characters" });
    if (!DEFAULT_SMS_TEMPLATES[key]) return res.status(400).json({ error: "Invalid template key" });

    await SmsTemplateModel.findOneAndUpdate(
      { key },
      { key, label: DEFAULT_SMS_TEMPLATES[key].label, template, ...(status ? { status } : {}) },
      { upsert: true, new: true }
    );
    return res.status(200).json({ ok: true });
  }

  res.setHeader("Allow", "GET, PUT");
  return res.status(405).end();
}
