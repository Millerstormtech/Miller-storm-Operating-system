const fetch = require('node-fetch');

async function testFullFlow() {
  try {
    console.log("=== TESTING FULL FLOW ===\n");

    // Step 1: Create a test metric with custom columns
    console.log("Step 1: Creating metric with custom columns...");
    const testMetrics = [
      {
        id: "test-flow-" + Date.now(),
        platform: "instagram",
        platformName: "Instagram",
        followers: 15451,
        posts30d: 15,
        views30d: 455555,
        "Engagement Rate": 4.5,
        "Budget": 1000,
        "Campaign Active": true
      }
    ];

    const saveRes = await fetch("http://localhost:3000/api/social-media-metrics", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testMetrics)
    });

    const saveData = await saveRes.json();
    console.log("Save response:", saveData.success ? "✓ Success" : "✗ Failed");

    // Step 2: Fetch the data back
    console.log("\nStep 2: Fetching metrics from database...");
    const fetchRes = await fetch("http://localhost:3000/api/social-media-metrics");
    const fetchedMetrics = await fetchRes.json();

    console.log("Fetched metrics count:", fetchedMetrics.length);

    // Step 3: Find our test metric
    const testMetric = fetchedMetrics.find(m => m.id === testMetrics[0].id);

    if (!testMetric) {
      console.log("✗ Test metric not found!");
      return;
    }

    console.log("\nStep 3: Verifying data...");
    console.log("Metric ID:", testMetric.id);
    console.log("Platform:", testMetric.platformName);
    console.log("Followers:", testMetric.followers);
    console.log("Posts30d:", testMetric.posts30d);
    console.log("Views30d:", testMetric.views30d);
    console.log("Engagement Rate:", testMetric["Engagement Rate"]);
    console.log("Budget:", testMetric["Budget"]);
    console.log("Campaign Active:", testMetric["Campaign Active"]);

    // Step 4: Check if custom columns are present
    console.log("\nStep 4: Checking custom columns...");
    const hasEngagementRate = testMetric["Engagement Rate"] !== undefined && testMetric["Engagement Rate"] !== 0;
    const hasBudget = testMetric["Budget"] !== undefined && testMetric["Budget"] !== 0;
    const hasCampaignActive = testMetric["Campaign Active"] !== undefined;

    if (hasEngagementRate && hasBudget && hasCampaignActive) {
      console.log("✓✓✓ ALL CUSTOM COLUMNS PRESENT AND CORRECT! ✓✓✓");
    } else {
      console.log("✗ Some custom columns are missing or zero:");
      console.log("  - Engagement Rate:", hasEngagementRate ? "✓" : "✗");
      console.log("  - Budget:", hasBudget ? "✓" : "✗");
      console.log("  - Campaign Active:", hasCampaignActive ? "✓" : "✗");
    }

    // Step 5: Show all keys
    console.log("\nStep 5: All keys in fetched metric:");
    console.log(Object.keys(testMetric).sort());

  } catch (error) {
    console.error("Error:", error.message);
  }
}

testFullFlow();
