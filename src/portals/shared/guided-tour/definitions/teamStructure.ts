import type { TourDefinition } from "../types";

/** The org chart, identical for all six roles. NOTE the naming split: the
 *  route, the folder and this id all say "team-structure", but every sidebar
 *  labels the page "Organization Chart". Use the menu label in the copy. Two steps share the "ts-chart"
 *  target on purpose: reading the chart and moving around it are separate
 *  ideas, and the pan/zoom controls are invisible until someone says them out
 *  loud (there is no zoom button, only ctrl+scroll and the +/-/0 keys). */
export const TEAM_STRUCTURE_TOUR: TourDefinition = {
  id: "team-structure",
  version: 1,
  steps: [
    {
      target: "ts-counts",
      title: "Who is on the roster",
      body: "A live headcount for each role. These move as people join, change roles, or are moved between branches.",
    },
    {
      target: "ts-search",
      title: "Find a person",
      body: "Type a name or an email to narrow the chart down to the people who match.",
    },
    {
      target: "ts-chart",
      title: "How to read it",
      body: [
        "The chart runs top down: C-Level, then branch managers, then sales team leads, then their reps.",
        "Your own card is highlighted, so you can spot yourself quickly.",
      ],
    },
    {
      target: "ts-chart",
      title: "Moving around",
      body: "Click and drag to pan. Hold Ctrl and scroll to zoom, or hover the chart and press plus, minus, or zero to reset.",
      placement: "top",
    },
    {
      target: "ts-others",
      title: "Everyone else",
      body: "Marketing, admins, and anyone not yet assigned to a branch sit in rows below the chart rather than inside it.",
    },
    {
      target: "tour-button",
      title: "Replay anytime",
      body: "This button restarts the tour whenever you want a refresher.",
    },
  ],
};
