import type { NextApiRequest, NextApiResponse } from 'next';
import mongoose from 'mongoose';
import { connectMongo } from '../../../src/lib/mongodb';
import ChatMessage from '../../../src/lib/models/ChatMessage';
import ChatGroup from '../../../src/lib/models/ChatGroup';
import { UserModel } from '../../../src/lib/models/User';
import { requireUser, allowMethods } from '../../../src/lib/auth';
import { isDmGroup } from '../../../src/lib/stormchat/isDm';
import { chatRights, isMemberOf, dmParticipants } from '../../../src/lib/stormchat/access';
import { viewerIdsFor } from '../../../src/lib/stormchat/viewer';
import { captionOf } from '../../../src/lib/stormchat/compose';
import { searchTerm, searchFilter, snippet, SEARCH_LIMIT } from '../../../src/lib/stormchat/findMessages';
import { rateLimit } from '../../../src/lib/rateLimit';

// GET /api/storm-chat/search?q=<words>[&groupId=<chat id>]
//
// Message search (GroupMe-style; Youssef, 2026-10-16).
// - With groupId: that one chat, for anyone who can read it.
// - Without: every chat you're a MEMBER of, your DMs included. Company Admins
//   too: only chats they joined, never other people's DMs.
// Newest 50 matches; deleted messages and system notices are never found.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['GET'])) return;
  const auth = requireUser(req, res);
  if (!auth) return;

  const term = searchTerm(req.query.q);
  if (!term) return res.status(400).json({ error: 'Type at least 2 characters to search' });

  const burst = rateLimit(`chat:search:${auth.sub}`, 30, 60_000);
  if (!burst.ok) {
    res.setHeader('Retry-After', String(burst.retryAfterSec));
    return res.status(429).json({ error: 'Too many searches at once. Try again in a few seconds.' });
  }

  try {
    await connectMongo();
    const myIds = await viewerIdsFor(auth.sub);

    let chats: any[];
    const groupId = typeof req.query.groupId === 'string' ? req.query.groupId : '';
    if (groupId) {
      const g = mongoose.isValidObjectId(groupId) ? await ChatGroup.findById(groupId).lean() as any : null;
      if (!g || !chatRights(g, myIds, auth.role, true).canRead) return res.status(404).json({ error: 'Chat not found' });
      chats = [g];
    } else {
      const candidates = await ChatGroup.find({ members: { $in: myIds } }).lean() as any[];
      // A DM counts only for its two real participants (dmKey), never a stray
      // id in its member list.
      chats = candidates.filter((g) =>
        isDmGroup(g) ? (dmParticipants(g) || []).some((p) => myIds.includes(String(p))) : isMemberOf(g, myIds));
    }
    if (!chats.length) return res.status(200).json([]);

    const byId = new Map(chats.map((g) => [String(g._id), g]));
    const found = await ChatMessage.find(searchFilter(Array.from(byId.keys()), term))
      .select('groupId senderId senderName message messageType poll createdAt')
      .sort({ createdAt: -1, _id: -1 })
      .limit(SEARCH_LIMIT)
      .lean() as any[];

    // A DM is named after the other person.
    const otherOf = (g: any) => (dmParticipants(g) || []).find((p) => !myIds.includes(String(p)));
    const otherIds = Array.from(new Set(
      found.map((m) => byId.get(String(m.groupId))).filter((g) => g && isDmGroup(g)).map(otherOf).filter(Boolean) as string[],
    )).filter((id) => mongoose.isValidObjectId(id));
    const others = otherIds.length ? await UserModel.find({ _id: { $in: otherIds } }, { _id: 1, name: 1 }).lean() as any[] : [];
    const nameById = new Map(others.map((u) => [String(u._id), u.name]));

    return res.status(200).json(found.map((m) => {
      const g = byId.get(String(m.groupId));
      const isDirect = isDmGroup(g);
      const type = String(m.messageType || 'text');
      const text = type === 'poll'
        ? `📊 ${m.poll?.question || m.message || 'Poll'}`
        : (captionOf(type, m.message) || (type === 'image' ? '📷 Photo' : type === 'video' ? '🎬 Video' : String(m.message || '')));
      return {
        _id: String(m._id),
        groupId: String(m.groupId),
        chatName: isDirect ? (nameById.get(String(otherOf(g))) || 'Direct message') : g?.name || 'Chat',
        isDirect,
        senderId: m.senderId,
        senderName: m.senderName,
        messageType: type,
        snippet: snippet(text, term),
        createdAt: m.createdAt,
      };
    }));
  } catch (error) {
    console.error('Error searching messages:', error);
    return res.status(500).json({ error: 'Search failed' });
  }
}
