import type { NextApiRequest, NextApiResponse } from "next";
import { connectMongo } from "../../../src/lib/mongodb";
import { AiBotModel } from "../../../src/lib/models/AiBot";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log("=== CRAWL API CALLED ===");
  console.log("Method:", req.method);
  console.log("Body:", JSON.stringify(req.body));
  
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).end();
  }

  await connectMongo();
  const { botId, url, type } = req.body;
  console.log(`Processing: botId=${botId}, url=${url}, type=${type}`);

  if (!botId || !url) {
    console.error("Missing required fields");
    return res.status(400).json({ error: "Missing botId or url" });
  }

  const bot = await AiBotModel.findOne({ id: botId });
  if (!bot) {
    console.error("Bot not found:", botId);
    return res.status(404).json({ error: "Bot not found" });
  }
  console.log("Bot found:", bot.name);

  try {
    let content = "";
    console.log(`Starting content fetch for type: ${type}`);

    if (type === "youtube") {
      console.log("Calling fetchYouTubeTranscript...");
      content = await fetchYouTubeTranscript(url);
      console.log(`YouTube transcript fetched, length: ${content.length}`);
    } else if (type === "vimeo") {
      console.log("Calling fetchVimeoTranscript...");
      content = await fetchVimeoTranscript(url);
      console.log(`Vimeo transcript fetched, length: ${content.length}`);
    } else if (type === "loom") {
      console.log("Calling fetchLoomTranscript...");
      content = await fetchLoomTranscript(url);
      console.log(`Loom transcript fetched, length: ${content.length}`);
    } else if (type === "pdf") {
      console.log("Calling fetchPdfContent...");
      content = await fetchPdfContent(url);
    } else if (type === "word-doc") {
      console.log("Calling fetchWordContent...");
      content = await fetchWordContent(url);
    } else if (type === "excel-csv") {
      console.log("Calling fetchExcelContent...");
      content = await fetchExcelContent(url);
    } else {
      console.log("Calling fetchWebContent...");
      content = await fetchWebContent(url, type === "full-website");
    }

    console.log(`Content fetched successfully, length: ${content.length}`);

    const newLink = {
      id: `link-${Date.now()}`,
      url,
      type,
      status: "trained",
      chars: content.length
    };

    bot.trainingLinks = bot.trainingLinks || [];
    bot.trainingLinks.push(newLink);
    bot.trainingText = (bot.trainingText || "") + `\n\n[Source: ${url}]\n${content}`;
    
    console.log("Saving bot with new training data...");
    await bot.save();
    console.log("Bot saved successfully");

    return res.status(200).json({ link: newLink, extractedChars: content.length });
  } catch (error: any) {
    console.error("=== CRAWL ERROR ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);

    const failedLink = {
      id: `link-${Date.now()}`,
      url,
      type,
      status: "failed",
      chars: 0
    };

    try {
      bot.trainingLinks = bot.trainingLinks || [];
      bot.trainingLinks.push(failedLink);
      await bot.save();
    } catch (saveError) {
      console.error("Error saving failed link:", saveError);
    }

    return res.status(200).json({ 
      link: failedLink, 
      error: error.message || "Failed to process content"
    });
  }
}

async function fetchWebContent(url: string, fullWebsite: boolean): Promise<string> {
  const cheerio = require("cheerio");

  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch: ${response.statusText}`);

  const html = await response.text();
  const $ = cheerio.load(html);

  $("script, style, nav, footer, header").remove();
  let text = $("body").text().trim().replace(/\s+/g, " ");

  if (fullWebsite) {
    const links = new Set<string>();
    $("a[href]").each((_: number, el: any) => {
      const href = $(el).attr("href");
      if (href && href.startsWith("/")) {
        const baseUrl = new URL(url).origin;
        links.add(baseUrl + href);
      }
    });

    const maxPages = 10;
    let count = 0;
    for (const link of links) {
      if (count >= maxPages) break;
      try {
        const subResponse = await fetch(link);
        if (subResponse.ok) {
          const subHtml = await subResponse.text();
          const $sub = cheerio.load(subHtml);
          $sub("script, style, nav, footer, header").remove();
          text += "\n\n" + $sub("body").text().trim().replace(/\s+/g, " ");
        }
      } catch {}
      count++;
    }
  }

  return text.substring(0, 500000);
}

async function fetchPdfContent(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch PDF: ${response.statusText}`);

  const buffer = await response.arrayBuffer();
  const pdfParse = require("pdf-parse");
  const data = await pdfParse(Buffer.from(buffer));
  return data.text;
}

