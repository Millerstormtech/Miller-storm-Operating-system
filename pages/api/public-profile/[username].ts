import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  name: String,
  email: String,
  role: String,
  phone: String,
  address: String,
  city: String,
  state: String,
  zip: String,
  bio: String,
  profileImage: String,
  socialLinks: Object,
  webPageData: Object,
});

const User = mongoose.models.User || mongoose.model('User', UserSchema);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username } = req.query;

  try {
    await connectMongo();
    const searchName = typeof username === 'string' ? username : String(username);
    
    const users = await User.find({});
    const user = users.find(u => {
      const normalizedDbName = u.name.toLowerCase().replace(/\s+/g, '');
      const normalizedSearchName = searchName.toLowerCase().replace(/\s+/g, '');
      return normalizedDbName === normalizedSearchName;
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (user.webPage?.status !== 'published') {
      return res.status(403).json({ error: 'Page not published' });
    }

    res.status(200).json(user);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}
