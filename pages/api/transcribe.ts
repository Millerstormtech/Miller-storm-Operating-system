import type { NextApiRequest, NextApiResponse } from "next";
import { requireUser, allowMethods } from "../../src/lib/auth";

// Speech-to-text via OpenAI Whisper. Takes a short recorded audio clip (the
// user's spoken turn, as a base64 data URL) and returns the transcript. Used by
// the AI-clone voice conversation instead of the browser's SpeechRecognition,
// which is Chrome-only, English-only, and fights the mic with the recorder.
// Whisper auto-detects the language (English, Gujarati, Hindi, …) and works in
// any browser. Uses the same OPENAI_API_KEY as the chat/TTS — no new account.
export const config = { api: { bodyParser: { sizeLimit: "25mb" } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!allowMethods(req, res, ["POST"])) return;
  const auth = requireUser(req, res);
  if (!auth) return;

  const { audio, mime, lang } = req.body || {};
  if (!audio || typeof audio !== "string") {
    res.status(400).json({ error: "audio is required" });
    return;
  }

  try {
    // `audio` is a data URL ("data:audio/webm;base64,....") or raw base64.
    const base64 = audio.includes(",") ? audio.split(",")[1] : audio;
    const buf = Buffer.from(base64, "base64");
    if (!buf.length) {
      res.status(400).json({ error: "empty audio" });
      return;
    }

    const type = typeof mime === "string" && mime ? mime : "audio/webm";
    const ext = type.includes("mp4") ? "mp4" : type.includes("ogg") ? "ogg" : type.includes("wav") ? "wav" : "webm";

    const form = new FormData();
    form.append("file", new Blob([buf], { type }), `speech.${ext}`);
    form.append("model", "whisper-1");
    // Only pin a language when the caller is sure; otherwise let Whisper detect
    // it so multilingual speakers are transcribed correctly.
    if (typeof lang === "string" && lang) form.append("language", lang);

    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form as any,
    });

    if (!r.ok) {
      const detail = await r.text().catch(() => "");
      console.error("[transcribe] OpenAI error", r.status, detail);
      res.status(502).json({ error: "Transcription failed" });
      return;
    }

    const data = await r.json();
    res.status(200).json({ text: (data.text || "").trim() });
  } catch (e) {
    console.error("[transcribe] error", e);
    res.status(500).json({ error: "Transcription failed" });
  }
}
