async function testProgressSave() {
  const baseUrl = 'http://localhost:6790';
  const testUserId = 'ishitapatel3456@gmail.com';
  const testCourseId = 'course-1772692234004';
  
  console.log('🧪 Testing Progress Save API...');
  
  try {
    // Test saving progress
    console.log('1. Testing progress save...');
    const saveResponse = await fetch(`${baseUrl}/api/progress`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: testUserId,
        courseId: testCourseId,
        completedPages: ['page1', 'page2', 'page3'],
        courseCompleted: false
      })
    });
    
    if (saveResponse.ok) {
      const saveData = await saveResponse.json();
      console.log('✅ Progress saved successfully:', saveData.success);
    } else {
      console.log('❌ Save failed:', saveResponse.status, await saveResponse.text());
    }
    
    // Test fetching progress
    console.log('2. Testing progress fetch...');
    const fetchResponse = await fetch(`${baseUrl}/api/progress?userId=${testUserId}&courseId=${testCourseId}`);
    
    if (fetchResponse.ok) {
      const fetchData = await fetchResponse.json();
      console.log('✅ Progress fetched:', {
        completedPages: fetchData.completedPages?.length || 0,
        courseCompleted: fetchData.courseCompleted
      });
    } else {
      console.log('❌ Fetch failed:', fetchResponse.status, await fetchResponse.text());
    }
    
    // Test course progress API
    console.log('3. Testing course progress API...');
    const courseProgressResponse = await fetch(`${baseUrl}/api/course-progress?userId=${testUserId}&courseIds=${testCourseId}`);
    
    if (courseProgressResponse.ok) {
      const courseProgressData = await courseProgressResponse.json();
      console.log('✅ Course progress fetched:', Object.keys(courseProgressData));
    } else {
      console.log('❌ Course progress failed:', courseProgressResponse.status, await courseProgressResponse.text());
    }
    
  } catch (error) {
    console.error('❌ Test error:', error.message);
  }
}

testProgressSave();