const mongoose = require('mongoose');

const mongoUrl = process.env.MONGODB_URI || 'mongodb://dsatguru:vivekVOra32%2B@69.62.66.123:27017/millerstorm?authSource=admin';

async function testColumnCreation() {
  try {
    console.log("=== TESTING COLUMN CREATION ===\n");
    
    await mongoose.connect(mongoUrl);
    console.log("✓ Connected to MongoDB\n");

    // Check CustomColumn collection
    const db = mongoose.connection.db;
    const customColsCollection = db.collection('customcolumns');
    
    console.log("=== CHECKING CUSTOM COLUMNS ===");
    const customCols = await customColsCollection.find({}).toArray();
    console.log(`Found ${customCols.length} column definitions\n`);
    
    if (customCols.length > 0) {
      console.log("Column definitions:");
      customCols.forEach(col => {
        console.log(`  - ID: ${col.id}`);
        console.log(`    Name: ${col.name}`);
        console.log(`    Datatype: ${col.datatype}`);
        console.log(`    Created: ${col.createdAt}\n`);
      });
    } else {
      console.log("✗ NO COLUMNS FOUND\n");
    }

    // Check if metrics have custom column data
    console.log("=== CHECKING METRICS FOR CUSTOM COLUMN DATA ===");
    const metricsCollection = db.collection('socialmediametrics');
    const metrics = await metricsCollection.find({}).toArray();
    
    if (metrics.length > 0) {
      const first = metrics[0];
      const defaultKeys = ['_id', 'id', '__v', 'createdAt', 'updatedAt', 'lastUpdated', 'platform', 'platformName', 'followers', 'posts30d', 'views30d', 'icon'];
      const customKeys = Object.keys(first).filter(k => !defaultKeys.includes(k));
      
      console.log(`First metric has ${Object.keys(first).length} total fields`);
      console.log(`Custom fields: ${customKeys.length}`);
      
      if (customKeys.length > 0) {
        console.log("✓ Found custom fields:");
        customKeys.forEach(key => {
          console.log(`  - ${key}: ${JSON.stringify(first[key])}`);
        });
      } else {
        console.log("✗ NO CUSTOM FIELDS IN METRICS");
      }
    }
    
    await mongoose.disconnect();
    console.log("\n✓ Disconnected");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

testColumnCreation();
