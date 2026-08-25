import type { TourDefinition } from "../types";

/** Storm Chat as reps and sales team leads see it. Admin and C-Level get the
 *  management screen instead, which has its own tour in stormChatManage.ts. */
export const STORM_CHAT_TOUR: TourDefinition = {
  id: "storm-chat",
  version: 1,
  steps: [
    {
      target: "sc-search",
      title: "Find a conversation",
      body: "Type to filter your groups and your direct messages down to the one you want.",
    },
    {
      target: "sc-new",
      title: "Message someone directly",
      body: "Pick anyone in the company and start a private conversation with them.",
    },
    {
      target: "sc-groups",
      title: "Groups",
      body: [
        "The group chats you belong to.",
        "A private group you are not in shows a Join tag. Tap it to ask for access, and an admin approves or declines.",
      ],
    },
    {
      target: "sc-dms",
      title: "Direct messages",
      body: "Your one to one conversations. The red number is how many messages you have not read yet.",
    },
    {
      target: "tour-button",
      title: "Replay anytime",
      body: "This button restarts the tour whenever you want a refresher.",
    },
  ],
};
