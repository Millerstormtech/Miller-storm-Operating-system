import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end();
    return;
  }

  const { messages, lessonTitle, lessonContent, videoUrl, courseTitle, allPages, trainingText, hasTraining } = req.body;

  try {
    const userMessage = messages[messages.length - 1]?.content || "";
    const videoUrlPattern = /(https?:\/\/(?:www\.)?(youtube\.com|youtu\.be|vimeo\.com)\/[^\s]+)/gi;
    const foundVideoUrls = userMessage.match(videoUrlPattern);

    let videoAnalysis = "";
    if (foundVideoUrls && foundVideoUrls.length > 0) {
      try {
        const videoResponse = await fetch(`http://localhost:3000/api/analyze-video`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoUrl: foundVideoUrls[0] })
        });
        if (videoResponse.ok) {
          const videoData = await videoResponse.json();
          videoAnalysis = `\n\nVIDEO ANALYSIS:\nTitle: ${videoData.title}\nPlatform: ${videoData.platform}\nDuration: ${videoData.duration}\nDescription: ${videoData.description}\nDetailed Analysis: ${videoData.analysis}`;
        }
      } catch (error) {
        console.error("Video analysis failed:", error);
      }
    }

    let systemPrompt = "";

    if (hasTraining && trainingText && trainingText.trim().length > 0) {
      // Bot has training — restrict to selected course content only
      systemPrompt = `You are a helpful training coach assistant. Answer questions ONLY based on the following trained course content. If the user asks about anything not covered in this content, politely say you can only answer questions about the trained course material.\n\nTRAINED COURSE CONTENT:\n${trainingText}${videoAnalysis}`;
    } else {
      // No training selected — chat freely
      systemPrompt = `You are a helpful AI assistant. Answer any questions the user has freely and helpfully.${videoAnalysis}`;
    }

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages
        ],
        temperature: 0.7,
        max_tokens: 500
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const data = await response.json();
    res.status(200).json({ message: data.choices[0].message.content });
  } catch (error) {
    console.error("Chat API error:", error);
    res.status(500).json({ error: "Failed to get response from AI" });
  }
}
