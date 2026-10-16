import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../src/lib/mongodb';
import { requireUser, allowMethods } from '../../../src/lib/auth';
import { findReadableMessage } from '../../../src/lib/stormchat/messageAccess';
import ChatMessage from '../../../src/lib/models/ChatMessage';
import { pollEnded } from '../../../src/lib/stormchat/richMessages';
import { withPollViews } from '../../../src/lib/stormchat/pollViews';

// Toggle the caller's vote on a poll message option.
// Body: { messageId, optionIndex }
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['POST'])) return;
  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();

  const { messageId, optionIndex } = req.body || {};
  if (!messageId || !Number.isInteger(optionIndex)) {
    return res.status(400).json({ error: 'messageId and optionIndex are required' });
  }

  // Only someone who can read the poll's chat may vote (and see it back).
  const msg: any = await findReadableMessage(messageId, auth);
  if (!msg || msg.messageType !== 'poll' || !msg.poll) {
    return res.status(404).json({ error: 'Poll not found' });
  }

  if (pollEnded(msg.poll)) return res.status(400).json({ error: 'This poll has ended' });

  const userId = auth.sub;
  const options = msg.poll.options || [];
  if (optionIndex < 0 || optionIndex >= options.length) {
    return res.status(400).json({ error: 'Invalid option' });
  }

  // Each vote is a single add/remove on the database, never "read the whole
  // poll, change it, save it back": with that, people voting at the same
  // moment overwrote each other and most votes were lost (8 at once kept 1-2,
  // readiness test item 9).
  const votesPath = `poll.options.${optionIndex}.votes`;
  const removed = await ChatMessage.updateOne(
    { _id: msg._id, [votesPath]: userId },
    { $pull: { [votesPath]: userId } },
  );
  if (removed.modifiedCount === 0) {
    // Not voted for this option yet. A single-choice poll first clears the
    // person's vote elsewhere, then adds this one.
    if (!msg.poll.allowMultiple) {
      await ChatMessage.updateOne({ _id: msg._id }, { $pull: { 'poll.options.$[].votes': userId } });
    }
    await ChatMessage.updateOne({ _id: msg._id }, { $addToSet: { [votesPath]: userId } });
  }

  // Voter names, or nobody's id but yours in an anonymous poll.
  const after = await ChatMessage.findById(msg._id).lean();
  return res.status(200).json(after ? (await withPollViews([after as any], userId))[0] : after);
}
