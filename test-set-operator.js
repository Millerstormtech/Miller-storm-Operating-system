const mongoose = require('mongoose');

const mongoUrl = process.env.MONGODB_URI || 'mongodb://dsatguru:vivekVOra32%2B@69.62.66.123:27017/millerstorm?authSource=admin';

async function testSetOperator() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUrl);
    console.log("✓ Connected\n");

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
        strict: false
      }
    );

    const SocialMediaMetrics = mongoose.model('SocialMediaMetrics', socialMediaMetricsSchema);

    // Test data with custom columns
    const testId = "test-set-operator-" + Date.now();
    const testData = {
      id: testId,
      platform: "instagram",
      platformName: "Instagram",
      followers: 15451,
      posts30d: 15,
      views30d: 455555,
      "Engagement Rate": 4.5,
      "Budget": 1000,
      "Campaign Active": true,
      "Notes": "Test with $set operator"
    };

    console.log("Saving test data with $set operator:");
    console.log(JSON.stringify(testData, null, 2));

    // Save using $set operator
    await SocialMediaMetrics.updateOne(
      { id: testId },
      { $set: testData },
      { upsert: true }
    );

    console.log("\n✓ Data saved with $set operator");

    // Fetch the data
    const result = await SocialMediaMetrics.findOne({ id: testId });

    console.log("\nFetched data from database:");
    console.log(JSON.stringify(result.toObject(), null, 2));

    // Verify custom columns
    console.log("\n\nVerifying custom columns:");
    const obj = result.toObject();
    const defaultKeys = ['_id', 'id', '__v', 'createdAt', 'updatedAt', 'lastUpdated', 'platform', 'platformName', 'followers', 'posts30d', 'views30d'];
    const customKeys = Object.keys(obj).filter(k => !defaultKeys.includes(k));

    if (customKeys.length > 0) {
      console.log("✓✓✓ CUSTOM COLUMNS SAVED WITH $SET! ✓✓✓");
      customKeys.forEach(key => {
        console.log(`  ${key}: ${obj[key]}`);
      });
    } else {
      console.log("✗ No custom columns found");
    }

    await mongoose.disconnect();
    console.log("\n✓ Disconnected");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

testSetOperator();
