const { MongoClient } = require('mongodb');

const uri = 'mongodb://dsatguru:vivekVOra32%2B@69.62.66.123:27017/millerstorm?authSource=admin';

async function fixBlobUrls() {
  const client = new MongoClient(uri);
  
  try {
    console.log('Connecting to MongoDB...');
    await client.connect();
    console.log('✓ Connected to MongoDB\n');
    
    const db = client.db();
    const collection = db.collection('apptools');
    
    // Find all items with blob URLs
    const blobItems = await collection.find({
      imageUrl: { $regex: '^blob:' }
    }).toArray();
    
    console.log(`Found ${blobItems.length} items with blob URLs\n`);
    
    if (blobItems.length === 0) {
      console.log('No items to fix!');
      return;
    }
    
    // Update each item to remove the blob URL (set to empty string)
    for (const item of blobItems) {
      console.log(`Fixing: ${item.title}`);
      console.log(`  Old URL: ${item.imageUrl}`);
      
      await collection.updateOne(
        { _id: item._id },
        { $set: { imageUrl: '' } }
      );
      
      console.log(`  New URL: (empty - admin can re-upload)\n`);
    }
    
    console.log('✓ All blob URLs have been cleared');
    console.log('⚠️  Admin needs to re-upload images for these items');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    console.log('\nDisconnected from MongoDB');
  }
}

fixBlobUrls();
