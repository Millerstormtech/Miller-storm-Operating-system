const mongoose = require('mongoose');

// Connect to MongoDB
const mongoUrl = process.env.MONGODB_URI || 'mongodb://dsatguru:vivekVOra32%2B@69.62.66.123:27017/millerstorm?authSource=admin';

async function debugColumnSave() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUrl);
    console.log("✓ Connected to MongoDB\n");

    // Define schema with strict: false
    const socialMediaMetricsSchema = new mongoose.Schema(
      {
        id: { type: String, required: true, unique: true },
        platform: { type: String, required: true },
        platformName: { type: String, required: true },
        followers: { type: Number, default: 0 },
        posts30d: { type: Number, default: 0 },
        views30d: { type: Number, default: 0 },
        lastUpdated: { type: Date, default: Date.now }
      },
      { 
        timestamps: true,
        strict: false // Allow dynamic fields
      }
    );

    const SocialMediaMetrics = mongoose.model('SocialMediaMetrics', socialMediaMetricsSchema);

    // Test data with custom columns
    const testData = {
      id: "test-dynamic-columns-" + Date.now(),
      platform: "instagram",
      platformName: "Instagram",
      followers: 15451,
      posts30d: 15,
      views30d: 455555,
      "Engagement Rate": 4.5,
      "Budget": 1000,
      "Campaign Active": true,
      "Notes": "Test custom columns"
    };

    console.log("Saving test data with custom columns:");
    console.log(JSON.stringify(testData, null, 2));

    // Save the data
    const result = await SocialMediaMetrics.findOneAndUpdate(
      { id: testData.id },
      testData,
      { upsert: true, new: true }
    );

    console.log("\n✓ Data saved successfully!");
    console.log("\nSaved data from database:");
    console.log(JSON.stringify(result.toObject(), null, 2));

    // Verify custom columns are there
    if (result["Engagement Rate"] && result["Budget"] && result["Campaign Active"] !== undefined) {
      console.log("\n✓✓✓ CUSTOM COLUMNS SAVED SUCCESSFULLY! ✓✓✓");
    } else {
      console.log("\n✗ Custom columns NOT found in saved data");
    }

    // Fetch again to double-check
    const fetched = await SocialMediaMetrics.findOne({ id: testData.id });
    console.log("\nFetched data from database:");
    console.log(JSON.stringify(fetched.toObject(), null, 2));

    await mongoose.disconnect();
    console.log("\n✓ Disconnected from MongoDB");
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

debugColumnSave();
