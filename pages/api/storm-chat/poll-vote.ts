import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import { requireUser, allowMethods } from '../../../src/lib/auth';
import { findReadableMessage } from '../../../src/lib/stormchat/messageAccess';

// Toggle the caller's vote on a poll message option.
// Body: { messageId, optionIndex }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['POST'])) return;
  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();

  const { messageId, optionIndex } = req.body || {};
  if (!messageId || typeof optionIndex !== 'number') {
    return res.status(400).json({ error: 'messageId and optionIndex are required' });
  }

  // Only someone who can read the poll's chat may vote (and see it back).
  const msg: any = await findReadableMessage(messageId, auth);
  if (!msg || msg.messageType !== 'poll' || !msg.poll) {
    return res.status(404).json({ error: 'Poll not found' });
  }

  const userId = auth.sub;
  const options = msg.poll.options || [];
  if (optionIndex < 0 || optionIndex >= options.length) {
    return res.status(400).json({ error: 'Invalid option' });
  }

  const already = (options[optionIndex].votes || []).includes(userId);

  if (already) {
    // Tapping your own choice again removes the vote.
    options[optionIndex].votes = options[optionIndex].votes.filter((u: string) => u !== userId);
  } else {
    // Single-choice polls clear the user's other votes first.
    if (!msg.poll.allowMultiple) {
      options.forEach((o: any) => { o.votes = (o.votes || []).filter((u: string) => u !== userId); });
    }
    options[optionIndex].votes = [...(options[optionIndex].votes || []), userId];
  }

  msg.markModified('poll');
  await msg.save();

  return res.status(200).json(msg);
}
