const fetch = require('node-fetch');

async function testColumnSave() {
  try {
    console.log("Testing column data save...\n");

    // Test data with custom columns
    const testMetrics = [
      {
        id: "social-instagram-test",
        platform: "instagram",
        platformName: "Instagram",
        followers: 15451,
        posts30d: 15,
        views30d: 455555,
        "Engagement Rate": 4.5,
        "Budget": 1000,
        "Campaign Active": true
      },
      {
        id: "social-facebook-test",
        platform: "facebook",
        platformName: "Facebook",
        followers: 15421,
        posts30d: 17,
        views30d: 4851,
        "Engagement Rate": 3.2,
        "Budget": 500,
        "Campaign Active": false
      }
    ];

    console.log("Sending metrics with custom columns:");
    console.log(JSON.stringify(testMetrics, null, 2));

    const response = await fetch("http://localhost:3000/api/social-media-metrics", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testMetrics)
    });

    const result = await response.json();
    console.log("\nAPI Response:");
    console.log(JSON.stringify(result, null, 2));

    if (response.ok && result.success) {
      console.log("\n✓ Metrics saved successfully!");
      
      // Fetch to verify
      const getResponse = await fetch("http://localhost:3000/api/social-media-metrics");
      const metrics = await getResponse.json();
      
      console.log("\nVerifying saved data:");
      const saved = metrics.find(m => m.id === "social-instagram-test");
      if (saved) {
        console.log("Instagram metric found:");
        console.log(JSON.stringify(saved, null, 2));
        
        if (saved["Engagement Rate"] && saved["Budget"] && saved["Campaign Active"] !== undefined) {
          console.log("\n✓ Custom columns saved correctly!");
        } else {
          console.log("\n✗ Custom columns NOT saved!");
        }
      }
    } else {
      console.log("\n✗ Failed to save metrics");
    }
  } catch (error) {
    console.error("Error:", error.message);
  }
}

testColumnSave();
