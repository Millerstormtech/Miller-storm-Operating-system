import { Schema, model, models } from "mongoose";

// One retrievable piece of a Master AI bot's training material, with its
// embedding vector. At query time we embed the user's question and rank these
// by cosine similarity, feeding only the most relevant chunks to the model
// (RAG) instead of stuffing the entire training corpus into the prompt.
const botChunkSchema = new Schema(
  {
    botId: { type: String, required: true, index: true },
    source: { type: String, default: "text" }, // text | course | qa
    label: { type: String, default: "" },       // human hint, e.g. "Course" / "FAQ"
    content: { type: String, required: true },
    embedding: { type: [Number], required: true },
  },
  { timestamps: true }
);

botChunkSchema.index({ botId: 1 });

export const BotChunkModel = models.BotChunk || model("BotChunk", botChunkSchema);
