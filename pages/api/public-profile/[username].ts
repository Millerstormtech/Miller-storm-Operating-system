import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import mongoose from 'mongoose';
import { allowMethods } from '../../../src/lib/auth';

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
  if (!allowMethods(req, res, ['GET'])) return;

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

    // This endpoint is public (no login). Until 2026-09-10 it returned the whole
    // user document, i.e. passwordHash, fcmToken, managerId, featureToggles and
    // every internal flag, to anyone who guessed a published rep's name. Return
    // only what the public page (src/portals/sales/WebPagePreview.tsx) renders,
    // and honour the rep's own show* switches server-side rather than trusting
    // the page to hide a value it was handed.
    const show = user.publicProfile || {};
    const publicUser = {
      name: user.name,
      headshotUrl: show.showHeadshot === false ? '' : user.headshotUrl,
      email: show.showEmail === false ? '' : user.email,
      phone: show.showPhone === false ? '' : user.phone,
      bio: user.bio,
      missionTitle: user.missionTitle,
      missionBody: user.missionBody,
      missionCtaLabel: user.missionCtaLabel,
      missionImageUrl: user.missionImageUrl,
      whyUsTitle: user.whyUsTitle,
      whyUsBody: user.whyUsBody,
      expertRoofersTitle: user.expertRoofersTitle,
      expertRoofersBody: user.expertRoofersBody,
      marketingMaterialsNotes: user.marketingMaterialsNotes,
      webPage: user.webPage,
      publicProfile: {
        showHeadshot: show.showHeadshot ?? true,
        showEmail: show.showEmail ?? true,
        showPhone: show.showPhone ?? true,
      },
    };

    res.status(200).json(publicUser);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}
