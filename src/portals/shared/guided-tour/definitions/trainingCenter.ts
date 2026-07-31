import type { TourDefinition } from "../types";

export const TRAINING_CENTER_TOUR: TourDefinition = {
  id: "training-center",
  version: 1,
  steps: [
    {
      // A list, not a sentence: three named tabs are far easier to match to
      // what is on screen as separate lines. Each label matches its tab
      // exactly, so nobody hunts for a control that reads differently.
      target: "tabs",
      title: "Your training areas",
      body: [
        "Courses: the full lesson library.",
        "My Playlists: custom lesson lists you build yourself.",
        "Assigned Playlists: what your manager sent you.",
      ],
    },
    {
      target: "search",
      title: "Find anything fast",
      body: "Type a course name here to filter the library.",
    },
    {
      target: "course-grid",
      title: "Pick a course",
      body: "Each card shows your progress. Click a course to open it and continue where you left off.",
    },
    {
      target: "tour-button",
      title: "Replay anytime",
      body: "This button restarts the tour whenever you want a refresher.",
    },
  ],
};
