import type { NextApiRequest, NextApiResponse } from "next";
import { requireUser, allowMethods } from "../../src/lib/auth";

// Text-to-speech via OpenAI. Takes a chunk of text and returns natural-sounding
// MP3 audio, used by the AI-clone voice conversation so the bot "talks" back in
// a human voice (and so the audio can be recorded/downloaded). Uses the same
// OPENAI_API_KEY as the chat — no separate account.
export const config = { api: { responseLimit: false } };

const ALLOWED = ["nova", "shimmer", "alloy", "echo", "onyx", "fable"];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;

  const { text, voice } = req.body || {};
  if (!text || typeof text !== "string" || !text.trim()) {
    res.status(400).json({ error: "text is required" });
    return;
  }
  const chosenVoice = ALLOWED.includes(voice) ? voice : "nova";

  try {
    const r = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "tts-1",
        voice: chosenVoice,
        input: text.slice(0, 4000), // OpenAI hard limit is 4096 chars
        response_format: "mp3",
      }),
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("[tts] OpenAI error", r.status, detail);
      res.status(502).json({ error: "Text-to-speech failed" });
      return;
    }

    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(buf);
  } catch (e) {
    console.error("[tts] error", e);
    res.status(500).json({ error: "Text-to-speech failed" });
  }
}
