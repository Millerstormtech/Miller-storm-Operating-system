import { describe, expect, it } from "vitest";
import { COURSE_LEADERBOARD_TOUR } from "./definitions/courseLeaderboard";
import { SALES_LEADERBOARD_TOUR } from "./definitions/salesLeaderboard";
import { TRAINING_CENTER_TOUR } from "./definitions/trainingCenter";
import { TRAINING_COURSE_TOUR } from "./definitions/trainingCourse";
import { AI_CHAT_TOUR } from "./definitions/aiChat";
import { APPS_TOOLS_TOUR } from "./definitions/appsTools";
import { STORM_CHAT_TOUR } from "./definitions/stormChat";
import { STORM_CHAT_MANAGE_TOUR } from "./definitions/stormChatManage";
import { TEAM_STRUCTURE_TOUR } from "./definitions/teamStructure";
import type { TourDefinition } from "./types";

/** Every tour in the app. A new definition MUST be added here, or none of the
 *  invariants below protect it. */
const ALL: TourDefinition[] = [
  COURSE_LEADERBOARD_TOUR,
  SALES_LEADERBOARD_TOUR,
  TRAINING_CENTER_TOUR,
  TRAINING_COURSE_TOUR,
  AI_CHAT_TOUR,
  APPS_TOOLS_TOUR,
  STORM_CHAT_TOUR,
  STORM_CHAT_MANAGE_TOUR,
  TEAM_STRUCTURE_TOUR,
];

/** Both the em dash and the en dash. Product copy uses a colon, a comma, or a
 *  full stop instead, on Youssef's standing instruction. */
const DASHES = /[\u2014\u2013]/;

function bodyLines(step: { body: string | string[] }): string[] {
  return Array.isArray(step.body) ? step.body : [step.body];
}

describe("tour definitions", () => {
  it("has no duplicate ids", () => {
    const ids = ALL.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(ALL.map((t) => [t.id, t] as const))("%s is well formed", (_id, tour) => {
    expect(tour.version).toBeGreaterThanOrEqual(1);
    expect(tour.steps.length).toBeGreaterThanOrEqual(2);
  });

  // The "?" replay control is the one target every screen has, because
  // PageHeader renders it whenever a tour is mounted. Ending there means the
  // last thing a user is shown is how to get the tour back.
  it.each(ALL.map((t) => [t.id, t] as const))("%s ends on the replay step", (_id, tour) => {
    expect(tour.steps[tour.steps.length - 1].target).toBe("tour-button");
  });

  it.each(ALL.map((t) => [t.id, t] as const))("%s has no empty copy", (_id, tour) => {
    for (const step of tour.steps) {
      expect(step.title.trim()).not.toBe("");
      expect(step.target.trim()).not.toBe("");
      for (const line of bodyLines(step)) expect(line.trim()).not.toBe("");
    }
  });

  it.each(ALL.map((t) => [t.id, t] as const))("%s uses no em or en dashes", (_id, tour) => {
    for (const step of tour.steps) {
      expect(step.title).not.toMatch(DASHES);
      for (const line of bodyLines(step)) expect(line).not.toMatch(DASHES);
    }
  });

  // A step whose target is never marked in the UI is invisible: the engine
  // skips it silently, so a typo would never surface as a failure anywhere.
  // Only "tour-button" is exempt, since PageHeader owns that marker.
  it.each(ALL.map((t) => [t.id, t] as const))("%s repeats no target needlessly", (_id, tour) => {
    const seen = new Map<string, number>();
    for (const step of tour.steps) {
      seen.set(step.target, (seen.get(step.target) ?? 0) + 1);
    }
    for (const [target, count] of seen) {
      // Two steps may share a target on purpose (Team Structure explains how to
      // read the chart, then how to move around it). More than two is a mistake.
      expect(count, `target "${target}" used ${count} times`).toBeLessThanOrEqual(2);
    }
  });
});
