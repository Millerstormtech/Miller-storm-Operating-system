const https = require('https');

const url = 'https://millerstorm.tech/api/courses?userId=ishitapatel3456@gmail.com&userRole=sales';

console.log('🔵 Checking web courses...');
console.log('🔵 URL:', url);

https.get(url, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('🔵 Status:', res.statusCode);
    try {
      const courses = JSON.parse(data);
      console.log('✅ Courses returned:', courses.length);
      courses.forEach((course, index) => {
        console.log(`${index + 1}. ${course.title}`);
        console.log(`   ID: ${course.id}`);
        console.log(`   Status: ${course.status}`);
        console.log(`   Access: ${course.accessMode}`);
        console.log(`   Order: ${course.order}`);
        console.log(`   Progress: ${course.progress ? JSON.stringify(course.progress) : 'NO PROGRESS'}`);
        console.log('');
      });
    } catch (e) {
      console.log('❌ Error parsing response:', e.message);
      console.log('Response:', data.substring(0, 500));
    }
  });
}).on('error', (e) => {
  console.log('❌ Request error:', e.message);
});