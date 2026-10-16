import mongoose from "mongoose";
import ChatMessage from "../models/ChatMessage";
import ChatGroup from "../models/ChatGroup";
import { canReadMessages } from "./access";
import { mongoIdForAppId } from "./appIds";

// Endpoints that act on ONE message by its id (reactions, poll votes) must
// check the caller can read the chat that message lives in. Without this, a
// user outside a DM could react to or vote on one of its messages by id and
// get the private message back in the response (found 2026-10-15 in the
// Storm Chat readiness test).
//
// Returns the message document only when the caller may read its chat;
// otherwise null, which the endpoint answers as "not found" so an outsider
// cannot even confirm the message exists.
export async function findReadableMessage(
  messageId: unknown,
  auth: { sub: string; role?: string },
) {
  if (typeof messageId !== "string" || !mongoose.isValidObjectId(messageId)) return null;
  const msg = await ChatMessage.findById(messageId);
  if (!msg) return null;
  const group = (await ChatGroup.findById((msg as any).groupId).lean()) as any;
  if (!group) return null;
  const myMongoId = await mongoIdForAppId(auth.sub);
  const myIds = [auth.sub, myMongoId].filter(Boolean) as string[];
  return canReadMessages(group, myIds, auth.role) ? msg : null;
}
