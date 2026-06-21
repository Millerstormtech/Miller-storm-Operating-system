const mongoose = require('mongoose');

const mongoUrl = process.env.MONGODB_URI || 'mongodb://dsatguru:vivekVOra32%2B@69.62.66.123:27017/millerstorm?authSource=admin';

async function testDirectMongoDB() {
  try {
    console.log("=== TESTING DIRECT MONGODB UPDATE ===\n");
    
    await mongoose.connect(mongoUrl);
    console.log("✓ Connected to MongoDB\n");

    const db = mongoose.connection.db;
    const collection = db.collection('socialmediametrics');
    
    // Test data with custom columns
    const testId = "test-direct-" + Date.now();
    const testData = {
      id: testId,
      platform: "instagram",
      platformName: "Instagram",
      followers: 15451,
      posts30d: 15,
      views30d: 455555,
      "Engagement Rate": 4.5,
      "Budget": 1000,
      "Campaign Active": true
    };

    console.log("Saving test data with direct MongoDB $set:");
    console.log(JSON.stringify(testData, null, 2));

    // Use direct MongoDB collection update
    await collection.updateOne(
      { id: testId },
      { $set: testData },
      { upsert: true }
    );

    console.log("\n✓ Data saved with direct MongoDB");

    // Fetch the data
    const result = await collection.findOne({ id: testId });

    console.log("\nFetched data from database:");
    console.log(JSON.stringify(result, null, 2));

    // Verify custom columns
    console.log("\n\nVerifying custom columns:");
    const defaultKeys = ['_id', 'id', '__v', 'createdAt', 'updatedAt', 'lastUpdated', 'platform', 'platformName', 'followers', 'posts30d', 'views30d'];
    const customKeys = Object.keys(result).filter(k => !defaultKeys.includes(k));

    if (customKeys.length > 0) {
      console.log("✓✓✓ CUSTOM COLUMNS SAVED WITH DIRECT MONGODB! ✓✓✓");
      customKeys.forEach(key => {
        console.log(`  ${key}: ${JSON.stringify(result[key])}`);
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

testDirectMongoDB();
