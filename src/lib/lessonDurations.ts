// Fills in missing lesson lengths from Vimeo (2026-09-13). Uses Vimeo's public
// oEmbed endpoint: no API key, no cost. Called fire-and-forget after every
// Course Builder save (pages/api/courses/bulk.ts), so a slow or failed lookup
// never slows or breaks a save, and the next save simply tries again.
import { CourseModel } from "./models/Course";
import { vimeoRefOf, vimeoOembedUrl } from "./training/vimeo-oembed";

const TIMEOUT_MS = 5000;

/** Seconds from Vimeo's oEmbed reply, or null when Vimeo cannot say. Never throws. */
export async function fetchVimeoDurationSeconds(url: string): Promise<number | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data: any = await res.json();
    return typeof data?.duration === "number" && data.duration > 0 ? data.duration : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * For every Vimeo lesson in these courses that has no length yet, look it up
 * and store it on that one page. Each page is written on its own with an array
 * filter, so this never rewrites a course a rep or admin is saving at the same
 * moment. Returns how many lengths were filled.
 */
export async function fillMissingDurations(courseIds: string[]): Promise<number> {
  if (!courseIds.length) return 0;
  const courses: any[] = await CourseModel.find({ id: { $in: courseIds } })
    .select("id pages.id pages.isQuiz pages.videoUrl pages.body pages.durationSeconds")
    .lean();

  let filled = 0;
  for (const course of courses) {
    for (const page of course.pages || []) {
      if (page.isQuiz || (typeof page.durationSeconds === "number" && page.durationSeconds > 0)) continue;
      const ref = vimeoRefOf(page.videoUrl, page.body);
      if (!ref) continue;
      const seconds = await fetchVimeoDurationSeconds(vimeoOembedUrl(ref));
      if (!seconds) continue;
      await CourseModel.updateOne(
        { id: course.id },
        { $set: { "pages.$[p].durationSeconds": seconds } },
        { arrayFilters: [{ "p.id": page.id }] }
      );
      filled++;
    }
  }
  return filled;
}
