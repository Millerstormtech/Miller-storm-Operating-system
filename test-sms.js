/**
 * Quick SMS test — run with: node test-sms.js +1XXXXXXXXXX
 * Replace +1XXXXXXXXXX with the phone number you want to test
 */
require("dotenv").config({ path: ".env" });

const apiKey = process.env.TELNYX_API_KEY;
const from = process.env.TELNYX_FROM_NUMBER;
const to = process.argv[2];

if (!to) {
  console.error("Usage: node test-sms.js +1XXXXXXXXXX");
  process.exit(1);
}

if (!apiKey || !from) {
  console.error("❌ TELNYX_API_KEY or TELNYX_FROM_NUMBER missing in .env");
  process.exit(1);
}

console.log("📤 Sending test SMS...");
console.log("   From:", from);
console.log("   To:  ", to);
console.log("   Key: ", apiKey.slice(0, 10) + "...");

fetch("https://api.telnyx.com/v2/messages", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    from,
    to,
    text: "Test SMS from Genesis app — if you see this, SMS is working!",
  }),
})
  .then(async (res) => {
    const body = await res.json();
    if (res.ok) {
      console.log("✅ SMS sent successfully!");
      console.log("   Message ID:", body.data?.id);
      console.log("   Status:", body.data?.to?.[0]?.status);
    } else {
      console.error("❌ Telnyx error:", res.status);
      console.error(JSON.stringify(body, null, 2));
    }
  })
  .catch((err) => {
    console.error("❌ Network error:", err.message);
  });
