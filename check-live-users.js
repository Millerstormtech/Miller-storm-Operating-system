async function checkLiveUsers() {
  console.log('🔍 Checking users on live server...');
  
  // Try some common user IDs that might exist
  const testUsers = [
    'ishitapatel3456@gmail.com',
    'sales-1',
    'admin-1',
    'manager-1',
    'chris.lee@company.com',
    'alex.morgan@company.com',
    'brooke.taylor@company.com',
    'dana.smith@company.com'
  ];
  
  for (const userId of testUsers) {
    try {
      console.log(`\n🧪 Testing user: ${userId}`);
      
      const response = await fetch(`https://millerstorm.tech/api/courses?userId=${userId}&userRole=sales`);
      const data = await response.json();
      
      if (Array.isArray(data) && data.length > 0) {
        console.log(`✅ User ${userId} has ${data.length} courses`);
        
        // Check progress for this user
        const courseIds = data.map(c => c.id).join(',');
        const progressResponse = await fetch(`https://millerstorm.tech/api/course-progress?userId=${userId}&courseIds=${courseIds}`);
        const progressData = await progressResponse.json();
        
        console.log('📊 Progress data:');
        Object.keys(progressData).forEach(courseId => {
          const course = data.find(c => c.id === courseId);
          const progress = progressData[courseId];
          const completedPages = progress.completedPages?.length || 0;
          const totalPages = course?.pages?.filter(p => p.status === 'published' && !p.isQuiz)?.length || 0;
          const percentage = totalPages > 0 ? Math.round((completedPages / totalPages) * 100) : 0;
          
          console.log(`  - ${course?.title || courseId}: ${percentage}% (${completedPages}/${totalPages}) - completed: ${progress.courseCompleted}`);
        });
      } else {
        console.log(`❌ User ${userId} has no courses or doesn't exist`);
      }
    } catch (error) {
      console.log(`❌ Error testing ${userId}:`, error.message);
    }
  }
}

checkLiveUsers();