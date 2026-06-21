/**
 * AccuLynx Webhook Registration Script
 * 
 * Usage: 
 * 1. Set your API Key in the variable below or as an environment variable
 * 2. Set your production URL
 * 3. Run: node scripts/register-acculynx-webhook.js
 */

const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');

// Load .env file
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const API_KEY = process.env.ACCULYNX_API_KEY;
const WEBHOOK_URL = "https://millerstorm.tech/api/acculynx/webhook"; 

async function registerWebhook() {
  console.log("🚀 Starting AccuLynx Webhook Registration...");

  if (!API_KEY) {
    console.error("❌ ERROR: AccuLynx API Key not found in .env file.");
    process.exit(1);
  }

  console.log(`📡 Registering URL: ${WEBHOOK_URL}`);
  console.log(`🔑 Using API Key: ${API_KEY.substring(0, 10)}...`);

  try {
    const response = await fetch("https://api.acculynx.com/webhooks/v2/subscriptions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        consumerUrl: WEBHOOK_URL,
        techContact: "admin@millerstorm.com", 
        topicNames: [
          "job.milestone.current_changed",
          "job.financials.approved-value_changed",
          "job_created",
          "job_updated"
        ]
      })
    });

    if (response.status === 201 || response.status === 200 || response.status === 204) {
      console.log(`✅ SUCCESS! Webhook registered (Status: ${response.status}).`);
      try {
        const data = await response.json();
        if (data && data.subscriptionId) {
          console.log("Subscription ID:", data.subscriptionId);
        }
      } catch (e) {
        console.log("No response body, but request was successful.");
      }
    } else {
      const text = await response.text();
      console.error(`❌ FAILED (Status: ${response.status}):`, text);
    }
  } catch (error) {
    console.error("❌ ERROR during request:", error.message);
  }
}

registerWebhook();
