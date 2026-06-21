const mongoose = require('mongoose');

const mongoUrl = process.env.MONGODB_URI || 'mongodb://dsatguru:vivekVOra32%2B@69.62.66.123:27017/millerstorm?authSource=admin';

async function checkDatabase() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(mongoUrl);
    console.log("✓ Connected\n");

    const db = mongoose.connection.db;
    
    // Get the collection
    const collection = db.collection('socialmediametrics');
    
    // Find all documents
    const docs = await collection.find({}).toArray();
    
    console.log(`Found ${docs.length} documents\n`);
    
    if (docs.length > 0) {
      console.log("First document:");
      console.log(JSON.stringify(docs[0], null, 2));
      
      console.log("\n\nAll keys in first document:");
      console.log(Object.keys(docs[0]).sort());
      
      console.log("\n\nChecking for custom columns:");
      const firstDoc = docs[0];
      const defaultKeys = ['_id', 'id', '__v', 'createdAt', 'updatedAt', 'lastUpdated', 'platform', 'platformName', 'followers', 'posts30d', 'views30d', 'icon'];
      const customKeys = Object.keys(firstDoc).filter(k => !defaultKeys.includes(k));
      
      if (customKeys.length > 0) {
        console.log("✓ Found custom columns:", customKeys);
        customKeys.forEach(key => {
          console.log(`  ${key}: ${firstDoc[key]}`);
        });
      } else {
        console.log("✗ No custom columns found");
      }
    }
    
    await mongoose.disconnect();
    console.log("\n✓ Disconnected");
  } catch (error) {
    console.error("Error:", error.message);
  }
}

checkDatabase();