async function fetchWordContent(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch Word doc: ${response.statusText}`);

  const buffer = await response.arrayBuffer();
  const mammoth = require("mammoth");
  const result = await mammoth.extractRawText({ buffer: Buffer.from(buffer) });
  return result.value;
}

async function fetchExcelContent(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to fetch Excel file: ${response.statusText}`);

  const buffer = await response.arrayBuffer();
  const XLSX = require("xlsx");
  const workbook = XLSX.read(Buffer.from(buffer), { type: "buffer" });
  let text = "";
  workbook.SheetNames.forEach((sheetName: string) => {
    const sheet = workbook.Sheets[sheetName];
    text += XLSX.utils.sheet_to_csv(sheet) + "\n\n";
  });
  return text;
}

async function fetchYouTubeTranscript(url: string): Promise<string> {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new Error(`Invalid YouTube URL: ${url}`);

  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY not configured in environment");

  // Get caption tracks list via YouTube Data API v3
  const captionsListRes = await fetch(
    `https://www.googleapis.com/youtube/v3/captions?part=snippet&videoId=${videoId}&key=${apiKey}`
  );
  if (!captionsListRes.ok) {
    const err = await captionsListRes.json();
    throw new Error(`YouTube API error: ${err?.error?.message || captionsListRes.statusText}`);
  }

  const captionsData = await captionsListRes.json();
  const items = captionsData.items || [];
  if (items.length === 0) throw new Error("No captions available for this video.");

  const track = items.find((t: any) => t.snippet?.language === "en") ||
                items.find((t: any) => t.snippet?.language?.startsWith("en")) ||
                items[0];
  const lang = track.snippet?.language || "en";

  // Try timedtext API
  const timedTextUrl = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`;
  const ttRes = await fetch(timedTextUrl, {
    headers: { "User-Agent": "Mozilla/5.0", "Referer": `https://www.youtube.com/watch?v=${videoId}` }
  });

  if (ttRes.ok) {
    const raw = await ttRes.text();
    if (raw && raw.trim().startsWith("{")) {
      const json = JSON.parse(raw);
      const text = (json?.events || [])
        .filter((e: any) => e.segs)
        .flatMap((e: any) => e.segs.map((s: any) => s.utf8 || ""))
        .filter((s: string) => s.trim() && s.trim() !== "\n")
        .join(" ").replace(/\s+/g, " ").trim();
      if (text.length > 0) {
        const langNote = lang !== "en" ? ` [Language: ${lang}]` : "";
        return `YouTube Video Transcript${langNote} (${url}):\n\n${text}`;
      }
    }
  }

  throw new Error("Could not fetch YouTube transcript. YouTube is blocking server-side access. Please copy the transcript manually from YouTube and paste it in the Text section.");
}

function extractYouTubeId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  
  // Clean the URL
  url = url.trim();
  
  const patterns = [
    /(?:youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/v\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/  // Just the video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      console.log(`Extracted video ID: ${match[1]} from URL: ${url}`);
      return match[1];
    }
  }

  console.error(`No video ID found in URL: ${url}`);
  return null;
}

