const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Read .env file manually
let uri = "mongodb://dsatguru:vivekVOra32+@69.62.66.123:27017/millerstorm?authSource=admin";
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

async function debugCourses() {
  try {
    await mongoose.connect(uri, { dbName: "millerstorm" });
    console.log('✓ Connected to database\n');
    
    // Check courses
    const courses = await mongoose.connection.db.collection('courses').find({}).toArray();
    console.log(`=== COURSES IN DATABASE (${courses.length}) ===`);
    if (courses.length === 0) {
      console.log('❌ NO COURSES FOUND IN DATABASE!');
      console.log('You need to create courses in the admin panel first.\n');
    } else {
      courses.forEach(c => {
        console.log(`\nCourse: ${c.title}`);
        console.log(`  ID: ${c.id}`);
        console.log(`  Status: ${c.status}`);
        console.log(`  Access Mode: ${c.accessMode || 'open'}`);
        console.log(`  Pages: ${c.pages?.length || 0}`);
      });
    }
    
    // Check all users
    const allUsers = await mongoose.connection.db.collection('users').find({}).toArray();
    console.log(`\n=== ALL USERS IN DATABASE (${allUsers.length}) ===`);
    allUsers.forEach(u => {
      console.log(`\n${u.role?.toUpperCase() || 'NO ROLE'}: ${u.name} (${u.email})`);
      console.log(`  ID: ${u.id}`);
      console.log(`  Training Center: ${u.featureToggles?.trainingCenter ? '✓ YES' : '❌ NO'}`);
    });
    
    // Check manager user
    const manager = await mongoose.connection.db.collection('users').findOne({ 
      role: 'manager' 
    });
    
    console.log(`\n=== CHECKING FIRST MANAGER USER ===`);
    if (manager) {
      console.log(`Name: ${manager.name}`);
      console.log(`Email: ${manager.email}`);
      console.log(`Role: ${manager.role}`);
      console.log(`Training Center Enabled: ${manager.featureToggles?.trainingCenter ? '✓ YES' : '❌ NO'}`);
      
      // Simulate the API filter logic
      console.log(`\n=== SIMULATING API FILTER ===`);
      const filteredCourses = courses.filter((course) => {
        console.log(`\nChecking course: ${course.title}`);
        
        if (course.status !== "published") {
          console.log(`  ❌ Not published (status: ${course.status})`);
          return false;
        }
        console.log(`  ✓ Published`);
        
        if (!manager.featureToggles?.trainingCenter) {
          console.log(`  ❌ Manager doesn't have training center enabled`);
          return false;
        }
        console.log(`  ✓ Manager has training center enabled`);
        
        if (course.accessMode === "open" || !course.accessMode) {
          console.log(`  ✓ Access mode is open`);
          return true;
        }
        
        if (course.accessMode === "assigned" && manager.role === "manager") {
          console.log(`  ✓ Access mode is assigned and user is manager`);
          return true;
        }
        
        console.log(`  ❌ Access mode is ${course.accessMode} and user is ${manager.role}`);
        return false;
      });
      
      console.log(`\n=== RESULT ===`);
      console.log(`Courses that should be visible: ${filteredCourses.length}`);
      filteredCourses.forEach(c => console.log(`  - ${c.title}`));
    } else {
      console.log('❌ Manager user not found!');
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

debugCourses();
