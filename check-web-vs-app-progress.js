async function checkWebVsAppProgress() {
  const userId = 'sales-1'; // Use existing user from database
  const userRole = 'sales';
  
  console.log('🔍 Checking Web vs App Progress for:', userId);
  console.log('='.repeat(60));
  
  try {
    // 1. Get courses from app API (what app uses)
    console.log('📱 Getting courses from APP API...');
    const appResponse = await fetch(`https://millerstorm.tech/api/courses?userId=${userId}&userRole=${userRole}`);
    const appCourses = await appResponse.json();
    
    console.log('📱 App courses:');
    appCourses.forEach(course => {
      const progress = course.progress || {};
      console.log(`  - ${course.title}: ${progress.progressPercent || 0}% (${progress.completedLessons || 0}/${progress.totalLessons || 0})`);
    });
    
    console.log('\n' + '='.repeat(60));
    
    // 2. Get progress from web's course-progress API (what web uses)
    console.log('🌐 Getting progress from WEB course-progress API...');
    const courseIds = appCourses.map(c => c.id).join(',');
    const webProgressResponse = await fetch(`https://millerstorm.tech/api/course-progress?userId=${userId}&courseIds=${courseIds}`);
    const webProgressData = await webProgressResponse.json();
    
    console.log('🌐 Web course-progress data:');
    Object.keys(webProgressData).forEach(courseId => {
      const course = appCourses.find(c => c.id === courseId);
      const progressData = webProgressData[courseId];
      const completedPages = progressData.completedPages?.length || 0;
      const totalPages = course?.pages?.filter(p => p.status === 'published' && !p.isQuiz)?.length || 0;
      const percentage = totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;
      
      console.log(`  - ${course?.title || courseId}: ${percentage}% (${completedPages}/${totalPages}) - courseCompleted: ${progressData.courseCompleted}`);
    });
    
    console.log('\n' + '='.repeat(60));
    
    // 3. Check individual progress API calls
    console.log('🔍 Checking individual progress API calls...');
    for (const course of appCourses) {
      const progressResponse = await fetch(`https://millerstorm.tech/api/progress?userId=${userId}&courseId=${course.id}`);
      const progressData = await progressResponse.json();
      
      const lessonPages = course.pages?.filter(p => p.status === 'published' && !p.isQuiz) || [];
      const completedPages = progressData.completedPages?.length || 0;
      const percentage = lessonPages.length > 0 ? Math.round((completedPages / lessonPages.length) * 100) : 0;
      
      console.log(`  - ${course.title}: ${percentage}% (${completedPages}/${lessonPages.length}) - courseCompleted: ${progressData.courseCompleted}`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

checkWebVsAppProgress();