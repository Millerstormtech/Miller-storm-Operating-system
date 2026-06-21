import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import AppTool from '../../../src/lib/models/AppTool';
import AppToolCategory from '../../../src/lib/models/AppToolCategory';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();

  const { id } = req.query;

  if (req.method === 'GET') {
    try {
      const appTool = await AppTool.findById(id);

      if (!appTool) {
        return res.status(404).json({ error: 'App/Tool not found' });
      }

      const category = await AppToolCategory.findById(appTool.categoryId);
      return res.status(200).json({
        ...appTool.toObject(),
        category: category?.slug || '',
        categoryName: category?.name || ''
      });
    } catch (error) {
      console.error('Error fetching app/tool:', error);
      return res.status(500).json({ error: 'Failed to fetch app/tool' });
    }
  }

  if (req.method === 'PUT') {
    try {
      const { title, imageUrl, imageWidth, imageHeight, description, link, webLink, appStoreLink, playStoreLink, category, status } = req.body;

      const updateData: any = { title, imageUrl, imageWidth, imageHeight, description, link, webLink, appStoreLink, playStoreLink, status };
      
      // If category is provided, convert slug to ID
      if (category) {
        const categoryDoc = await AppToolCategory.findOne({ slug: category });
        if (categoryDoc) {
          updateData.categoryId = categoryDoc._id;
        }
      }

      const appTool = await AppTool.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      );

      if (!appTool) {
        return res.status(404).json({ error: 'App/Tool not found' });
      }

      const categoryDoc = await AppToolCategory.findById(appTool.categoryId);
      return res.status(200).json({
        ...appTool.toObject(),
        category: categoryDoc?.slug || '',
        categoryName: categoryDoc?.name || ''
      });
    } catch (error) {
      console.error('Error updating app/tool:', error);
      return res.status(500).json({ error: 'Failed to update app/tool' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      const appTool = await AppTool.findByIdAndDelete(id);

      if (!appTool) {
        return res.status(404).json({ error: 'App/Tool not found' });
      }

      return res.status(200).json({ message: 'App/Tool deleted successfully' });
    } catch (error) {
      console.error('Error deleting app/tool:', error);
      return res.status(500).json({ error: 'Failed to delete app/tool' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
