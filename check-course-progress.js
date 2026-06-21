const { MongoClient } = require('mongodb');

const MONGODB_URI = 'mongodb://localhost:27017/millerstorm';
const MANAGER_EMAIL = 'm2@gmail.com';

async function main() {
  const client = new MongoClient(MONGODB_URI);
  await client.connect();
  const db = client.db('millerstorm');

  // 1. Find the manager user
  const user = await db.collection('users').findOne({ email: MANAGER_EMAIL });
  if (!user) {
    console.log('❌ User not found:', MANAGER_EMAIL);
    await client.close();
    return;
  }
  console.log(`\n✅ User found: ${user.name} (id: ${user._id})`);

  // 2. Find "New Course 1"
  const course = await db.collection('courses').findOne({ title: /new course 1/i });
  if (!course) {
    console.log('❌ Course "New Course 1" not found');
    await client.close();
    return;
  }
  console.log(`\n✅ Course found: "${course.title}" (id: ${course._id})`);

  // 3. Show all pages in the course
  const allPages = course.pages || [];
  const lessonPages = allPages.filter(p => p.status === 'published' && !p.isQuiz);
  const quizPages = allPages.filter(p => p.status === 'published' && p.isQuiz);
  console.log(`\n📄 Total pages: ${allPages.length}`);
  console.log(`   Lesson pages (non-quiz, published): ${lessonPages.length}`);
  console.log(`   Quiz pages: ${quizPages.length}`);
  console.log('\n   Lesson pages:');
  lessonPages.forEach((p, i) => console.log(`     ${i+1}. [${p.id}] ${p.title}`));
  if (quizPages.length > 0) {
    console.log('\n   Quiz pages:');
    quizPages.forEach((p, i) => console.log(`     ${i+1}. [${p.id}] ${p.title}`));
  }

  // 4. Find UserProgress for this user+course
  const userId = user._id.toString();
  const courseId = course._id.toString();

  const progress = await db.collection('userprogresses').findOne({ userId, courseId });
  if (!progress) {
    console.log(`\n⚠️  No UserProgress record found for userId=${userId}, courseId=${courseId}`);
  } else {
    console.log(`\n📊 UserProgress record:`);
    console.log(`   courseCompleted: ${progress.courseCompleted}`);
    console.log(`   completedPages (${progress.completedPages?.length || 0}):`, progress.completedPages);

    const completedLessons = (progress.completedPages || []).filter(id =>
      lessonPages.some(p => p.id === id)
    );
    console.log(`\n   Completed lesson pages: ${completedLessons.length} / ${lessonPages.length}`);
    console.log(`   Progress %: ${lessonPages.length > 0 ? Math.round((completedLessons.length / lessonPages.length) * 100) : 0}%`);
  }

  // 5. Also check CourseProgress collection (old one)
  const oldProgress = await db.collection('courseprogresses').findOne({ userId, courseId });
  if (oldProgress) {
    console.log(`\n⚠️  Old CourseProgress record also exists:`);
    console.log(`   lessonsCompleted: ${oldProgress.lessonsCompleted?.length || 0}`);
    console.log(`   completionPercentage: ${oldProgress.completionPercentage}`);
  } else {
    console.log(`\n✅ No old CourseProgress record (good - using UserProgress)`);
  }

  // 6. Explain the 58% dashboard number
  console.log(`\n--- Dashboard "58%" explanation ---`);
  console.log(`The "Your Online Course Completion" card uses getManagerCourseCompletion()`);
  console.log(`which is a FAKE/RANDOM number based on user+course char codes, NOT real DB data.`);
  console.log(`It is NOT connected to actual progress. That's why it shows 58%.`);

  await client.close();
}

main().catch(console.error);
