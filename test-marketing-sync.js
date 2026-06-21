const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb://localhost:27017/millerstorm';

const courseSchema = new mongoose.Schema({}, { strict: false, collection: 'courses' });
const Course = mongoose.model('Course', courseSchema);

const materialSchema = new mongoose.Schema({}, { strict: false, collection: 'marketingmaterials' });
const Material = mongoose.model('Material', materialSchema);

async function testSync() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('=== CHECKING COURSES DATA ===\n');

    const courses = await Course.find({ status: 'published' }).lean();
    console.log(`Found ${courses.length} published courses\n`);

    courses.forEach(course => {
      console.log(`📚 Course: ${course.title} (${course.id})`);
      console.log(`   Status: ${course.status}`);
      console.log(`   Pages: ${course.pages?.length || 0}\n`);

      if (course.pages) {
        course.pages.forEach(page => {
          console.log(`   📄 Page: ${page.title} (${page.id})`);
          console.log(`      Status: ${page.status}`);
          console.log(`      Video URL: ${page.videoUrl || 'none'}`);
          console.log(`      Resource Links: ${page.resourceLinks?.length || 0}`);
          
          if (page.resourceLinks && page.resourceLinks.length > 0) {
            page.resourceLinks.forEach(link => {
              console.log(`         🔗 ${link.label} -> ${link.href}`);
            });
          }
          
          console.log(`      File URLs: ${page.fileUrls?.length || 0}`);
          if (page.fileUrls && page.fileUrls.length > 0) {
            page.fileUrls.forEach(file => {
              console.log(`         📎 ${file}`);
            });
          }
          
          console.log(`      Pinned Post: ${page.pinnedCommunityPostUrl || 'none'}`);
          console.log(`      Body length: ${page.body?.length || 0}\n`);
        });
      }
    });

    console.log('\n=== SYNCING MATERIALS ===\n');
    
    // Call sync API
    const response = await fetch('http://localhost:3000/api/marketing-materials/sync', {
      method: 'POST'
    });
    
    if (response.ok) {
      const result = await response.json();
      console.log('✅ Sync successful!');
      console.log(`   Materials extracted: ${result.count}\n`);
    } else {
      console.log('❌ Sync failed:', await response.text());
    }

    console.log('\n=== CHECKING MARKETING MATERIALS ===\n');
    
    const materials = await Material.find({}).lean();
    console.log(`Found ${materials.length} materials in database\n`);

    materials.forEach(material => {
      console.log(`📦 Material:`);
      console.log(`   Type: ${material.type}`);
      console.log(`   Title: ${material.title}`);
      console.log(`   URL: ${material.url}`);
      console.log(`   Course: ${material.courseName}`);
      console.log(`   Page: ${material.pageName}`);
      console.log(`   Description: ${material.description}\n`);
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
  }
}

testSync();
