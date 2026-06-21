import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import { CourseModel } from '../../../src/lib/models/Course';
import MarketingMaterial from '../../../src/lib/models/MarketingMaterial';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  await connectMongo();

  try {
    // Get all courses (not just published, for debugging)
    const courses = await CourseModel.find({}).lean();
    console.log(`[SYNC] Found ${courses.length} total courses`);
    
    // Log course details
    courses.forEach(course => {
      console.log(`[SYNC] Course: ${course.title} (${course.id})`);
      console.log(`  - Status: ${course.status}`);
      console.log(`  - Pages: ${course.pages?.length || 0}`);
      if (course.pages) {
        course.pages.forEach((page: any) => {
          console.log(`    - Page: ${page.title} (${page.id})`);
          console.log(`      - Status: ${page.status}`);
          console.log(`      - Video URL: ${page.videoUrl || 'none'}`);
          console.log(`      - Resource Links: ${page.resourceLinks?.length || 0}`);
          console.log(`      - File URLs: ${page.fileUrls?.length || 0}`);
          console.log(`      - Body length: ${page.body?.length || 0}`);
        });
      }
    });
    
    // Clear existing materials
    await MarketingMaterial.deleteMany({});
    console.log('[SYNC] Cleared existing materials');
    
    const materials: any[] = [];
    const publishedCourses = courses.filter(c => c.status === 'published');
    console.log(`[SYNC] Processing ${publishedCourses.length} published courses`);

    // Extract materials from each course
    for (const course of publishedCourses) {
      if (!course.pages || course.pages.length === 0) {
        console.log(`[SYNC] Course ${course.title} has no pages, skipping`);
        continue;
      }

      console.log(`[SYNC] Processing course: ${course.title}`);

      for (const page of course.pages) {
        // Skip draft pages
        if (page.status === 'draft') {
          console.log(`[SYNC]   Skipping draft page: ${page.title}`);
          continue;
        }

        console.log(`[SYNC]   Processing page: ${page.title}`);

        // Extract video URL
        if (page.videoUrl) {
          console.log(`[SYNC]     Found video URL: ${page.videoUrl}`);
          materials.push({
            courseId: course.id,
            courseName: course.title,
            pageId: page.id,
            pageName: page.title,
            type: 'video',
            url: page.videoUrl,
            title: `${page.title} - Video`,
            description: `Video content from ${course.title}`
          });
        }

        // Extract images from body (looking for img tags)
        if (page.body) {
          const imgRegex = /<img[^>]+src="([^">]+)"/g;
          let match;
          let imgIndex = 1;
          while ((match = imgRegex.exec(page.body)) !== null) {
            console.log(`[SYNC]     Found image in body: ${match[1]}`);
            materials.push({
              courseId: course.id,
              courseName: course.title,
              pageId: page.id,
              pageName: page.title,
              type: 'image',
              url: match[1],
              title: `${page.title} - Image ${imgIndex}`,
              description: `Image from ${course.title}`
            });
            imgIndex++;
          }
        }

        // Extract resource links
        if (page.resourceLinks && page.resourceLinks.length > 0) {
          console.log(`[SYNC]     Found ${page.resourceLinks.length} resource links`);
          for (const link of page.resourceLinks) {
            console.log(`[SYNC]       Link: ${link.label} -> ${link.href}`);
            materials.push({
              courseId: course.id,
              courseName: course.title,
              pageId: page.id,
              pageName: page.title,
              type: 'url',
              url: link.href,
              title: link.label || 'Resource Link',
              description: `Link from ${page.title}`
            });
          }
        }

        // Extract file URLs
        if (page.fileUrls && page.fileUrls.length > 0) {
          console.log(`[SYNC]     Found ${page.fileUrls.length} file URLs`);
          for (const fileItem of page.fileUrls) {
            const fileUrl = typeof fileItem === 'string' ? fileItem : fileItem.href;
            const fileLabel = typeof fileItem === 'string' ? fileItem.split('/').pop() || 'File' : fileItem.label;
            const isImage = /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(fileUrl);
            const isVideo = /\.(mp4|webm|ogg|mov)$/i.test(fileUrl);
            const isDocument = /\.(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|csv)$/i.test(fileUrl);
            console.log(`[SYNC]       File: ${fileUrl} (${isImage ? 'image' : isVideo ? 'video' : isDocument ? 'document' : 'url'})`);
            
            materials.push({
              courseId: course.id,
              courseName: course.title,
              pageId: page.id,
              pageName: page.title,
              type: isImage ? 'image' : isVideo ? 'video' : isDocument ? 'document' : 'url',
              url: fileUrl,
              title: fileLabel,
              description: `File from ${page.title}`
            });
          }
        }
      }
    }

    console.log(`[SYNC] Total materials extracted: ${materials.length}`);

    // Insert all materials
    if (materials.length > 0) {
      const inserted = await MarketingMaterial.insertMany(materials);
      console.log(`[SYNC] Successfully inserted ${inserted.length} materials`);
    } else {
      console.log('[SYNC] No materials to insert');
    }

    return res.status(200).json({ 
      message: 'Marketing materials synced successfully',
      count: materials.length,
      details: {
        totalCourses: courses.length,
        publishedCourses: publishedCourses.length,
        materialsExtracted: materials.length
      }
    });
  } catch (error) {
    console.error('Error syncing marketing materials:', error);
    return res.status(500).json({ error: 'Failed to sync marketing materials' });
  }
}
