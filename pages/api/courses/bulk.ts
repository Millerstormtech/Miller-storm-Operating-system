import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { CourseModel } from "../../../src/lib/models/Course";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const startTime = Date.now();
  
  try {
    await connectMongo();

    if (req.method !== "PUT") {
      res.setHeader("Allow", "PUT");
      res.status(405).end();
      return;
    }

    const courses = Array.isArray(req.body) ? req.body : req.body?.courses;
    if (!Array.isArray(courses)) {
      res.status(400).json({ error: "Invalid payload" });
      return;
    }

    console.log(`[Bulk Save] Saving ${courses.length} courses`);

    // Migrate fileUrls from string[] to LessonLink[] format
    const migratedCourses = courses.map(course => {
      if (course.pages && Array.isArray(course.pages)) {
        course.pages = course.pages.map((page: any) => {
          if (page.fileUrls && Array.isArray(page.fileUrls)) {
            page.fileUrls = page.fileUrls.map((fileUrl: any) => {
              if (typeof fileUrl === 'object' && fileUrl.label && fileUrl.href) {
                return fileUrl;
              }
              if (typeof fileUrl === 'string') {
                const fileName = fileUrl.split('/').pop() || 'File';
                return { label: fileName, href: fileUrl };
              }
              return { label: 'File', href: String(fileUrl) };
            });
          }
          return page;
        });
      }
      return course;
    });

    // Use bulkWrite for better performance
    const bulkOps = migratedCourses.map((course) => ({
      updateOne: {
        filter: { id: course.id },
        update: { $set: course },
        upsert: true
      }
    }));

    await CourseModel.bulkWrite(bulkOps);

    // Return only the saved courses
    const savedCourses = await CourseModel.find({ 
      id: { $in: migratedCourses.map(c => c.id) } 
    }).lean();

    const duration = Date.now() - startTime;
    console.log(`[Bulk Save] Successfully saved ${savedCourses.length} courses in ${duration}ms`);
    
    res.status(200).json(savedCourses);
  } catch (error) {
    console.error('[Bulk Save] Error:', error);
    res.status(500).json({ error: 'Failed to save courses' });
  }
}
