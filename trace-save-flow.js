const mongoose = require('mongoose');

const mongoUrl = process.env.MONGODB_URI || 'mongodb://dsatguru:vivekVOra32%2B@69.62.66.123:27017/millerstorm?authSource=admin';

async function traceSaveFlow() {
  try {
    console.log("=== TRACING SAVE FLOW ===\n");
    
    await mongoose.connect(mongoUrl);
    console.log("✓ Connected to MongoDB\n");

    const db = mongoose.connection.db;
    const collection = db.collection('socialmediametrics');
    
    // Get all documents
    const docs = await collection.find({}).toArray();
    console.log(`Found ${docs.length} documents in database\n`);
    
    if (docs.length > 0) {
      console.log("=== FIRST DOCUMENT ===");
      const first = docs[0];
      console.log("ID:", first.id);
      console.log("Platform:", first.platformName);
      console.log("All keys:", Object.keys(first).sort());
      
      console.log("\n=== CHECKING FOR CUSTOM COLUMNS ===");
      const defaultKeys = ['_id', 'id', '__v', 'createdAt', 'updatedAt', 'lastUpdated', 'platform', 'platformName', 'followers', 'posts30d', 'views30d', 'icon'];
      const customKeys = Object.keys(first).filter(k => !defaultKeys.includes(k));
      
      if (customKeys.length > 0) {
        console.log("✓ Found custom columns:", customKeys);
        customKeys.forEach(key => {
          console.log(`  - ${key}: ${JSON.stringify(first[key])}`);
        });
      } else {
        console.log("✗ NO CUSTOM COLUMNS FOUND");
        console.log("\nFull document:");
        console.log(JSON.stringify(first, null, 2));
      }
    }
    
    // Check CustomColumn collection
    console.log("\n=== CHECKING CUSTOM COLUMN DEFINITIONS ===");
    const customColsCollection = db.collection('customcolumns');
    const customCols = await customColsCollection.find({}).toArray();
    console.log(`Found ${customCols.length} column definitions`);
    
    if (customCols.length > 0) {
      console.log("Column definitions:");
      customCols.forEach(col => {
        console.log(`  - ${col.name} (${col.datatype})`);
      });
    }
    
    await mongoose.disconnect();
    console.log("\n✓ Disconnected");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

traceSaveFlow();
