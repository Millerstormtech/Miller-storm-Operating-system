import type { NextApiRequest, NextApiResponse } from 'next';
import { connectMongo } from '../../../../src/lib/mongodb';
import ChatMessage from '../../../../src/lib/models/ChatMessage';
import ChatGroup from '../../../../src/lib/models/ChatGroup';
import { UserModel } from '../../../../src/lib/models/User';
import { NotificationModel } from '../../../../src/lib/models/Notification';
import { sendPushNotificationToMultiple } from '../../../../src/lib/firebase-admin';
import { logToDb } from '../../../../src/lib/models/SystemLog';
import { requireUser, allowMethods } from '../../../../src/lib/auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ['GET', 'POST', 'PATCH'])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();

  const { groupId } = req.query;

  if (req.method === 'GET') {
    // Get messages for a group
    try {
      // Check if group exists
      const group = await ChatGroup.findById(groupId);
      if (!group) {
        await logToDb('error', 'STORM-CHAT', `Group not found: ${groupId}`);
        return res.status(404).json({ error: 'Group not found' });
      }

      const queryUserId = auth.sub;
      const queryUserRole = auth.role;

      // auth.sub is the app id (e.g. "user-123") but group.members/admins store
      // Mongo _ids — resolve this user's _id so membership matches either form.
      const me = await UserModel.findOne({ id: queryUserId }, { _id: 1 }).lean() as any;
      const myIds = [queryUserId, me?._id?.toString()].filter(Boolean) as string[];

      const isAdmin = queryUserRole?.toString().toLowerCase() === 'admin';
      const isGroupAdmin = group.admins.some((m: string) => myIds.includes(m));
      const isMember = group.members.some((m: string) => myIds.includes(m));

      if (!isAdmin && !isGroupAdmin && !isMember) {
        return res.status(403).json({ error: 'You are not a member of this group' });
      }

      const messages = await ChatMessage.find({ groupId })
        .sort({ createdAt: 1 })
        .limit(500); // Last 500 messages

      res.status(200).json(messages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      res.status(500).json({ error: 'Failed to fetch messages' });
    }
  } else if (req.method === 'POST') {
    // Send a message
    try {
      const { senderName, message, messageType, mediaUrl, replyTo, replyToMessage, replyToSender } = req.body;
      const senderId = auth.sub;
      const senderRole = auth.role;

      await logToDb('info', 'STORM-CHAT', `📩 New message request for group: ${groupId}`, { senderName, senderId, messageType });

      if (!senderName) {
        return res.status(400).json({ error: 'Sender information is required' });
      }

      // Check if group exists
      const group = await ChatGroup.findById(groupId);
      if (!group) {
        await logToDb('error', 'STORM-CHAT', `Group not found: ${groupId}`);
        return res.status(404).json({ error: 'Group not found' });
      }

      // Resolve sender _id (group.members store Mongo _ids; senderId is app id).
      const sender = await UserModel.findOne({ id: senderId }, { _id: 1 }).lean() as any;
      const senderIds = [senderId, sender?._id?.toString()].filter(Boolean) as string[];

      // Check if user is a member or admin
      if (!group.members.some((m: string) => senderIds.includes(m))) {
        // Allow if user is a system admin
        if (senderRole !== 'admin') {
          return res.status(403).json({ error: 'You are not a member of this group' });
        }
      }

      // Check if only admin can chat
      if (group.onlyAdminCanChat) {
        // Check if sender is system admin or group admin
        const isAdmin = senderRole === 'admin';
        const isGroupAdmin = group.admins.some((m: string) => senderIds.includes(m));

        if (!isAdmin && !isGroupAdmin) {
          return res.status(403).json({ error: 'Only admins can send messages in this group' });
        }
      }

      // Extract mentions from message text
      const mentionedUserIds: string[] = [];
      if (message && messageType === 'text') {
        // Import User model
        const { UserModel } = await import('../../../../src/lib/models/User');
        
        // Get all group members
        const groupMembers = await UserModel.find({
          _id: { $in: group.members }
        }).select('_id id name');
        
        console.log(`[CHAT] Group Members Found: ${groupMembers.length}/${group.members.length}`);
        
        // For each member, check if their name is mentioned with @
        for (const member of groupMembers) {
          const memberName = member.name;
          // Create regex to match @Name (case insensitive, with word boundary or space after)
          const nameRegex = new RegExp(`@${memberName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=\\s|$)`, 'i');
          if (nameRegex.test(message)) {
            mentionedUserIds.push(member._id.toString());
          }
        }
      }

      // Create message with reply fields if provided
      const messageData: any = {
        groupId,
        senderId,
        senderName,
        senderRole,
        message: message || '',
        messageType: messageType || 'text',
        mediaUrl: mediaUrl || '',
        mentions: mentionedUserIds
      };

      // Add reply fields if they exist
      if (replyTo) {
        messageData.replyTo = replyTo;
        messageData.replyToMessage = replyToMessage || '';
        messageData.replyToSender = replyToSender || '';
      }

      const newMessage = await ChatMessage.create(messageData);
      await logToDb('info', 'STORM-CHAT', `✅ Message created in DB: ${newMessage._id}`);

      // Create notifications for group members
      const notificationPromises: Promise<any>[] = [];

      // 1. Mention notifications
      for (const mentionedUserId of mentionedUserIds) {
        if (mentionedUserId !== senderId) {
          notificationPromises.push(
            NotificationModel.create({
              id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              userId: mentionedUserId,
              type: 'stormchat_mention',
              title: `You were mentioned by ${senderName}`,
              message: messageType === 'text' 
                ? (message?.substring(0, 100) || 'New message')
                : (messageType === 'image' ? 'Shared an image' : 'New message'),
              read: false,
              metadata: {
                groupId,
                groupName: group.name,
                messageId: newMessage._id
              }
            })
          );
        }
      }

      // 2. New message notifications for other members
      const otherMemberIds = group.members.filter(
        (id: string) => id !== senderId && !mentionedUserIds.includes(id)
      );
      
      console.log(`[CHAT] Notifying ${otherMemberIds.length} other members (Sender: ${senderId})`);

      for (const memberId of otherMemberIds) {
        notificationPromises.push(
          NotificationModel.create({
            id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            userId: memberId,
            type: 'stormchat_message',
            title: `New message in ${group.name}`,
            message: `${senderName}: ${
              messageType === 'text' 
                ? (message?.substring(0, 100) || 'New message')
                : (messageType === 'image' ? 'Shared an image' : 'New message')
            }`,
            read: false,
            metadata: {
              groupId,
              groupName: group.name,
              messageId: newMessage._id
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
            messageType === 'text' 
              ? (message?.substring(0, 100) || 'New message')
              : (messageType === 'image' ? 'Shared an image' : 'New message'),
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
            `New message in ${group.name}`,
            `${senderName}: ${
              messageType === 'text' 
                ? (message?.substring(0, 100) || 'New message')
                : (messageType === 'image' ? 'Shared an image' : 'New message')
            }`,
            {
              groupId: groupId as string,
              groupName: group.name,
              messageId: newMessage._id.toString(),
              type: 'message'
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
    // Add or remove a reaction on a message
    try {
      const { messageId, emoji, userName } = req.body;
      const userId = auth.sub;

      if (!messageId || !emoji) {
        return res.status(400).json({ error: 'messageId and emoji are required' });
      }

      const msg = await ChatMessage.findById(messageId);
      if (!msg) return res.status(404).json({ error: 'Message not found' });

      const reactions = (msg as any).reactions || [];
      const existingIndex = reactions.findIndex(
        (r: any) => r.userId === userId && r.emoji === emoji
      );

      if (existingIndex !== -1) {
        // Toggle off — remove existing reaction
        reactions.splice(existingIndex, 1);
      } else {
        // Add new reaction
        reactions.push({ emoji, userId, userName });
      }

      (msg as any).reactions = reactions;
      await msg.save();

      return res.status(200).json(msg);
    } catch (error) {
      console.error('Error saving reaction:', error);
      res.status(500).json({ error: 'Failed to save reaction' });
    }
  } else {
    res.status(405).json({ error: 'Method not allowed' });
  }
}
