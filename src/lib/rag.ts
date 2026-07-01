import { AiBotModel } from "./models/AiBot";
import { BotChunkModel } from "./models/BotChunk";

// Retrieval-Augmented Generation helpers for the Master AI bots.
//
// Instead of cramming every bit of training material into the prompt (which
// truncated large courses and degraded accuracy), we split the material into
// chunks, embed each one, and store them. At query time we embed the user's
// question and return only the most semantically-similar chunks. Similarity is
// computed in-process (cosine) so it works on plain MongoDB — no Atlas Vector
// Search dependency, which matters because local dev runs a community mongod.

const EMBED_MODEL = "text-embedding-3-small"; // 1536-dim, cheap, good quality
const EMBED_URL = "https://api.openai.com/v1/embeddings";

/** Split text into overlapping character windows for embedding. */
export function chunkText(text: string, size = 1200, overlap = 200): string[] {
  const clean = (text || "").replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (!clean) return [];
  const chunks: string[] = [];
  let i = 0;
  while (i < clean.length) {
    const end = Math.min(i + size, clean.length);
    const piece = clean.slice(i, end).trim();
    if (piece) chunks.push(piece);
    if (end >= clean.length) break;
    i = end - overlap; // slide with overlap so answers aren't split across a seam
    if (i < 0) i = 0;
  }
  return chunks;
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const res = await fetch(EMBED_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Embedding API error ${res.status}: ${detail}`);
  }
  const data = await res.json();
  // Preserve input order (API returns objects with an `index`).
  return (data.data as any[])
    .slice()
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding as number[]);
}

/** Embed many texts, batched to stay within request limits. */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  const BATCH = 96;
  for (let i = 0; i < texts.length; i += BATCH) {
    const embs = await embedBatch(texts.slice(i, i + BATCH));
    out.push(...embs);
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [e] = await embedBatch([text.slice(0, 8000)]);
  return e;
}

export function cosineSim(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

type SourceChunk = { source: string; label: string; content: string };

/** Turn a bot's stored training fields into labelled, retrievable chunks. */
function buildSourceChunks(bot: any): SourceChunk[] {
  const items: SourceChunk[] = [];

  // Q&A: each pair is its own high-signal chunk.
  for (const q of bot.qaItems || []) {
    if (q?.question && q?.answer) {
      items.push({ source: "qa", label: "FAQ", content: `Q: ${q.question}\nA: ${q.answer}` });
    }
  }
  // Free-form training text (websites / uploaded documents).
  for (const c of chunkText(bot.trainingText || "")) {
    items.push({ source: "text", label: "Training", content: c });
  }
  // Course content (lessons + transcripts).
  for (const c of chunkText(bot.courseTrainingText || "")) {
    items.push({ source: "course", label: "Course", content: c });
  }
  return items;
}

/**
 * Rebuild the embedding index for one bot: chunk all its training material,
 * embed it, and replace the stored chunks. Safe to call repeatedly. Returns
 * the number of chunks indexed (0 if the bot has no material or no API key).
 */
export async function reindexBot(botId: string): Promise<{ chunks: number }> {
  const bot = await AiBotModel.findOne({ id: botId }).lean<any>();
  if (!bot) return { chunks: 0 };

  const sources = buildSourceChunks(bot);

  // Clear old chunks first so retrieval never mixes stale material.
  await BotChunkModel.deleteMany({ botId });
  if (!sources.length) return { chunks: 0 };

  const embeddings = await embedTexts(sources.map((s) => s.content));
  const docs = sources.map((s, i) => ({
    botId,
    source: s.source,
    label: s.label,
    content: s.content,
    embedding: embeddings[i],
  }));

  const BATCH = 500;
  for (let i = 0; i < docs.length; i += BATCH) {
    await BotChunkModel.insertMany(docs.slice(i, i + BATCH), { ordered: false });
  }
  return { chunks: docs.length };
}

/** Fire-and-forget reindex used from save/upload/crawl handlers. */
export function reindexBotInBackground(botId: string): void {
  reindexBot(botId)
    .then((r) => console.log(`[RAG] Reindexed bot ${botId}: ${r.chunks} chunks`))
    .catch((e) => console.error(`[RAG] Reindex failed for bot ${botId}:`, e?.message || e));
}

/**
 * Return the most relevant training chunks for a query, capped by count and a
 * total character budget. Empty array means "no index yet" — callers should
 * fall back to the legacy full-text approach.
 */
export async function retrieveRelevant(
  botId: string,
  query: string,
  topK = 12,
  maxChars = 60000
): Promise<string[]> {
  const q = (query || "").trim();
  if (!q) return [];

  const chunks = await BotChunkModel.find({ botId }).lean<any[]>();
  if (!chunks.length) return [];

  const qEmb = await embedQuery(q);
  const scored = chunks
    .map((c) => ({ content: c.content as string, score: cosineSim(qEmb, c.embedding || []) }))
    .sort((a, b) => b.score - a.score);

  const out: string[] = [];
  let used = 0;
  for (const s of scored.slice(0, topK)) {
    if (used + s.content.length > maxChars) break;
    out.push(s.content);
    used += s.content.length;
  }
  return out;
}
