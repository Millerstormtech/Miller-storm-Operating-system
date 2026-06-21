import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { AiBotModel } from "../../../src/lib/models/AiBot";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  await connectMongo();

  if (req.method === "GET") {
    const bots = await AiBotModel.find({ isActive: true, status: 'published' }).lean();
    const normalized = bots.map(normalizeBot);
    // Sort: bots with sortOrder set come first (by sortOrder asc), rest by createdAt desc
    normalized.sort((a: any, b: any) => {
      const aHas = a.sortOrder !== undefined && a.sortOrder !== null;
      const bHas = b.sortOrder !== undefined && b.sortOrder !== null;
      if (aHas && bHas) return a.sortOrder - b.sortOrder;
      if (aHas) return -1;
      if (bHas) return 1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return res.status(200).json(normalized);
  }

  if (req.method === "PUT") {
    const { orderedIds } = req.body;
    if (!Array.isArray(orderedIds)) return res.status(400).json({ error: "orderedIds required" });
    const collection = AiBotModel.collection;
    await Promise.all(
      orderedIds.map((botId: string, index: number) =>
        collection.updateOne({ id: botId }, { $set: { sortOrder: index } })
      )
    );
    return res.status(200).json({ ok: true });
  }

  if (req.method === "POST") {
    const { name } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: "Name required" });
    const id = `bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const bot = await AiBotModel.create({ id, name: name.trim() });
    return res.status(201).json(normalizeBot(bot.toObject()));
  }

  res.setHeader("Allow", ["GET", "POST", "PUT"]);
  res.status(405).end();
}

function normalizeBot(doc: any) {
  const { _id, __v, ...rest } = doc;
  return {
    ...rest,
    botTitle: rest.botTitle ?? "",
    displayMessage: rest.displayMessage ?? "",
    displayMessageEnabled: rest.displayMessageEnabled ?? false,
    welcomeMessage: rest.welcomeMessage ?? "Hi, How can I help you today?",
    showWelcomePopup: rest.showWelcomePopup ?? true,
    placeholder: rest.placeholder ?? "Ask me anything...",
    suggestions: rest.suggestions ?? [],
    removeSuggestionsAfterFirst: rest.removeSuggestionsAfterFirst ?? false,
    colorTheme: rest.colorTheme ?? "#3b82f6",
    botAvatarUrl: rest.botAvatarUrl ?? "",
    chatIconSize: rest.chatIconSize ?? 60,
    enterMessage: rest.enterMessage ?? "Chat Now",
    attentionSound: rest.attentionSound ?? "None",
    attentionAnimation: rest.attentionAnimation ?? "None",
    immediatelyOpenChat: rest.immediatelyOpenChat ?? false,
    leadCollection: rest.leadCollection ?? false,
    privacyPolicyEnabled: rest.privacyPolicyEnabled ?? true,
    privacyActionText: rest.privacyActionText ?? "Read our",
    privacyLinkText: rest.privacyLinkText ?? "Privacy Policy",
    privacyLink: rest.privacyLink ?? "",
    isPublic: rest.isPublic ?? false,
    sortOrder: rest.sortOrder ?? null,
    assignedRoles: rest.assignedRoles ?? [],
    teamMembers: rest.teamMembers ?? [],
    trainingLinks: rest.trainingLinks ?? [],
    qaItems: rest.qaItems ?? [],
  };
}
