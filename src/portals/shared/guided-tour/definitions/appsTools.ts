import type { TourDefinition } from "../types";

/** Serves BOTH Apps & Tools screens: the read-only grid (sales, sales team
 *  lead, marketing) and the editor (admin, branch manager, C-Level).
 *
 *  The editor has no search box, so its first step simply drops out there.
 *  The card step is worded to be true on both, since a rep clicks through to
 *  the links while the editor shows them on the card itself. Keep it that way
 *  if you edit it. */
export const APPS_TOOLS_TOUR: TourDefinition = {
  id: "apps-tools",
  version: 1,
  steps: [
    {
      target: "at-search",
      title: "Find a tool fast",
      body: "Type part of a name to filter every section at once.",
    },
    {
      target: "at-sections",
      title: "Grouped by job",
      body: "Tools are grouped into sections, so the ones you reach for together sit together.",
    },
    {
      target: "at-card",
      title: "One card per tool",
      body: "Each card carries a short description and the links that get you there: the web version, plus the apps for iPhone and Android.",
    },
    {
      target: "tour-button",
      title: "Replay anytime",
      body: "This button restarts the tour whenever you want a refresher.",
    },
  ],
};
