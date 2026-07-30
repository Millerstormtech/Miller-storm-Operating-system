import type { TourDefinition } from "../types";

export const TRAINING_COURSE_TOUR: TourDefinition = {
  id: "training-course",
  version: 1,
  steps: [
    {
      target: "lesson-sidebar",
      title: "Lessons in order",
      body: "Lessons unlock from top to bottom, so finish one to open the next. Quizzes need 80% to pass, with 2 tries before a rewatch.",
    },
    {
      target: "video-area",
      title: "Watch to complete",
      body: "Watch the video to the end to mark the lesson complete. Skipping ahead is limited.",
    },
    {
      target: "course-ai",
      title: "Ask the AI helper",
      body: "Stuck on something? Ask questions about this course here.",
    },
    {
      target: "tour-button",
      title: "Replay anytime",
      body: "This button restarts the tour whenever you want a refresher.",
    },
  ],
};
