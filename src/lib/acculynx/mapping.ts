// src/lib/acculynx/mapping.ts
// Pure mapping logic. Kept free of runtime imports so it is trivially testable
// with `node --test`. Config VALUES are injected by the caller (sync.ts); only
// the Metric TYPE is imported (type-only imports are erased at runtime).
import type { Metric } from "./config";

export interface MappingConfig {
  repTypes: string[]; // ordered preference; first matching rep type wins
  stageToMetric: Record<string, Exclude<Metric, "revenue">>;
  revenueStage: string;
}

export interface FactDraft {
  factKey: string;
  jobId: string;
  metric: Metric;
  repExternalId: string | null;
  value: number;
  occurredAt: Date;
  location: string;
}

export function buildFactKey(jobId: string, metric: string): string {
  return `${jobId}:${metric}`;
}

// Returns the user id of the first representative whose type matches, trying
// repTypes in order (e.g. SalesOwner first, then CompanyRepresentative).
export function pickRepUserId(representatives: any, repTypes: string[]): string | null {
  const items = representatives?.items ?? [];
  for (const t of repTypes) {
    const match = items.find((r: any) => r?.type === t);
    if (match?.user?.id) return match.user.id;
  }
  return null;
}

function milestoneDate(history: any, name: string): Date | null {
  const items = history?.items ?? [];
  const m = items.find((i: any) => i?.name === name);
  return m?.date ? new Date(m.date) : null;
}

function extractCity(job: any): string {
  return job?.locationAddress?.city || "Unknown";
}

export function mapJobToFacts(
  input: { job: any; milestoneHistory: any; financials: any; representatives: any },
  cfg: MappingConfig
): FactDraft[] {
  const { job, milestoneHistory, financials, representatives } = input;
  const jobId = job.id;
  const repExternalId = pickRepUserId(representatives, cfg.repTypes);
  const location = extractCity(job);
  const facts: FactDraft[] = [];

  // filed (Prospect) + won (Approved)
  for (const [stage, metric] of Object.entries(cfg.stageToMetric)) {
    const d = milestoneDate(milestoneHistory, stage);
    if (d) facts.push({ factKey: buildFactKey(jobId, metric), jobId, metric, repExternalId, value: 1, occurredAt: d, location });
  }

  // revenue (approvedJobValue @ Approved date; fallback to job.milestoneDate)
  const value = Number(financials?.approvedJobValue ?? 0);
  if (value > 0) {
    const occurredAt = milestoneDate(milestoneHistory, cfg.revenueStage) ?? (job.milestoneDate ? new Date(job.milestoneDate) : null);
    if (occurredAt) facts.push({ factKey: buildFactKey(jobId, "revenue"), jobId, metric: "revenue", repExternalId, value, occurredAt, location });
  }

  return facts;
}
