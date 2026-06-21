import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end();
    return;
  }

  const { firstMessage, secondMessage } = req.body;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: "Generate a short, concise title (3-5 words max) for this conversation. The title should capture the main topic. Return ONLY the title, nothing else."
          },
          {
            role: "user",
            content: `User: ${firstMessage}\nAssistant: ${secondMessage}`
          }
        ],
        temperature: 0.7,
        max_tokens: 20
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const title = data.choices[0].message.content.trim().replace(/^["']|["']$/g, '');
    
    res.status(200).json({ title });
  } catch (error: any) {
    console.error("Generate title error:", error);
    res.status(500).json({ error: error.message });
  }
}
