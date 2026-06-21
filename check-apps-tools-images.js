const { MongoClient } = require('mongodb');

const uri = 'mongodb://dsatguru:vivekVOra32%2B@69.62.66.123:27017/millerstorm?authSource=admin';

async function checkAppsToolsImages() {
  const client = new MongoClient(uri);
  
  try {
    console.log('Connecting to MongoDB...');
    await client.connect();
    console.log('✓ Connected to MongoDB\n');
    
    const db = client.db();
    const appsTools = await db.collection('apptools').find({}).toArray();
    
    console.log(`Found ${appsTools.length} apps/tools:\n`);
    
    appsTools.forEach((item, index) => {
      console.log(`${index + 1}. ${item.title}`);
      console.log(`   Category: ${item.category}`);
      console.log(`   Image URL: ${item.imageUrl || '(none)'}`);
      console.log(`   Has blob URL: ${item.imageUrl?.startsWith('blob:') ? 'YES ⚠️' : 'No'}`);
      console.log('');
    });
    
    const blobCount = appsTools.filter(item => item.imageUrl?.startsWith('blob:')).length;
    if (blobCount > 0) {
      console.log(`\n⚠️  Found ${blobCount} items with blob URLs that need to be fixed`);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.close();
    console.log('Disconnected from MongoDB');
  }
}

checkAppsToolsImages();
