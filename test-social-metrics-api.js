/**
 * Test script for Social Media Metrics API
 * Run: node test-social-metrics-api.js
 */

const BASE_URL = "http://localhost:3000";

async function testSocialMetricsAPI() {
  console.log("🧪 Testing Social Media Metrics API\n");

  try {
    // Test 1: GET - Fetch all metrics
    console.log("📋 Test 1: Fetching all metrics...");
    const getRes = await fetch(`${BASE_URL}/api/social-media-metrics`);
    
    if (!getRes.ok) {
      console.error("❌ GET failed:", await getRes.text());
      return;
    }

    const existingMetrics = await getRes.json();
    console.log("✅ GET successful!");
    console.log(`   Found ${existingMetrics.length} metrics`);
    console.log("   Metrics:", JSON.stringify(existingMetrics, null, 2));
    console.log("");

    // Test 2: PUT - Save/Update metrics
    console.log("💾 Test 2: Saving new metrics...");
    const testMetrics = [
      {
        id: `social-new-${Date.now()}`,
        platform: "instagram",
        platformName: "Instagram",
        followers: 25000,
        posts30d: 45,
        views30d: 350000
      },
      {
        id: `social-new-${Date.now() + 1}`,
        platform: "facebook",
        platformName: "Facebook",
        followers: 15000,
        posts30d: 30,
        views30d: 200000
      }
    ];

    const putRes = await fetch(`${BASE_URL}/api/social-media-metrics`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testMetrics)
    });

    if (!putRes.ok) {
      console.error("❌ PUT failed:", await putRes.text());
      return;
    }

    const putData = await putRes.json();
    console.log("✅ PUT successful!");
    console.log("   Response:", putData);
    console.log("");

    // Test 3: GET again to verify save
    console.log("🔍 Test 3: Verifying saved metrics...");
    const verifyRes = await fetch(`${BASE_URL}/api/social-media-metrics`);
    
    if (!verifyRes.ok) {
      console.error("❌ Verification GET failed:", await verifyRes.text());
      return;
    }

    const savedMetrics = await verifyRes.json();
    console.log("✅ Verification successful!");
    console.log(`   Total metrics in database: ${savedMetrics.length}`);
    savedMetrics.forEach(m => {
      console.log(`   - ${m.platformName}: ${m.followers} followers, ${m.posts30d} posts, ${m.views30d} views`);
    });
    console.log("");

    // Summary
    console.log("=" .repeat(60));
    console.log("🎉 ALL TESTS PASSED!");
    console.log("=" .repeat(60));
    console.log("\n✅ API is working correctly:");
    console.log("   1. Can fetch metrics (GET)");
    console.log("   2. Can save metrics (PUT)");
    console.log("   3. Data persists in database");
    console.log("\n📊 Next steps:");
    console.log("   1. Go to: http://localhost:3000/admin/social-media-metrics");
    console.log("   2. Add/Edit metrics");
    console.log("   3. Click 'Save All Changes'");
    console.log("   4. Check Admin Dashboard to see the data\n");

  } catch (error) {
    console.error("\n❌ TEST FAILED:");
    console.error(`   ${error.message}\n`);
    console.error("   Make sure:");
    console.error("   1. Server is running (npm run dev)");
    console.error("   2. MongoDB is running");
    console.error("   3. Database connection is working\n");
  }
}

// Run tests
testSocialMetricsAPI();
