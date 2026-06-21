import type { NextApiRequest, NextApiResponse } from "next";

async function fetchUrlContent(url: string): Promise<string> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    if (!response.ok) {
      return `[Unable to fetch content from ${url}]`;
    }

    const html = await response.text();
    
    // Basic HTML to text conversion - remove scripts, styles, and tags
    let text = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    
    // Limit to first 3000 characters to avoid token limits
    if (text.length > 3000) {
      text = text.substring(0, 3000) + '...';
    }
    
    return text;
  } catch (error) {
    console.error('Error fetching URL:', error);
    return `[Unable to fetch content from ${url}]`;
  }
}

function extractUrls(text: string): string[] {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end();
    return;
  }

  const { message, attachments } = req.body;

  try {
    console.log("API Key exists:", !!process.env.OPENAI_API_KEY);
    console.log("Message:", message);
    console.log("Attachments:", attachments?.length || 0);

    // Check for URLs in the message
    const urls = extractUrls(message);
    let urlContent = '';
    
    if (urls.length > 0) {
      console.log("Found URLs:", urls);
      const urlContents = await Promise.all(
        urls.slice(0, 3).map(async (url) => {
          const content = await fetchUrlContent(url);
          return `\n\nContent from ${url}:\n${content}`;
        })
      );
      urlContent = urlContents.join('\n');
    }

    // Build messages array with support for images
    const messages: any[] = [
      { 
        role: "system", 
        content: "You are a helpful AI assistant. When users share URLs, analyze the content from those pages. When users share images, analyze them in detail. When users share videos, acknowledge them and explain you can see video files but provide general guidance. When users share documents, acknowledge them and offer to discuss their content." 
      }
    ];

    // If there are attachments, use vision model
    if (attachments && attachments.length > 0) {
      const content: any[] = [{ type: "text", text: message + urlContent }];
      
      attachments.forEach((att: any) => {
        if (att.type === 'image') {
          content.push({
            type: "image_url",
            image_url: {
              url: att.url
            }
          });
        } else if (att.type === 'video') {
          content[0].text += `\n\n[User attached a video file: ${att.name}]`;
        } else if (att.type === 'document') {
          content[0].text += `\n\n[User attached a document: ${att.name}]`;
        }
      });

      messages.push({ role: "user", content });
    } else {
      messages.push({ role: "user", content: message + urlContent });
    }

    // Use gpt-4o if there are images (supports vision), otherwise use gpt-3.5-turbo
    const model = attachments?.some((att: any) => att.type === 'image') 
      ? "gpt-4o" 
      : "gpt-3.5-turbo";

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: 1000
      })
    });

    console.log("OpenAI Response Status:", response.status);
    
    if (!response.ok) {
      const errorData = await response.text();
      console.error("OpenAI Error:", errorData);
      throw new Error(`OpenAI API error: ${response.status} ${errorData}`);
    }

    const data = await response.json();
    console.log("OpenAI Success:", data.choices?.[0]?.message?.content);
    
    res.status(200).json({ message: data.choices[0].message.content });
  } catch (error: any) {
    console.error("Sales chat API error:", error);
    res.status(500).json({ error: "Failed to get response from AI: " + error.message });
  }
}
