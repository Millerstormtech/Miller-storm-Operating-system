// SERVER ONLY — never import this in frontend components
import { connectMongo } from "./mongodb";
import { EmailConfigModel } from "./models/EmailConfig";
import { EMAIL_DEFAULTS } from "./emailTemplates";

export async function getEmailTemplate(key: string): Promise<{ subject: string; body: string; status: string }> {
  try {
    await connectMongo();
    const saved = await EmailConfigModel.findOne({ key }).lean() as any;
    if (saved) return { subject: saved.subject, body: saved.body, status: saved.status ?? "published" };
  } catch {}
  return {
    subject: EMAIL_DEFAULTS[key]?.subject || "",
    body: EMAIL_DEFAULTS[key]?.body || "",
    status: "published",
  };
}
