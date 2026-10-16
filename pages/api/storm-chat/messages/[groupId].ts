import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../../src/lib/mongodb';
import ChatMessage from '../../../../src/lib/models/ChatMessage';
import ChatGroup from '../../../../src/lib/models/ChatGroup';
import { UserModel } from '../../../../src/lib/models/User';
import { NotificationModel } from '../../../../src/lib/models/Notification';
import { sendPushNotificationToMultiple } from '../../../../src/lib/firebase-admin';
import { logToDb } from '../../../../src/lib/models/SystemLog';
import { requireUser, allowMethods } from '../../../../src/lib/auth';
import { isDmGroup } from '../../../../src/lib/stormchat/isDm';
import { canReadMessages, canSendMessage, isGroupAdmin, canModerateMessages, chatRights, dmParticipants } from '../../../../src/lib/stormchat/access';
import { appIdsForMongoIds } from '../../../../src/lib/stormchat/appIds';
import { findReadableMessage } from '../../../../src/lib/stormchat/messageAccess';
import { userMessageType, replyQuoteFrom, messageProblem, attachmentProblem, alertPreview, SEND_BURST } from '../../../../src/lib/stormchat/compose';
import { rateLimit } from '../../../../src/lib/rateLimit';
import { mentionedIds, mentionsAll, alertPlan } from '../../../../src/lib/stormchat/mentions';
import { editProblem, tombstoneUpdate, DELETED_QUOTE } from '../../../../src/lib/stormchat/messageChanges';
import { activeMutedIds } from '../../../../src/lib/stormchat/mute';
import { galleryFilter, isGalleryKind, GALLERY_PAGE } from '../../../../src/lib/stormchat/findMessages';
import mongoose from 'mongoose';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH', 'DELETE'])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();

  const { groupId } = req.query;
  // A malformed id is "not found", not a server error.
  if (typeof groupId !== 'string' || !mongoose.isValidObjectId(groupId)) {
    return res.status(404).json({ error: 'Group not found' });
  }

  if (req.method === 'GET') {
    // Get messages for a group
    try {
      // Check if group exists
      // .lean() returns the raw doc so newly-added fields like isDirect are
      // present even if a long-running server holds a stale compiled model.
      const group = await ChatGroup.findById(groupId).lean() as any;
      if (!group) {
        await logToDb('error', 'STORM-CHAT', `Group not found: ${groupId}`);
        return res.status(404).json({ error: 'Group not found' });
      }

      // Admin "View As": an admin may read as another user by passing ?userId=.
      // Ignored for everyone else, so a normal user can never read a DM they are
      // not in. During impersonation the effective identity/role is the
      // impersonated user's — NOT the admin's — so the admin sees exactly that
      // user's view (and gets no admin override on a DM either).
      const requestedId = typeof req.query.userId === 'string' ? req.query.userId : '';
      const effectiveUserId =
        requestedId && requestedId !== auth.sub && auth.role === 'admin' ? requestedId : auth.sub;

      // effectiveUserId is the app id (e.g. "user-123") but group.members/admins
      // store Mongo _ids — resolve the _id so membership matches either form.
      const me = await UserModel.findOne({ id: effectiveUserId }, { _id: 1, role: 1 }).lean() as any;
      const myIds = [effectiveUserId, me?._id?.toString()].filter(Boolean) as string[];
      const effectiveRole = effectiveUserId === auth.sub ? auth.role : me?.role;
      // View As never opens someone's private DMs (Youssef, 2026-10-15): DMs
      // stay between their two people, admins included.
      if (effectiveUserId !== auth.sub && isDmGroup(group)) {
        return res.status(403).json({ error: 'Direct messages are private, even in View As' });
      }

      // DM: only the two canonical participants (dmKey). Group: members, or a
      // system admin. Enforced by the shared, unit-tested helper.
      if (!canReadMessages(group, myIds, effectiveRole?.toString())) {
        return res.status(403).json({ error: 'You are not a member of this group' });
      }

      // Take the NEWEST 500 (sort desc + limit), then flip back to ascending for
      // the client. The old `sort({createdAt:1}).limit(500)` returned the OLDEST
      // 500 — so any group past 500 messages never showed recent chat. Uses the
      // existing {groupId, createdAt:-1} index; .lean() skips Mongoose hydration
      // of 500 docs on every 3s poll (same JSON shape — no toJSON transforms).
      //
      // Paging (readiness test item 12: older messages were unreachable):
      //   ?limit=N          newest N (1-500). With no options: newest 500, as
      //                     before, so older app builds keep working.
      //   ?beforeId=<id>    the N messages just before that one (scroll up).
      //   ?pinned=1         every pinned message in the chat, newest pin first.
      // Gallery (GroupMe-style): ?media=photos|files|links, newest first,
      // GALLERY_PAGE at a time; ?beforeId=<id> continues from that item.
      if (req.query.media !== undefined) {
        const kind = req.query.media;
        if (!isGalleryKind(kind)) return res.status(400).json({ error: 'Unknown gallery tab' });
        const filter: any = { groupId, ...galleryFilter(kind) };
        const beforeId = typeof req.query.beforeId === 'string' ? req.query.beforeId : '';
        if (beforeId) {
          const ref = mongoose.isValidObjectId(beforeId)
            ? await ChatMessage.findOne({ _id: beforeId, groupId }).select('createdAt').lean() as any
            : null;
          if (!ref) return res.status(200).json([]);
          filter.$or = [
            { createdAt: { $lt: ref.createdAt } },
            { createdAt: ref.createdAt, _id: { $lt: ref._id } },
          ];
        }
        const items = await ChatMessage.find(filter)
          .select('messageType mediaUrl message senderName createdAt')
          .sort({ createdAt: -1, _id: -1 })
          .limit(GALLERY_PAGE)
          .lean();
        return res.status(200).json(items);
      }

      const rawLimit = parseInt(String(req.query.limit || ''), 10);
      const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 500) : 500;
      let messages: any[];
      if (req.query.pinned === '1') {
        messages = await ChatMessage.find({ groupId, pinned: true })
          .sort({ pinnedAt: -1 })
          .limit(100)
          .lean() as any[];
      } else {
        const filter: any = { groupId };
        const beforeId = typeof req.query.beforeId === 'string' ? req.query.beforeId : '';
        if (beforeId) {
          const ref = mongoose.isValidObjectId(beforeId)
            ? await ChatMessage.findOne({ _id: beforeId, groupId }).select('createdAt').lean() as any
            : null;
          if (!ref) return res.status(200).json([]);
          // Strictly older, with _id breaking ties between equal timestamps.
          filter.$or = [
            { createdAt: { $lt: ref.createdAt } },
            { createdAt: ref.createdAt, _id: { $lt: ref._id } },
          ];
        }
        messages = await ChatMessage.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .limit(limit)
          .lean() as any[];
        messages.reverse();
      }

      // Attach each sender's current avatar (headshotUrl) so message bubbles show
      // the person's uploaded photo, not just initials. One lookup for all distinct
      // senders; the photo is resolved live (not stored on the message) so a later
      // photo change is reflected everywhere.
      const senderIds = Array.from(new Set(messages.map((m) => m.senderId).filter(Boolean)));
      if (senderIds.length) {
        const senders = await UserModel.find(
          { id: { $in: senderIds } },
          { _id: 0, id: 1, headshotUrl: 1 }
        ).lean() as any[];
        const headshotById = new Map(senders.map((s) => [s.id, s.headshotUrl || '']));
        for (const m of messages) {
          m.senderHeadshotUrl = headshotById.get(m.senderId) || '';
        }
      }

      res.status(200).json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  } else if (req.method === 'POST') {
    // Send a message
    try {
      // The app also sends senderName / replyToMessage / replyToSender, but
      // they are NOT trusted: the name comes from the sender's account and a
      // reply quote from the real original (src/lib/stormchat/compose.ts).
      const { message, mediaUrl, replyTo, poll } = req.body;
      const senderId = auth.sub;
      const senderRole = auth.role;

      // People send text/image/video/file/poll; grey "system" notices are the
      // server's alone.
      const messageType = userMessageType(req.body.messageType);
      if (!messageType) {
        return res.status(400).json({ error: "That kind of message can't be sent" });
      }

      // No empty text, at most 2,000 characters, polls need 2-10 options.
      const problem = messageProblem(messageType, message, poll) || attachmentProblem(messageType, mediaUrl);
      if (problem) return res.status(400).json({ error: problem });

      await logToDb('info', 'STORM-CHAT', `📩 New message request for group: ${groupId}`, { senderId, messageType });

      // Check if group exists
      // .lean() returns the raw doc so newly-added fields like isDirect are
      // present even if a long-running server holds a stale compiled model.
      const group = await ChatGroup.findById(groupId).lean() as any;
      if (!group) {
        await logToDb('error', 'STORM-CHAT', `Group not found: ${groupId}`);
        return res.status(404).json({ error: 'Group not found' });
      }

      // Resolve sender _id (group.members store Mongo _ids; senderId is app id)
      // and their real name, which is what everyone sees (GroupMe: your name
      // is your account's).
      const sender = await UserModel.findOne({ id: senderId }, { _id: 1, name: 1 }).lean() as any;
      if (!sender) {
        return res.status(403).json({ error: 'Your account was not found' });
      }
      const senderName: string = sender.name || 'Unknown';
      const senderIds = [senderId, sender?._id?.toString()].filter(Boolean) as string[];

      // Send authorization (unit-tested in access.test.ts): for a DM, ONLY the
      // two canonical participants (from dmKey) may send — never a polluted
      // members[] entry, never an admin override. For a group, a member or a
      // system admin may send.
      if (!canSendMessage(group, senderIds, senderRole?.toString())) {
        return res.status(403).json({ error: 'You are not a member of this group' });
      }

      // Admin-only group: only its group admins (and company Admins) may post.
      // Job titles like C-level grant nothing here (GroupMe model).
      if (group.onlyAdminCanChat && !isDmGroup(group) && !isGroupAdmin(group, senderIds, senderRole)) {
        return res.status(403).json({ error: 'Only admins can send messages in this group' });
      }

      // At most 10 messages per 10 seconds from one person into one chat
      // (a burst of 100 once produced 900 alerts). Per chat, so forwarding
      // one message to many people still works.
      const burst = rateLimit(`chat:send:${senderId}:${groupId}`, SEND_BURST.max, SEND_BURST.windowMs);
      if (!burst.ok) {
        res.setHeader('Retry-After', String(burst.retryAfterSec));
        return res.status(429).json({ error: 'Slow down: too many messages at once. Try again in a few seconds.' });
      }

      // Extract mentions from message text
      const mentionedUserIds: string[] = [];
      // @mentions in text and in photo / video captions.
      if (message && (messageType === 'text' || messageType === 'image' || messageType === 'video')) {
        // Import User model
        const { UserModel } = await import('../../../../src/lib/models/User');
        
        // Who can be mentioned: the group's members, or in a DM ONLY its two
        // canonical participants, so a stray id in members[] can never be
        // mentioned (and alerted with the private text).
        const mentionPool: string[] = isDmGroup(group) ? (dmParticipants(group) || []) : (group.members || []);
        const groupMembers = await UserModel.find({
          _id: { $in: mentionPool }
        }).select('_id id name');
        
        console.log(`[CHAT] Group Members Found: ${groupMembers.length}/${group.members.length}`);
        
        // "@Name" followed by a space, punctuation or the end (src/lib/stormchat/mentions.ts).
        mentionedUserIds.push(...mentionedIds(message, groupMembers as any[]));
      }

      // Who gets which alert: @all from a group admin mentions everyone; people
      // who muted the chat only hear about mentions (GroupMe-style).
      const plan = alertPlan({
        members: isDmGroup(group) ? (dmParticipants(group) || []) : (group.members || []).map(String),
        senderIds,
        mentioned: mentionedUserIds,
        atAll: messageType === 'text' && mentionsAll(message || ''),
        senderIsAdmin: isGroupAdmin(group, senderIds, senderRole),
        // Only mutes still in force (a "mute for 1 hour" ends by itself).
        mutedBy: activeMutedIds(group),
      });
      mentionedUserIds.splice(0, mentionedUserIds.length, ...plan.mention);

      // Create message with reply fields if provided
      const messageData: any = {
        groupId,
        senderId,
        senderName,
        senderRole,
        message: message || '',
        messageType,
        // Text and polls carry no attachment; others were checked above.
        mediaUrl: messageType === 'text' || messageType === 'poll' ? '' : String(mediaUrl).trim(),
        mentions: mentionedUserIds
      };

      // Poll payload: normalize options into { text, votes: [] }.
      if (messageType === 'poll' && poll && Array.isArray(poll.options)) {
        messageData.poll = {
          question: String(poll.question || '').trim(),
          allowMultiple: !!poll.allowMultiple,
          options: poll.options
            .map((o: any) => ({ text: String((typeof o === 'string' ? o : o?.text) || '').trim(), votes: [] }))
            .filter((o: any) => o.text.length > 0),
        };
      }

      // Reply: quote the REAL original, which must be in this same chat.
      if (replyTo) {
        const original = mongoose.isValidObjectId(String(replyTo))
          ? await ChatMessage.findById(String(replyTo)).select('groupId message senderName messageType poll deletedAt').lean() as any
          : null;
        if (original?.deletedAt) {
          return res.status(400).json({ error: 'That message was deleted' });
        }
        const quote = replyQuoteFrom(original, String(groupId));
        if (!quote) {
          return res.status(400).json({ error: "That message can't be replied to here" });
        }
        messageData.replyTo = String(replyTo);
        messageData.replyToMessage = quote.replyToMessage;
        messageData.replyToSender = quote.replyToSender;
      }

      const newMessage = await ChatMessage.create(messageData);
      await logToDb('info', 'STORM-CHAT', `✅ Message created in DB: ${newMessage._id}`);

      // A new message revives the thread for anyone who "deleted" (hid) this DM,
      // so a hidden 1-on-1 chat comes back on fresh activity.
      if (Array.isArray((group as any).hiddenFor) && (group as any).hiddenFor.length) {
        await ChatGroup.updateOne({ _id: groupId }, { $set: { hiddenFor: [] } });
      }

      // Create notifications for group members
      const notificationPromises: Promise<any>[] = [];

      // group.members and mentionedUserIds are Mongo _ids; Notification.userId
      // must be the app id the bell queries by (see src/lib/stormchat/appIds.ts).
      // senderIds carries BOTH the app id and the Mongo _id of the sender; the
      // ids being filtered here are Mongo _ids, so comparing against the bare
      // app id (as this once did) never excluded the sender and they were
      // notified about their own message.
      const mentionAppIds = await appIdsForMongoIds(
        mentionedUserIds.filter((id) => !senderIds.includes(id))
      );

      // 1. Mention notifications
      for (const mentionedAppId of mentionAppIds) {
        notificationPromises.push(
          NotificationModel.create({
            id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            userId: mentionedAppId,
            type: 'stormchat_mention',
            title: `You were mentioned by ${senderName}`,
            message: alertPreview(messageType, message, poll?.question),
            read: false,
            metadata: {
              groupId,
              groupName: group.name,
              messageId: newMessage._id
            }
          })
        );
      }

      // 2. New message notifications for other members. A DM alerts ONLY its two
      // canonical participants (dmKey), never whoever was written into members[].
      // (alertPlan already used the DM's two participants and dropped the
      // sender, the mentioned and anyone who muted the chat.)
      const otherMemberIds = plan.ordinary;
      
      console.log(`[CHAT] Notifying ${otherMemberIds.length} other members (Sender: ${senderId})`);

      // A private DM reads "<sender> sent you a message"; a group keeps the
      // "New message in <group>: <sender>: …" format.
      const isDm = !!group.isDirect;
      const bodyPreview = alertPreview(messageType, message, poll?.question);
      const memberTitle = isDm ? `${senderName} sent you a message` : `New message in ${group.name}`;
      const memberBody = isDm ? bodyPreview : `${senderName}: ${bodyPreview}`;

      const otherMemberAppIds = await appIdsForMongoIds(otherMemberIds);
      for (const memberAppId of otherMemberAppIds) {
        notificationPromises.push(
          NotificationModel.create({
            id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            userId: memberAppId,
            type: 'stormchat_message',
            title: memberTitle,
            message: memberBody,
            read: false,
            metadata: {
              groupId,
              groupName: group.name,
              messageId: newMessage._id,
              isDirect: isDm
            }
          })
        );
      }

      // Wait for all notifications to be created
      await Promise.all(notificationPromises);

      // Send push notifications
      const pushStatus = { mentionCount: 0, memberCount: 0, error: null as string | null };
      try {
        const { UserModel } = await import('../../../../src/lib/models/User');
        
        // Get FCM tokens for mentioned users
        const mentionedUsers = await UserModel.find({
          _id: { $in: mentionedUserIds },
          fcmToken: { $exists: true, $ne: null, $nin: ['', null] }
        }).select('fcmToken name');
        
        const mentionTokens = mentionedUsers.map((u: any) => u.fcmToken).filter(Boolean);
        await logToDb('info', 'STORM-CHAT', `Found ${mentionTokens.length} mention tokens`, { userNames: mentionedUsers.map(u => u.name) });
        
        if (mentionTokens.length > 0) {
          await logToDb('info', 'PUSH-NOTIFICATION', `🚀 Sending push to ${mentionTokens.length} mentioned users`);
          const result = await sendPushNotificationToMultiple(
            mentionTokens,
            `You were mentioned by ${senderName}`,
            alertPreview(messageType, message, poll?.question),
            {
              groupId: groupId as string,
              groupName: group.name,
              messageId: newMessage._id.toString(),
              type: 'mention'
            }
          );
          pushStatus.mentionCount = result.successCount;
        }
        
        // Get FCM tokens for other members
        const otherUsers = await UserModel.find({
          _id: { $in: otherMemberIds },
          fcmToken: { $exists: true, $ne: null, $nin: ['', null] }
        }).select('fcmToken name');
        
        const otherTokens = otherUsers.map((u: any) => u.fcmToken).filter(Boolean);
        await logToDb('info', 'STORM-CHAT', `Found ${otherTokens.length} member tokens`, { userNames: otherUsers.map(u => u.name) });
        
        if (otherTokens.length > 0) {
          await logToDb('info', 'PUSH-NOTIFICATION', `🚀 Sending push to ${otherTokens.length} other members`);
          const result = await sendPushNotificationToMultiple(
            otherTokens,
            memberTitle,
            memberBody,
            {
              groupId: groupId as string,
              groupName: group.name,
              messageId: newMessage._id.toString(),
              type: 'message',
              isDirect: isDm ? 'true' : 'false'
            }
          );
          pushStatus.memberCount = result.successCount;
        }
      } catch (pushError: any) {
        await logToDb('error', 'PUSH-NOTIFICATION', `❌ Error: ${pushError.message}`);
        pushStatus.error = pushError.message;
      }

      await logToDb('info', 'STORM-CHAT', `✅ Finished processing message: ${newMessage._id}`, { pushStatus });
      res.status(201).json({ ...newMessage.toObject(), pushStatus });
    } catch (error: any) {
      await logToDb('error', 'STORM-CHAT', `❌ Critical Error: ${error.message}`);
      res.status(500).json({ error: 'Failed to send message' });
    }
  } else if (req.method === 'PATCH') {
    // Edit your own message: text, or a photo / video caption, for 15 minutes
    // after sending (src/lib/stormchat/messageChanges.ts). Nobody is alerted
    // again; the bell's copies of it show the new words.
    if (req.body.action === 'edit') {
      try {
        const { messageId } = req.body;
        const msg = mongoose.isValidObjectId(String(messageId)) ? await ChatMessage.findById(messageId).lean() as any : null;
        if (!msg) return res.status(404).json({ error: 'Message not found' });
        const problem = editProblem(msg, auth.sub, req.body.message);
        if (problem) return res.status(String(msg.senderId) === auth.sub ? 400 : 403).json({ error: problem });

        // Only while you can still post there (not removed, not admin-only now).
        const grp = await ChatGroup.findById(msg.groupId).lean() as any;
        const me = await UserModel.findOne({ id: auth.sub }, { _id: 1 }).lean() as any;
        const myIds = [auth.sub, me?._id?.toString()].filter(Boolean) as string[];
        if (!grp || !chatRights(grp, myIds, auth.role, true).canSend) {
          return res.status(403).json({ error: "You can't post in this chat any more" });
        }

        const text = String(req.body.message);
        const updated = await ChatMessage.findOneAndUpdate(
          { _id: msg._id, deletedAt: null },
          { $set: { message: text, editedAt: new Date() } },
          { new: true },
        ).lean();
        if (!updated) return res.status(400).json({ error: 'That message was deleted' });

        const preview = alertPreview(msg.messageType, text);
        const ids = { $in: [String(msg._id), msg._id] };
        await Promise.all([
          NotificationModel.updateMany({ 'metadata.messageId': ids, type: 'stormchat_mention' }, { $set: { message: preview } }),
          NotificationModel.updateMany(
            { 'metadata.messageId': ids, type: 'stormchat_message' },
            { $set: { message: isDmGroup(grp) ? preview : `${msg.senderName}: ${preview}` } },
          ),
        ]);
        return res.status(200).json(updated);
      } catch (error) {
        console.error('Error editing message:', error);
        return res.status(500).json({ error: 'Failed to edit message' });
      }
    }
    // Pin / unpin a message. A moderator (group admin or system admin) may pin
    // in a group; in a DM either of the two members may. Permission is derived
    // from the message's OWN group, never the URL param.
    if (req.body.action === 'pin' || req.body.action === 'unpin') {
      try {
        const { messageId } = req.body;
        if (!messageId) return res.status(400).json({ error: 'messageId is required' });

        const msg = mongoose.isValidObjectId(String(messageId)) ? await ChatMessage.findById(messageId) : null;
        if (!msg) return res.status(404).json({ error: 'Message not found' });
        if ((msg as any).deletedAt) return res.status(400).json({ error: 'That message was deleted' });

        const grp = await ChatGroup.findById((msg as any).groupId).lean() as any;
        if (!grp) return res.status(404).json({ error: 'Group not found' });

        // group.members/admins store Mongo _ids; auth.sub is the app id.
        const me = await UserModel.findOne({ id: auth.sub }, { _id: 1, name: 1 }).lean() as any;
        const myIds = [auth.sub, me?._id?.toString()].filter(Boolean) as string[];
        // Anyone who can post here can pin: any member, or only group admins in
        // an admin-only group; in a DM either participant (shared rule).
        const canPin = chatRights(grp, myIds, auth.role, true).canPin;
        if (!canPin) {
          return res.status(403).json({ error: "You can't pin messages here" });
        }

        const pin = req.body.action === 'pin';
        (msg as any).pinned = pin;
        (msg as any).pinnedAt = pin ? new Date() : null;
        (msg as any).pinnedBy = pin ? auth.sub : '';
        (msg as any).pinnedByName = pin ? (me?.name || '') : '';
        await msg.save();
        return res.status(200).json(msg);
      } catch (error) {
        console.error('Error pinning message:', error);
        return res.status(500).json({ error: 'Failed to pin message' });
      }
    }
    // Add or remove a reaction on a message
    try {
      const { messageId, emoji } = req.body;
      const userId = auth.sub;
      // The name shown on a reaction is the reactor's account name, never
      // whatever the request says.
      const reactor = await UserModel.findOne({ id: userId }, { name: 1 }).lean() as any;
      const userName: string = reactor?.name || 'Unknown';

      if (!messageId || !emoji) {
        return res.status(400).json({ error: 'messageId and emoji are required' });
      }
      if (typeof emoji !== 'string' || emoji.length > 16) {
        return res.status(400).json({ error: 'A reaction is a single emoji' });
      }

      // Only someone who can read the message's chat may react (and see it back).
      const msg = await findReadableMessage(messageId, auth);
      if (!msg) return res.status(404).json({ error: 'Message not found' });
      if ((msg as any).deletedAt) return res.status(400).json({ error: 'That message was deleted' });

      // Toggle as single add/remove operations on the database, so people
      // reacting at the same moment can't overwrite each other (readiness
      // test item 9: 8 at once kept 1).
      const removed = await ChatMessage.updateOne(
        { _id: (msg as any)._id, reactions: { $elemMatch: { userId, emoji } } },
        { $pull: { reactions: { userId, emoji } } },
      );
      if (removed.modifiedCount === 0) {
        await ChatMessage.updateOne(
          { _id: (msg as any)._id, reactions: { $not: { $elemMatch: { userId, emoji } } } },
          { $push: { reactions: { emoji, userId, userName } } },
        );
      }

      return res.status(200).json(await ChatMessage.findById((msg as any)._id).lean());
    } catch (error) {
      console.error('Error saving reaction:', error);
      res.status(500).json({ error: 'Failed to save reaction' });
    }
  } else if (req.method === 'DELETE') {
    // Delete a message (text/photo/video). The sender can always delete their
    // own; a system admin may also delete any message in a GROUP (moderation),
    // but NOT inside a private DM they aren't part of.
    try {
      const { messageId } = req.body;
      if (!messageId) return res.status(400).json({ error: 'messageId is required' });

      const msg = mongoose.isValidObjectId(String(messageId)) ? await ChatMessage.findById(messageId) : null;
      if (!msg) return res.status(404).json({ error: 'Message not found' });

      const isSender = (msg as any).senderId === auth.sub;
      // Derive the moderation context from the message's OWN group, never the
      // URL param — otherwise an admin could pass a normal group's id in the URL
      // while deleting a message that actually lives in a private DM, bypassing
      // the "admins can't touch DMs" rule.
      // Moderators are the group's own admins (and company Admins), never in a DM.
      let adminCanModerate = false;
      if (!isSender) {
        const grp = await ChatGroup.findById((msg as any).groupId).lean() as any;
        const me = await UserModel.findOne({ id: auth.sub }, { _id: 1 }).lean() as any;
        const myIds = [auth.sub, me?._id?.toString()].filter(Boolean) as string[];
        adminCanModerate = !!grp && canModerateMessages(grp, myIds, auth.role);
      }
      if (!isSender && !adminCanModerate) {
        return res.status(403).json({ error: 'You can only delete your own messages' });
      }

      // Already deleted: nothing more to do.
      if ((msg as any).deletedAt) return res.status(200).json({ success: true, message: msg });

      // GroupMe-style: the message stays as "This message was deleted" (it
      // used to vanish, leaving a confusing gap). Its words, attachment, poll,
      // reactions and pin go for good (src/lib/stormchat/messageChanges.ts).
      await ChatMessage.updateOne({ _id: (msg as any)._id }, tombstoneUpdate(auth.sub, new Date()));
      // Replies that quoted it stop showing its words.
      await ChatMessage.updateMany({ replyTo: String((msg as any)._id) }, { $set: { replyToMessage: DELETED_QUOTE } });
      // Its bell alerts go too, so the deleted text doesn't live on in
      // everyone's bell (readiness test item 17). Stored as an ObjectId.
      await NotificationModel.deleteMany({
        'metadata.messageId': { $in: [String(messageId), (msg as any)._id] },
      });
      return res.status(200).json({ success: true, message: await ChatMessage.findById((msg as any)._id).lean() });
    } catch (error) {
      console.error('Error deleting message:', error);
      res.status(500).json({ error: 'Failed to delete message' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
