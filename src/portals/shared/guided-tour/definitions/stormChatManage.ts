import type { TourDefinition } from "../types";

/** The Storm Chat management screen (admin and C-Level): the same inbox, plus
 *  the controls that create groups and decide who is in them.
 *
 *  There is deliberately no step on the group visibility switch. It lives
 *  inside the create/edit form, and that form REPLACES the list it is reached
 *  from, so a step pointing at it could never appear while the list is on
 *  screen. The public/private explanation rides along on the create step
 *  instead. */
export const STORM_CHAT_MANAGE_TOUR: TourDefinition = {
  id: "storm-chat-manage",
  version: 1,
  steps: [
    {
      target: "scm-create-group",
      title: "Create a group",
      body: [
        "Name it, give it a picture and a description, then tick the people who belong in it.",
        "You also choose there whether it is public for the whole company, or private and invite only.",
      ],
    },
    {
      target: "scm-groups",
      title: "Opening and managing a group",
      body: "Single click opens a group and its messages. Double click opens the info panel instead, where you add or remove members and make someone a group admin.",
    },
    {
      target: "scm-requests",
      title: "Requests waiting on you",
      body: "The number on this button is how many people are asking for access to a private group. Nobody gets in until someone approves them.",
    },
    {
      target: "scm-new-message",
      title: "Message someone directly",
      body: "Pick anyone in the company and start a private conversation with them.",
    },
    {
      target: "tour-button",
      title: "Replay anytime",
      body: "This button restarts the tour whenever you want a refresher.",
    },
  ],
};
