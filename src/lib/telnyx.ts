/**
 * Telnyx SMS sender
 * Uses Telnyx REST API v2 to send SMS messages.
 * Requires TELNYX_API_KEY and TELNYX_FROM_NUMBER in environment.
 */

import { connectMongo } from "./mongodb";
import { SmsTemplateModel } from "./models/SmsTemplate";

export async function sendSms(to: string, text: string): Promise<void> {
  const apiKey = process.env.TELNYX_API_KEY;
  const from = process.env.TELNYX_FROM_NUMBER;

  if (!apiKey || !from) {
    console.warn("[Telnyx] TELNYX_API_KEY or TELNYX_FROM_NUMBER not set — skipping SMS");
    return;
  }

  // Normalize phone number to E.164 format
  const normalized = normalizePhone(to);
  if (!normalized) {
    console.warn("[Telnyx] Invalid phone number:", to);
    return;
  }

  try {
    const res = await fetch("https://api.telnyx.com/v2/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from,
        to: normalized,
        text,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      const errorMsg = `Telnyx SMS failed (${res.status}): ${body}`;
      console.error("[Telnyx]", errorMsg);
      throw new Error(errorMsg);
    }
    
    const responseData = await res.json();
    const messageSid = responseData?.data?.id || null;
    console.log("[Telnyx] SMS sent successfully to", normalized, "- Message ID:", messageSid);
  } catch (error: any) {
    console.error("[Telnyx] Error sending SMS:", error.message);
    throw error;
  }
}

/** Normalize to E.164 — assumes US numbers if no country code */
function normalizePhone(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (digits.length > 10) return `+${digits}`;
  return null;
}

/** Replace template variables with actual values */
export function renderTemplate(
  template: string,
  vars: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? `{${key}}`);
}

/** Get SMS template from database */
async function getSmsTemplate(key: string) {
  try {
    await connectMongo();
    const template = await SmsTemplateModel.findOne({ key }).lean();
    return template || null;
  } catch (error) {
    console.error("[Telnyx] Error fetching SMS template:", error);
    return null;
  }
}

/** Send User Account Update SMS */
export async function sendUserAccountUpdateSMS(params: {
  userName: string;
  adminName: string;
  userPhone: string;
}) {
  try {
    const tmpl = await getSmsTemplate("userAccountUpdate");
    
    if (!tmpl) {
      console.log("[Telnyx] userAccountUpdate template not found - skipping SMS");
      return;
    }
    
    if (tmpl.status === "draft") {
      console.log("[Telnyx] userAccountUpdate template is draft - skipping SMS");
      return;
    }

    // Replace variables in template
    const message = renderTemplate(tmpl.template, {
      user_name: params.userName,
      admin_name: params.adminName,
    });

    await sendSms(params.userPhone, message);
    console.log("[Telnyx] User account update SMS sent to", params.userPhone);
  } catch (error) {
    console.error("[Telnyx] Error sending user account update SMS:", error);
    // Don't throw - just log so the main operation continues
  }
}
