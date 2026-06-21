const https = require('https');

// Test course detail to see pages count
const courseId = 'course-1772692234004'; // Million Dollar Playbook

const url = `https://millerstorm.tech/api/courses/${courseId}?userId=ishitapatel3456@gmail.com`;

console.log('🔵 Testing course pages count...');
console.log('🔵 URL:', url);

https.get(url, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('🔵 Status:', res.statusCode);
    try {
      const course = JSON.parse(data);
      console.log('✅ Course:', course.title);
      console.log('📄 Pages count:', course.pages?.length || 0);
      console.log('📁 Folders count:', course.folders?.length || 0);
      console.log('📊 Progress:', course.progress);
      
      // Calculate like web does
      const totalPages = course.pages?.length || 0;
      console.log('🌐 Web calculation: totalPages =', totalPages);
      
      if (course.progress) {
        const webPercent = totalPages > 0 ? Math.round((course.progress.completedLessons / totalPages) * 100) : 0;
        console.log('🌐 Web would show:', webPercent + '%');
      }
    } catch (e) {
      console.log('❌ Error parsing response:', e.message);
      console.log('Response:', data.substring(0, 500));
    }
  });
}).on('error', (e) => {
  console.log('❌ Request error:', e.message);
});