async function fetchVimeoTranscript(url: string): Promise<string> {
  const videoId = extractVimeoId(url);
  if (!videoId) throw new Error(`Invalid Vimeo URL: ${url}`);

  try {
    // Try to scrape the Vimeo page directly for title and description
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Could not access Vimeo video: ${response.statusText}`);
    }

    const html = await response.text();
    const cheerio = require("cheerio");
    const $ = cheerio.load(html);
    
    // Extract title and description from the page
    const title = $('title').text().replace(' on Vimeo', '').trim() || 
                  $('h1').first().text().trim() || 
                  $('meta[property="og:title"]').attr('content') || '';
    
    const description = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content') || 
                       $('.description').text().trim() || '';
    
    let content = `Vimeo Video (${url}):\n\n`;
    
    if (title) {
      content += `Title: ${title}\n\n`;
    }
    
    if (description) {
      content += `Description: ${description}\n\n`;
    }
    
    // If we got some content, return it
    if (title || description) {
      return content;
    }
    
    // If no content found, provide a helpful message
    throw new Error("No title or description found for this Vimeo video. The video might be private or the page structure has changed. Please copy the video content manually and paste it in the Text section.");
    
  } catch (error: any) {
    // Provide a more user-friendly error message
    if (error.message.includes('fetch')) {
      throw new Error("Could not access Vimeo video. The video might be private or restricted. Please copy the video transcript manually and paste it in the Text section.");
    }
    throw new Error(error.message || 'Could not fetch Vimeo video content');
  }
}

async function fetchLoomTranscript(url: string): Promise<string> {
  const videoId = extractLoomId(url);
  if (!videoId) throw new Error(`Invalid Loom URL: ${url}`);

  try {
    // Try to scrape the Loom page for title and description
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Could not access Loom video: ${response.statusText}`);
    }
    
    const html = await response.text();
    const cheerio = require("cheerio");
    const $ = cheerio.load(html);
    
    // Try multiple selectors to extract title and description
    const title = $('title').text().replace(' | Loom', '').trim() || 
                  $('h1').first().text().trim() || 
                  $('meta[property="og:title"]').attr('content') || 
                  $('[data-testid="video-title"]').text().trim() || '';
    
    const description = $('meta[name="description"]').attr('content') || 
                       $('meta[property="og:description"]').attr('content') || 
                       $('[data-testid="video-description"]').text().trim() || 
                       $('.description').text().trim() || '';
    
    let content = `Loom Video (${url}):\n\n`;
    
    if (title) {
      content += `Title: ${title}\n\n`;
    }
    
    if (description) {
      content += `Description: ${description}\n\n`;
    }
    
    // If we got some content, return it
    if (title || description) {
      return content;
    }
    
    // If no content found, provide a helpful message
    throw new Error("No title or description found for this Loom video. The video might be private or require login. Please copy the video transcript manually from Loom and paste it in the Text section.");
    
  } catch (error: any) {
    // Provide a more user-friendly error message
    if (error.message.includes('fetch') || error.message.includes('access')) {
      throw new Error("Could not access Loom video. The video might be private or require authentication. Please copy the video transcript manually from Loom and paste it in the Text section.");
    }
    throw new Error(error.message || 'Could not fetch Loom video content');
  }
}

function extractVimeoId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  
  url = url.trim();
  
  const patterns = [
    /(?:vimeo\.com\/)([0-9]+)/,
    /(?:player\.vimeo\.com\/video\/)([0-9]+)/,
    /^([0-9]+)$/  // Just the video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      console.log(`Extracted Vimeo video ID: ${match[1]} from URL: ${url}`);
      return match[1];
    }
  }

  console.error(`No Vimeo video ID found in URL: ${url}`);
  return null;
}

function extractLoomId(url: string): string | null {
  if (!url || typeof url !== 'string') return null;
  
  url = url.trim();
  
  const patterns = [
    /(?:loom\.com\/share\/)([a-zA-Z0-9]+)/,
    /(?:loom\.com\/embed\/)([a-zA-Z0-9]+)/,
    /^([a-zA-Z0-9]+)$/  // Just the video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      console.log(`Extracted Loom video ID: ${match[1]} from URL: ${url}`);
      return match[1];
    }
  }

  console.error(`No Loom video ID found in URL: ${url}`);
  return null;
}
