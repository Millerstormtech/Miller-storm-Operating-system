import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end();
    return;
  }

  const { videoUrl } = req.body;

  if (!videoUrl) {
    res.status(400).json({ error: "Video URL is required" });
    return;
  }

  try {
    // Extract video ID and platform
    let videoInfo = { platform: "unknown", videoId: "", title: "", description: "", duration: "", thumbnail: "" };
    
    if (videoUrl.includes("youtube.com") || videoUrl.includes("youtu.be")) {
      const youtubeId = extractYouTubeId(videoUrl);
      if (youtubeId) {
        videoInfo = await getYouTubeInfo(youtubeId);
      }
    } else if (videoUrl.includes("vimeo.com")) {
      const vimeoId = extractVimeoId(videoUrl);
      if (vimeoId) {
        videoInfo = await getVimeoInfo(vimeoId);
      }
    }

    // Use OpenAI to generate detailed analysis
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
            content: "You are a video content analyzer. Based on the video information provided, generate a comprehensive analysis including likely topics, educational value, key learning points, and content summary."
          },
          {
            role: "user",
            content: `Analyze this video:
URL: ${videoUrl}
Title: ${videoInfo.title || "Unknown"}
Description: ${videoInfo.description || "No description available"}
Duration: ${videoInfo.duration || "Unknown"}
Platform: ${videoInfo.platform}

Provide a detailed analysis of what this video likely covers, its educational content, key topics, and learning objectives.`
          }
        ],
        temperature: 0.7,
        max_tokens: 800
      })
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const aiData = await response.json();
    
    res.status(200).json({
      ...videoInfo,
      analysis: aiData.choices[0].message.content,
      url: videoUrl
    });
  } catch (error) {
    console.error("Video analysis error:", error);
    res.status(500).json({ error: "Failed to analyze video" });
  }
}

function extractYouTubeId(url: string): string | null {
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

function extractVimeoId(url: string): string | null {
  const regex = /vimeo\.com\/(?:.*\/)?(\d+)/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

async function getYouTubeInfo(videoId: string) {
  // Basic YouTube info (you'd need YouTube API key for full details)
  return {
    platform: "YouTube",
    videoId,
    title: "YouTube Video",
    description: "YouTube video content",
    duration: "Unknown",
    thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`
  };
}

async function getVimeoInfo(videoId: string) {
  try {
    const response = await fetch(`https://vimeo.com/api/v2/video/${videoId}.json`);
    if (response.ok) {
      const data = await response.json();
      const video = data[0];
      return {
        platform: "Vimeo",
        videoId,
        title: video.title || "Vimeo Video",
        description: video.description || "Vimeo video content",
        duration: video.duration ? `${Math.floor(video.duration / 60)}:${(video.duration % 60).toString().padStart(2, '0')}` : "Unknown",
        thumbnail: video.thumbnail_large || ""
      };
    }
  } catch (error) {
    console.error("Vimeo API error:", error);
  }
  
  return {
    platform: "Vimeo",
    videoId,
    title: "Vimeo Video",
    description: "Vimeo video content",
    duration: "Unknown",
    thumbnail: ""
  };
}