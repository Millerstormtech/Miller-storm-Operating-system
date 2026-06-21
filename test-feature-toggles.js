const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Read .env file manually
let uri = "mongodb://localhost:27017/millerstorm";
try {
  const envPath = path.join(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    const match = envContent.match(/MONGODB_URI=(.+)/);
    if (match) {
      uri = match[1].trim().replace(/['"]/g, '');
    }
  }
} catch (err) {
  console.log('Using default MongoDB URI');
}

async function testFeatureToggles() {
  try {
    await mongoose.connect(uri, { dbName: "millerstorm" });
    console.log('✓ Connected to database\n');
    
    // Get all users
    const users = await mongoose.connection.db.collection('users').find({}).toArray();
    
    console.log(`=== FEATURE TOGGLES TEST (${users.length} users) ===\n`);
    
    const togglesToCheck = [
      'dashboard',
      'trainingCenter',
      'onlineTraining',
      'training',
      'courseManagement',
      'userManagement',
      'team',
      'plans',
      'profile',
      'plan',
      'materials',
      'aiChat',
      'webPage',
      'businessCards',
      'assets',
      'approvals',
      'socialMetrics'
    ];
    
    let issuesFound = false;
    
    for (const user of users) {
      console.log(`\n${user.role?.toUpperCase() || 'NO ROLE'}: ${user.name} (${user.email})`);
      console.log(`  ID: ${user.id}`);
      
      if (!user.featureToggles) {
        console.log(`  ❌ NO FEATURE TOGGLES OBJECT!`);
        issuesFound = true;
        continue;
      }
      
      console.log(`  Feature Toggles Object: ✓ EXISTS`);
      
      // Check specific toggles
      const missingToggles = [];
      const disabledToggles = [];
      
      togglesToCheck.forEach(toggle => {
        if (user.featureToggles[toggle] === undefined) {
          missingToggles.push(toggle);
        } else if (user.featureToggles[toggle] === false) {
          disabledToggles.push(toggle);
        }
      });
      
      if (missingToggles.length > 0) {
        console.log(`  ⚠️  Missing toggles: ${missingToggles.join(', ')}`);
        issuesFound = true;
      }
      
      if (disabledToggles.length > 0) {
        console.log(`  ⚠️  Disabled toggles: ${disabledToggles.join(', ')}`);
      }
      
      // Show key toggles for this role
      if (user.role === 'manager') {
        console.log(`  Training Center: ${user.featureToggles.trainingCenter ? '✓' : '❌'}`);
        console.log(`  Online Training: ${user.featureToggles.onlineTraining ? '✓' : '❌'}`);
        console.log(`  Team: ${user.featureToggles.team ? '✓' : '❌'}`);
      } else if (user.role === 'sales') {
        console.log(`  Training Center: ${user.featureToggles.trainingCenter ? '✓' : '❌'}`);
        console.log(`  Profile: ${user.featureToggles.profile ? '✓' : '❌'}`);
        console.log(`  AI Chat: ${user.featureToggles.aiChat ? '✓' : '❌'}`);
      } else if (user.role === 'marketing') {
        console.log(`  Training Center: ${user.featureToggles.trainingCenter ? '✓' : '❌'}`);
        console.log(`  Assets: ${user.featureToggles.assets ? '✓' : '❌'}`);
        console.log(`  Approvals: ${user.featureToggles.approvals ? '✓' : '❌'}`);
      } else if (user.role === 'admin') {
        console.log(`  User Management: ${user.featureToggles.userManagement ? '✓' : '❌'}`);
        console.log(`  Course Management: ${user.featureToggles.courseManagement ? '✓' : '❌'}`);
      }
      
      // Count total toggles
      const totalToggles = Object.keys(user.featureToggles).length;
      const enabledCount = Object.values(user.featureToggles).filter(v => v === true).length;
      console.log(`  Total toggles: ${totalToggles} (${enabledCount} enabled)`);
    }
    
    console.log('\n=== SUMMARY ===');
    if (issuesFound) {
      console.log('❌ Issues found! Some users are missing feature toggles.');
      console.log('\nRun fix-manager-training.js to enable all toggles for all users.');
    } else {
      console.log('✓ All users have feature toggles properly configured!');
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

testFeatureToggles();
