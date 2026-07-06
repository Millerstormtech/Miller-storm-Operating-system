import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { AiBotModel } from "../../../src/lib/models/AiBot";
import { BotChatModel } from "../../../src/lib/models/BotChat";
import { requireUser, allowMethods } from "../../../src/lib/auth";
import { retrieveRelevant } from "../../../src/lib/rag";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;

  const auth = requireUser(req, res);
  if (!auth) return;

  await connectMongo();
  const { botId, messages, chatId, userName, userEmail, voiceMode } = req.body;
  const userId = auth.sub;
  const userRole = auth.role;

  const bot = await AiBotModel.findOne({ id: botId, isActive: true });
  if (!bot) return res.status(404).json({ error: "Bot not found" });

  // Build system prompt from all training data
  let systemContent = bot.systemPrompt || `You are a helpful AI assistant named ${bot.name}.`;

  const hasTrainingData = bot.trainingText?.trim() || bot.courseTrainingText?.trim() || bot.trainingLinks?.length > 0 || bot.qaItems?.length > 0;

  if (hasTrainingData) {
    systemContent += `\n\nIMPORTANT: The training content below may be only the most relevant excerpts of a larger body of material — NOT the complete set. So answer any question that relates to this subject area, using your best understanding of the material even if a specific detail isn't quoted word-for-word in the excerpts. Respond naturally to greetings, small talk, and conversational messages (like "hi", "hello", "thanks"). ONLY decline when a question is clearly about a completely unrelated subject (e.g. general trivia, other domains, or topics with no connection to this material) — in that case politely say: "I can only assist with topics covered in my training material." Do NOT refuse a relevant question just because its exact wording doesn't appear in the excerpts; if it's on-topic, do your best to answer from the material.`;
  }

  // Prefer RAG: embed the user's latest question and inject ONLY the most
  // relevant chunks of training material. This is what makes large courses
  // accurate — the model sees the pertinent lessons, not a truncated blob.
  // Falls back to the full-material approach if the bot isn't indexed yet or
  // retrieval/embeddings fail, so nothing breaks.
  const lastUserMsg =
    [...messages].reverse().find((m: any) => m.role === "user")?.content || "";
  let usedRag = false;
  if (hasTrainingData) {
    try {
      // Retrieve broadly (many chunks, large budget) so the model sees enough
      // of the material to answer — a small top-K made it miss content that was
      // actually in the training and then wrongly claim it wasn't covered.
      const relevant = await retrieveRelevant(botId, lastUserMsg, 40, 120000);
      if (relevant.length) {
        systemContent += `\n\nRELEVANT TRAINING CONTENT:\n${relevant.join("\n\n---\n\n")}`;
        usedRag = true;
      }
    } catch (e) {
      console.error("[RAG] retrieval failed, using full training text:", e);
    }
  }

  if (!usedRag) {
    // Fallback: share one large budget across all sources (gpt-4o-mini ~128k
    // token window ≈ 500k chars). Q&A first (small, high-signal), then docs,
    // then course content.
    const MAX_TRAINING_CHARS = 300000;
    let remaining = MAX_TRAINING_CHARS;
    const addSection = (label: string, text?: string) => {
      const t = (text || "").trim();
      if (!t || remaining <= 0) return;
      const slice = t.length > remaining
        ? t.substring(0, remaining) + "\n\n[Content truncated due to length...]"
        : t;
      remaining -= slice.length;
      systemContent += `\n\n${label}:\n${slice}`;
    };

    if (bot.qaItems?.length > 0) {
      const qaText = bot.qaItems
        .filter((q: any) => q.question && q.answer)
        .map((q: any) => `Q: ${q.question}\nA: ${q.answer}`)
        .join("\n\n");
      addSection("FREQUENTLY ASKED QUESTIONS", qaText);
    }
    addSection("TRAINING CONTENT", bot.trainingText);
    addSection("COURSE TRAINING CONTENT", bot.courseTrainingText);
  }

  // Voice conversation: the reply will be spoken aloud, so make it sound like a
  // real person on a phone call — short, natural, spoken sentences rather than a
  // written document.
  if (voiceMode) {
    systemContent += `\n\nVOICE MODE: The user is speaking to you and your reply will be READ ALOUD. Respond the way a real person would on a phone call: warm, natural, conversational, and CONCISE (usually 1-3 short sentences). Do NOT use markdown, bullet points, numbered lists, headings, emojis, or code blocks — just plain spoken words. If a full answer is long, give the key point first and offer to go deeper. Keep it easy to follow by ear.`;
  }

  // Creativity 0 = rigid, near-deterministic answers (the old default nobody
  // tuned). When it was never set above 0, fall back to a balanced 30 so the
  // bot answers naturally while staying grounded in its training material.
  const creativity = bot.creativity && bot.creativity > 0 ? bot.creativity : 30;
  const temperature = creativity / 100;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: bot.model || "gpt-4o-mini",
        messages: [{ role: "system", content: systemContent }, ...messages.map((m: any) => ({ role: m.role, content: m.content }))],
        temperature,
        // Voice replies are short and conversational — a small cap makes them
        // generate (and speak) much faster.
        max_tokens: voiceMode ? 300 : 1500
      })
    });

    if (!response.ok) throw new Error(`OpenAI error: ${response.statusText}`);
    const data = await response.json();
    const reply = data.choices[0].message.content;

    // Auto-generate a title ONLY on the first turn — doing it on every message
    // added a second, blocking OpenAI round-trip that slowed every reply.
    // undefined = leave the existing title untouched.
    let title: string | undefined = undefined;
    const userTurns = messages.filter((m: any) => m.role === "user").length;
    const firstUserMsg = messages.find((m: any) => m.role === "user");
    if (firstUserMsg && userTurns <= 1) {
      title = "New Chat";
      try {
        const titleRes = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            messages: [
              { role: "system", content: "Generate a short 3-6 word title for this conversation. Return only the title, no quotes, no punctuation at end." },
              { role: "user", content: firstUserMsg.content.substring(0, 200) }
            ],
            max_tokens: 20,
            temperature: 0.5
          })
        });
        if (titleRes.ok) {
          const titleData = await titleRes.json();
          title = titleData.choices[0].message.content.trim() || title;
        }
      } catch {
        title = firstUserMsg.content.substring(0, 60).trim();
        if (firstUserMsg.content.length > 60) title += "...";
      }
    }

    // Save chat to DB
    if (chatId && userId) {
      const allMessages = [...messages, { role: "assistant", content: reply, timestamp: new Date() }];
      const update: any = { chatId, botId, userId, userName: userName || "User", userEmail: userEmail || "", userRole: userRole || "", messages: allMessages };
      if (title !== undefined) update.title = title; // only set on the first turn
      else update.$setOnInsert = { title: "New Chat" }; // safety for a brand-new doc
      await BotChatModel.findOneAndUpdate({ chatId }, update, { upsert: true, new: true });
    }

    // Update bot stats
    await AiBotModel.findOneAndUpdate({ id: botId }, { $inc: { totalMessages: 1 } });

    return res.status(200).json({ message: reply });
  } catch (err) {
    console.error("Bot chat error:", err);
    return res.status(500).json({ error: "Failed to get response" });
  }
}
