const http = require('http');

// Test with sales user
const userId = 'sales-1';
const userRole = 'sales';

const url = `http://localhost:6790/api/courses?userId=${userId}&userRole=${userRole}`;

console.log('🔵 Testing LOCAL courses API...');
console.log('🔵 URL:', url);

http.get(url, (res) => {
  let data = '';
  
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('🔵 Status:', res.statusCode);
    try {
      const courses = JSON.parse(data);
      console.log('✅ Courses returned:', courses.length);
      courses.forEach(course => {
        console.log('  -', course.title, '(status:', course.status, ', accessMode:', course.accessMode + ')');
      });
    } catch (e) {
      console.log('❌ Error parsing response:', e.message);
      console.log('Response:', data.substring(0, 200));
    }
  });
}).on('error', (e) => {
  console.log('❌ Request error:', e.message);
});
