import type { TourDefinition } from "../types";

/** The AI bot chat, reached as "Jay's AI Clone" for leaders and as AI Chat for
 *  sales and marketing. Two steps come and go with the state of the screen and
 *  are meant to: the starter questions exist only on a fresh chat, and the
 *  download buttons appear only once there is something to download. */
export const AI_CHAT_TOUR: TourDefinition = {
  id: "ai-chat",
  version: 1,
  steps: [
    {
      target: "ac-new",
      title: "Start a new chat",
      body: "Each chat is its own conversation. A new one gives the bot a clean slate with no memory of the last thread.",
    },
    {
      target: "ac-history",
      title: "Your past chats",
      body: "Everything you have asked is saved here, so you can pick a conversation back up later.",
    },
    {
      target: "ac-suggestions",
      title: "Not sure what to ask",
      body: "These starter questions show on a fresh chat. Tap one to get going.",
    },
    {
      target: "ac-input",
      title: "Ask anything",
      body: "Type your question here. The plus button attaches a file to the message.",
    },
    {
      target: "ac-voice",
      title: "Talk instead of typing",
      body: "The microphone starts a hands-free conversation. It listens, answers out loud, then listens again, so you can use it while driving.",
    },
    {
      target: "ac-download",
      title: "Keep a copy",
      body: "Download the conversation as text, or the voice recording as an audio file.",
    },
    {
      target: "tour-button",
      title: "Replay anytime",
      body: "This button restarts the tour whenever you want a refresher.",
    },
  ],
};
