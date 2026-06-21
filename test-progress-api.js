const https = require('https');

// Test progress API with live course ID
const userId = 'ishitapatel3456@gmail.com';
const courseId = 'course-1772692234004'; // Million Dollar Playbook

const url = `https://millerstorm.tech/api/progress?userId=${userId}&courseId=${courseId}`;

console.log('🔵 Testing progress API...');
console.log('🔵 URL:', url);

https.get(url, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('🔵 Status:', res.statusCode);
    try {
      const progress = JSON.parse(data);
      console.log('✅ Progress data:', progress);
      console.log('📊 Completed:', progress.completedPages?.length || 0);
      console.log('📊 Total:', progress.totalPages || 0);
      console.log('📊 Percent:', Math.round(((progress.completedPages?.length || 0) / (progress.totalPages || 1)) * 100) + '%');
    } catch (e) {
      console.log('❌ Error parsing response:', e.message);
      console.log('Response:', data);
    }
  });
}).on('error', (e) => {
  console.log('❌ Request error:', e.message);
});