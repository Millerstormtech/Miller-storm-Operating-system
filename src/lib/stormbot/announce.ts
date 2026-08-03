// The megaphone. Posts one sentence into the Storm Bot chat group and notifies
// every member exactly like a normal group message. Knows nothing about courses,
// claims or contracts: callers decide WHAT to say, this decides HOW it is said.
//
// Extracted from src/lib/training/celebration.ts so three event types share one
// posting path. Change the group, the sender name, or a push bug here once.
import ChatGroup from "../models/ChatGroup";
import ChatMessage from "../models/ChatMessage";
import { NotificationModel } from "../models/Notification";
import { UserModel } from "../models/User";
import { sendPushNotificationToMultiple } from "../firebase-admin";
import { logToDb } from "../models/SystemLog";

// Main Chat 2026, targeted by _id so renaming the group never breaks this.
// Dev verification overrides via env: point it at a throwaway group, never the
// real one.
export const CELEBRATION_GROUP_ID =
  process.env.CELEBRATION_GROUP_ID || "REPLACE_IN_TASK_7";

// Returns true if the message was posted. Never throws: a failed celebration
// must not take down the save or sync that triggered it.
export async function announce(text: string): Promise<boolean> {
  try {
    const group: any = await ChatGroup.findById(CELEBRATION_GROUP_ID).lean();
    if (!group) {
      await logToDb("error", "CELEBRATION", `Celebration group ${CELEBRATION_GROUP_ID} not found; skipping`);
      return false;
    }

    const msg: any = await ChatMessage.create({
      groupId: CELEBRATION_GROUP_ID,
      senderId: "storm-bot",
      senderName: "Storm Bot",
      senderRole: "system",
      message: text,
      messageType: "text",
    });

    // group.members hold Mongo _ids; the bot is not a member, so everyone gets notified.
    const memberIds: string[] = group.members || [];
    const title = `New message in ${group.name}`;
    const body = `Storm Bot: ${text.substring(0, 100)}`;
    await Promise.all(
      memberIds.map((memberId) =>
        NotificationModel.create({
          id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          userId: memberId,
          type: "stormchat_message",
          title,
          message: body,
          read: false,
          metadata: {
            groupId: CELEBRATION_GROUP_ID,
            groupName: group.name,
            messageId: msg._id,
          },
        })
      )
    );

    try {
      const tokenUsers: any[] = await UserModel.find({
        _id: { $in: memberIds },
        fcmToken: { $exists: true, $ne: null, $nin: ["", null] },
      }).select("fcmToken");
      const tokens = tokenUsers.map((u: any) => u.fcmToken).filter(Boolean);
      if (tokens.length > 0) {
        await sendPushNotificationToMultiple(tokens, title, body, {
          groupId: CELEBRATION_GROUP_ID,
          groupName: group.name,
          messageId: msg._id.toString(),
          type: "message",
          isDirect: "false",
        });
      }
    } catch (pushError: any) {
      // A failed push must not undo a posted message.
      await logToDb("error", "CELEBRATION", `Push failed: ${pushError?.message}`);
    }

    return true;
  } catch (e: any) {
    try {
      await logToDb("error", "CELEBRATION", `Announce failed: ${e?.message}`);
    } catch {
      console.error("[CELEBRATION] announce failed:", e);
    }
    return false;
  }
}
