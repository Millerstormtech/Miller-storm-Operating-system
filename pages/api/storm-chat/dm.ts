import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import ChatGroup from '../../../src/lib/models/ChatGroup';
import { UserModel } from '../../../src/lib/models/User';
import { requireUser, allowMethods } from '../../../src/lib/auth';

// Get-or-create a 1-on-1 direct message (DM) thread between the current user and
// a target user. Any authenticated user (including sales) can start a DM with
// anyone. A DM is just a ChatGroup with isDirect=true and exactly 2 members; the
// canonical dmKey (sorted member ids) guarantees a single thread per pair.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['POST'])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();

  try {
    const { userId: targetIdRaw } = req.body || {};
    if (!targetIdRaw) return res.status(400).json({ error: 'userId is required' });

    // Resolve both users to their Mongo _id (group.members store _ids).
    const me = await UserModel.findOne({ id: auth.sub }, { _id: 1, name: 1 }).lean() as any;
    if (!me?._id) return res.status(404).json({ error: 'Current user not found' });

    // The target id from the client may be a Mongo _id or the app id.
    const target = await UserModel.findOne(
      { $or: [{ id: targetIdRaw }, ...(String(targetIdRaw).match(/^[a-f0-9]{24}$/i) ? [{ _id: targetIdRaw }] : [])] },
      { _id: 1, name: 1, headshotUrl: 1, role: 1 }
    ).lean() as any;
    if (!target?._id) return res.status(404).json({ error: 'User not found' });

    const myId = me._id.toString();
    const otherId = target._id.toString();
    if (myId === otherId) return res.status(400).json({ error: "You can't message yourself" });

    const dmKey = [myId, otherId].sort().join('__');

    let group = await ChatGroup.findOne({ dmKey });
    if (!group) {
      group = await ChatGroup.create({
        // Placeholder — the schema requires a non-empty name, but clients always
        // display the OTHER participant's name (dmOther), so this is never shown.
        name: 'Direct Message',
        description: '',
        imageUrl: '',
        members: [myId, otherId],
        admins: [],
        onlyAdminCanChat: false,
        createdBy: myId,
        order: 0,
        parentGroupId: '',
        isDirect: true,
        dmKey,
      });
    }

    // Enrich with the other participant's display info so the client can render
    // the DM tile/header without another lookup.
    const g = group.toObject();
    return res.status(200).json({
      ...g,
      dmOther: { _id: otherId, name: target.name, imageUrl: target.headshotUrl || '', role: target.role },
    });
  } catch (error) {
    console.error('Error creating DM:', error);
    return res.status(500).json({ error: 'Failed to open direct message' });
  }
}
