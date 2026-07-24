// The Storm Bot celebration line, exactly as Youssef wrote it (2026-07-24).
// Pure and unit-tested so the copy can never drift silently. Colons, commas
// and parentheses only: never em dashes (app-wide copy rule).
export function celebrationMessage(
  name: string,
  courseTitle: string,
  coursesDone: number,
  totalCourses: number
): string {
  return `🎉 ${name.trim()} just passed the ${courseTitle.trim()} Course! That's ${coursesDone} of ${totalCourses} courses done. Let's goo!🔥`;
}
