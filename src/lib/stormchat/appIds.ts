import { UserModel } from "../models/User";

// Storm Chat stores group members and @mentions by Mongo `_id`, but every
// notification reader (the bell, the phone) looks notifications up by the
// app-level `User.id` in the session (`auth.sub`, e.g. "user-1712345678").
// Writing a Notification row with a Mongo _id therefore produces a row nobody
// can ever read: as of 2026-09-10 every one of the 17,694 chat notifications
// in production was unread for exactly this reason.
//
// Every chat notification writer must map through here so the row is keyed
// the way the reader queries it. Unknown ids (deleted users, stale members)
// are dropped rather than written under an id that will never match.
export async function appIdsForMongoIds(mongoIds: string[]): Promise<string[]> {
  const wanted = mongoIds.map(String).filter(Boolean);
  if (wanted.length === 0) return [];
  const users = (await UserModel.find({ _id: { $in: wanted } })
    .select("_id id")
    .lean()) as Array<{ _id: unknown; id?: string }>;
  const byMongo = new Map(users.map((u) => [String(u._id), u.id]));
  return wanted.map((m) => byMongo.get(m)).filter((id): id is string => !!id);
}

// The reverse lookup, for readers that must match against fields stored as
// Mongo _ids (e.g. ChatMessage.mentions) using the session's app id.
export async function mongoIdForAppId(appId: string): Promise<string | null> {
  const u = (await UserModel.findOne({ id: appId }).select("_id").lean()) as { _id?: unknown } | null;
  return u?._id ? String(u._id) : null;
}
