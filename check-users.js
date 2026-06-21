const { MongoClient } = require('mongodb');
require('dotenv').config();

async function checkUsers() {
  const client = new MongoClient(process.env.MONGODB_URI);
  
  try {
    await client.connect();
    const db = client.db();
    
    console.log('🔍 Checking users in database...');
    
    const users = await db.collection('users').find({}).toArray();
    console.log('👥 Total users:', users.length);
    
    users.forEach(user => {
      console.log(`  - ID: ${user.id || user._id}`);
      console.log(`    Email: ${user.email}`);
      console.log(`    Name: ${user.name}`);
      console.log(`    Role: ${user.role}`);
      console.log(`    Training Center: ${user.featureToggles?.trainingCenter}`);
      console.log('    ---');
    });
    
    // Check specifically for the user we're looking for
    const targetUser = await db.collection('users').findOne({
      $or: [
        { id: 'ishitapatel3456@gmail.com' },
        { email: 'ishitapatel3456@gmail.com' }
      ]
    });
    
    console.log('🎯 Target user found:', !!targetUser);
    if (targetUser) {
      console.log('Target user details:', {
        id: targetUser.id,
        email: targetUser.email,
        name: targetUser.name,
        role: targetUser.role,
        trainingCenter: targetUser.featureToggles?.trainingCenter
      });
    }
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await client.close();
  }
}

checkUsers();