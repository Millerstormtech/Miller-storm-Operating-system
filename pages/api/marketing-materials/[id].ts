import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import MarketingMaterial from '../../../src/lib/models/MarketingMaterial';
import { requireRole, allowMethods } from '../../../src/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['DELETE'])) return;

  await connectMongo();

  const { id } = req.query;

  if (req.method === 'DELETE') {
    if (!requireRole(req, res, 'admin')) return;
    try {
      const material = await MarketingMaterial.findByIdAndDelete(id);

      if (!material) {
        return res.status(404).json({ error: 'Material not found' });
      }

      return res.status(200).json({ message: 'Material deleted successfully' });
    } catch (error) {
      console.error('Error deleting marketing material:', error);
      return res.status(500).json({ error: 'Failed to delete marketing material' });
    }
  }
}
