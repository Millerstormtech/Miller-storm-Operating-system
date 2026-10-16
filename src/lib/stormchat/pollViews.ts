import { UserModel } from "../models/User";
import { pollForViewer } from "./richMessages";

// Every response that carries messages runs them through here, so a poll
// always reaches a person the same way: voter names, or (anonymous polls)
// nobody's id but their own. Votes are stored by app id.
export async function withPollViews<T extends { poll?: any }>(messages: T[], viewerAppId: string): Promise<T[]> {
  const polls = messages.filter((m) => m?.poll?.options);
  if (!polls.length) return messages;
  const ids = new Set<string>();
  for (const m of polls) {
    if (m.poll.anonymous) continue;
    for (const o of m.poll.options) for (const v of o.votes || []) ids.add(String(v));
  }
  ids.delete(viewerAppId);
  const people = ids.size
    ? ((await UserModel.find({ id: { $in: Array.from(ids) } }, { _id: 0, id: 1, name: 1 }).lean()) as any[])
    : [];
  const nameById = new Map(people.map((p) => [String(p.id), String(p.name || "")]));
  return messages.map((m) => (m?.poll?.options ? { ...m, poll: pollForViewer(m.poll, viewerAppId, (id) => nameById.get(id)) } : m));
}
