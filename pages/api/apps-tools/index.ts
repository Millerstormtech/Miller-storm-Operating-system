import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import AppTool from '../../../src/lib/models/AppTool';
import AppToolCategory from '../../../src/lib/models/AppToolCategory';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();

  if (req.method === 'GET') {
    try {
      const { published } = req.query;
      const filter = published === 'true' ? { status: 'published' } : {};
      const appTools = await AppTool.find(filter).sort({ createdAt: -1 });
      
      // Populate category info for each item
      const itemsWithCategory = await Promise.all(
        appTools.map(async (item) => {
          const category = await AppToolCategory.findById(item.categoryId);
          return {
            ...item.toObject(),
            category: category?.slug || '',
            categoryName: category?.name || ''
          };
        })
      );
      
      return res.status(200).json(itemsWithCategory);
    } catch (error) {
      console.error('Error fetching apps/tools:', error);
      return res.status(500).json({ error: 'Failed to fetch apps/tools' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { title, imageUrl, imageWidth, imageHeight, description, link, webLink, appStoreLink, playStoreLink, category } = req.body;

      if (!title || !category) {
        return res.status(400).json({ error: 'Title and category are required' });
      }

      // Find category by slug to get ID
      const categoryDoc = await AppToolCategory.findOne({ slug: category });
      if (!categoryDoc) {
        return res.status(400).json({ error: 'Invalid category' });
      }

      const appTool = await AppTool.create({
        title,
        imageUrl: imageUrl || '',
        imageWidth: imageWidth || 400,
        imageHeight: imageHeight || 300,
        description: description || '',
        link: link || '',
        webLink: webLink || '',
        appStoreLink: appStoreLink || '',
        playStoreLink: playStoreLink || '',
        categoryId: categoryDoc._id,
        status: 'draft'
      });

      return res.status(201).json({
        ...appTool.toObject(),
        category: categoryDoc.slug,
        categoryName: categoryDoc.name
      });
    } catch (error) {
      console.error('Error creating app/tool:', error);
      return res.status(500).json({ error: 'Failed to create app/tool' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
