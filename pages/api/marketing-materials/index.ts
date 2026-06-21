import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import MarketingMaterial from '../../../src/lib/models/MarketingMaterial';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();

  if (req.method === 'GET') {
    try {
      const materials = await MarketingMaterial.find({}).sort({ createdAt: -1 });
      return res.status(200).json(materials);
    } catch (error) {
      console.error('Error fetching marketing materials:', error);
      return res.status(500).json({ error: 'Failed to fetch marketing materials' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { courseId, courseName, pageId, pageName, type, url, title, description } = req.body;

      if (!courseId || !courseName || !pageId || !pageName || !type || !url) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const material = await MarketingMaterial.create({
        courseId,
        courseName,
        pageId,
        pageName,
        type,
        url,
        title: title || '',
        description: description || ''
      });

      return res.status(201).json(material);
    } catch (error) {
      console.error('Error creating marketing material:', error);
      return res.status(500).json({ error: 'Failed to create marketing material' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
