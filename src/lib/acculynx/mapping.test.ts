// src/lib/acculynx/mapping.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapJobToFacts, buildFactKey, pickRepUserId } from "./mapping.ts";
import { STAGE_TO_METRIC, REVENUE_STAGE, REP_TYPES } from "./config.ts";

const cfg = { repTypes: REP_TYPES, stageToMetric: STAGE_TO_METRIC, revenueStage: REVENUE_STAGE };

const job = {
  id: "JOB1",
  currentMilestone: "Invoiced",
  milestoneDate: "2026-05-04T05:00:00Z",
  locationAddress: { city: "Lubbock" },
};
const milestoneHistory = { items: [
  { name: "Lead", date: "2025-07-29T05:00:00Z" },
  { name: "Prospect", date: "2025-07-29T05:00:00Z" },
  { name: "Approved", date: "2025-07-30T05:00:00Z" },
  { name: "Completed", date: "2025-10-30T05:00:00Z" },
] };
const representatives = { items: [
  { type: "Additional", user: { id: "U-EXTRA" } },
  { type: "SalesOwner", user: { id: "U-SALES" } },
  { type: "CompanyRepresentative", user: { id: "U-COMPANY" } },
] };
const financials = { approvedJobValue: 90522.11 };

test("pickRepUserId prefers CompanyRepresentative (AccuLynx 'Primary Salesperson') over SalesOwner", () => {
  assert.equal(pickRepUserId(representatives, REP_TYPES), "U-COMPANY");
});

test("pickRepUserId falls back to SalesOwner when no CompanyRepresentative", () => {
  const reps = { items: [
    { type: "Additional", user: { id: "U-EXTRA" } },
    { type: "SalesOwner", user: { id: "U-SALES" } },
  ] };
  assert.equal(pickRepUserId(reps, REP_TYPES), "U-SALES");
});

test("maps a job to filed/won/revenue facts with correct dates", () => {
  const facts = mapJobToFacts({ job, milestoneHistory, financials, representatives }, cfg, "West Texas");
  const byMetric = Object.fromEntries(facts.map((f) => [f.metric, f]));

  assert.equal(byMetric.filed.factKey, buildFactKey("JOB1", "filed"));
  assert.equal(byMetric.filed.occurredAt.toISOString(), "2025-07-29T05:00:00.000Z");
  assert.equal(byMetric.filed.value, 1);
  assert.equal(byMetric.filed.repExternalId, "U-COMPANY");
  assert.equal(byMetric.filed.location, "West Texas"); // branch label (injected), not the city
  assert.equal(byMetric.filed.city, "Lubbock");        // customer city (from the job), kept separately

  assert.equal(byMetric.won.occurredAt.toISOString(), "2025-07-30T05:00:00.000Z");

  assert.equal(byMetric.revenue.value, 90522.11);
  assert.equal(byMetric.revenue.occurredAt.toISOString(), "2025-07-30T05:00:00.000Z"); // Approved date
});

test("no Prospect milestone => no filed fact", () => {
  const facts = mapJobToFacts({
    job, representatives, financials,
    milestoneHistory: { items: [{ name: "Lead", date: "2025-07-29T05:00:00Z" }] },
  }, cfg, "West Texas");
  assert.equal(facts.find((f) => f.metric === "filed"), undefined);
});
