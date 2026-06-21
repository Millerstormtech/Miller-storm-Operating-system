import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../../src/lib/mongodb';
import AppToolCategory from '../../../../src/lib/models/AppToolCategory';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();

  if (req.method === 'GET') {
    try {
      const categories = await AppToolCategory.find().sort({ order: 1 });
      res.status(200).json(categories);
    } catch (error) {
      console.error('Error fetching categories:', error);
      res.status(500).json({ error: 'Failed to fetch categories' });
    }
  } else if (req.method === 'POST') {
    try {
      const { name, order, status } = req.body;
      
      if (!name) {
        return res.status(400).json({ error: 'Category name is required' });
      }

      // Create slug from name
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

      const category = await AppToolCategory.create({
        name,
        slug,
        order: order || 0,
        status: status || 'draft'
      });

      res.status(201).json(category);
    } catch (error) {
      console.error('Error creating category:', error);
      res.status(500).json({ error: 'Failed to create category' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
