// src/lib/acculynx/mapping.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { mapJobToFacts, buildFactKey, pickRepUserId, isJobDead, isJobCounted, metricsToClear } from "./mapping.ts";
import { STAGE_TO_METRIC, REVENUE_STAGE, REP_TYPES, COUNTED_STAGES } from "./config.ts";

const cfg = { repTypes: REP_TYPES, stageToMetric: STAGE_TO_METRIC, revenueStage: REVENUE_STAGE, countedStages: COUNTED_STAGES };

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

test("isJobDead is true only for the Cancelled milestone", () => {
  assert.equal(isJobDead({ currentMilestone: "Cancelled" }), true);
  assert.equal(isJobDead({ currentMilestone: "Approved" }), false);
  assert.equal(isJobDead({ currentMilestone: "Closed" }), false); // Closed = good terminal state
  assert.equal(isJobDead({}), false);
});

test("a Cancelled (dead) deal keeps filed but earns no won/revenue, even if it once hit Approved", () => {
  const deadJob = { ...job, currentMilestone: "Cancelled" }; // history below still shows Approved
  const facts = mapJobToFacts({ job: deadJob, milestoneHistory, financials, representatives }, cfg, "West Texas");
  const byMetric = Object.fromEntries(facts.map((f) => [f.metric, f]));

  assert.ok(byMetric.filed, "filed credit is intentionally preserved for a dead deal");
  assert.equal(byMetric.filed.occurredAt.toISOString(), "2025-07-29T05:00:00.000Z");
  assert.equal(byMetric.won, undefined, "a cancelled deal must not count as a Contract");
  assert.equal(byMetric.revenue, undefined, "a cancelled deal must not count Contract Amount");
});

const metricsOf = (facts: { metric: string }[]) => facts.map((f) => f.metric).sort();

test("isJobCounted matches AccuLynx's Sales Report stages exactly", () => {
  for (const s of ["Approved", "Completed", "Invoiced", "Closed"]) assert.equal(isJobCounted({ currentMilestone: s }, COUNTED_STAGES), true, s);
  for (const s of ["Lead", "Prospect", "Cancelled", undefined]) assert.equal(isJobCounted({ currentMilestone: s }, COUNTED_STAGES), false, String(s));
});

test("a job still at Prospect earns no money even with a job value (the $22,500 case)", () => {
  const prospect = { ...job, currentMilestone: "Prospect", milestoneDate: "2026-05-28T05:00:00Z" };
  const history = { items: [{ name: "Lead", date: "2026-05-20T05:00:00Z" }, { name: "Prospect", date: "2026-05-28T05:00:00Z" }] };
  const facts = mapJobToFacts({ job: prospect, milestoneHistory: history, financials: { approvedJobValue: 22500 }, representatives }, cfg, "DFW");
  assert.deepEqual(metricsOf(facts), ["filed", "lead"]);
  assert.deepEqual(metricsToClear(facts), ["won", "revenue"]);
});

test("a job sent back to Prospect after Approved loses its contract and money, keeps its claim", () => {
  const backToProspect = { ...job, currentMilestone: "Prospect" }; // history still shows Approved
  const facts = mapJobToFacts({ job: backToProspect, milestoneHistory, financials, representatives }, cfg, "DFW");
  assert.deepEqual(metricsOf(facts), ["filed", "lead"]);
  assert.deepEqual(metricsToClear(facts), ["won", "revenue"]);
});

test("an Approved job whose value is now $0 keeps its contract but clears its old money", () => {
  const facts = mapJobToFacts({ job: { ...job, currentMilestone: "Approved" }, milestoneHistory, financials: { approvedJobValue: 0 }, representatives }, cfg, "DFW");
  assert.deepEqual(metricsOf(facts), ["filed", "lead", "won"]);
  assert.deepEqual(metricsToClear(facts), ["revenue"]);
});

test("a counted job at a later stage keeps contract and money, nothing to clear", () => {
  for (const stage of ["Completed", "Invoiced", "Closed"]) {
    const facts = mapJobToFacts({ job: { ...job, currentMilestone: stage }, milestoneHistory, financials, representatives }, cfg, "DFW");
    assert.deepEqual(metricsOf(facts), ["filed", "lead", "revenue", "won"], stage);
    assert.deepEqual(metricsToClear(facts), [], stage);
  }
});

test("a Cancelled deal clears both contract and money", () => {
  const facts = mapJobToFacts({ job: { ...job, currentMilestone: "Cancelled" }, milestoneHistory, financials, representatives }, cfg, "DFW");
  assert.deepEqual(metricsToClear(facts), ["won", "revenue"]);
});
