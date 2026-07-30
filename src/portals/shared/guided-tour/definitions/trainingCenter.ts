import type { TourDefinition } from "../types";

export const TRAINING_CENTER_TOUR: TourDefinition = {
  id: "training-center",
  version: 1,
  steps: [
    {
      target: "tabs",
      title: "Your training areas",
      body: "Courses holds the full library. My Playlists is where you build custom lesson lists, and Assigned Playlists shows what your manager sent you.",
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
