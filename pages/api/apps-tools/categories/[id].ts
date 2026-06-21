import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../../src/lib/mongodb';
import AppToolCategory from '../../../../src/lib/models/AppToolCategory';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();

  const { id } = req.query;

  if (req.method === 'PUT') {
    try {
      const { name, status } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Category name is required' });
      }

      // Create slug from name
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const updateData: any = { name, slug };
      if (status) {
        updateData.status = status;
      }

      // Update the category
      const category = await AppToolCategory.findByIdAndUpdate(
        id,
        updateData,
        { new: true }
      );

      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }

      res.status(200).json(category);
    } catch (error) {
      console.error('Error updating category:', error);
      res.status(500).json({ error: 'Failed to update category' });
    }
  } else if (req.method === 'DELETE') {
    try {
      const category = await AppToolCategory.findByIdAndDelete(id);

      if (!category) {
        return res.status(404).json({ error: 'Category not found' });
      }

      res.status(200).json({ message: 'Category deleted successfully' });
    } catch (error) {
      console.error('Error deleting category:', error);
      res.status(500).json({ error: 'Failed to delete category' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
