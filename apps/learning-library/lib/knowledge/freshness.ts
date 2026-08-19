import type { KnowledgeResource } from "../domain";

export const RESOURCE_RESEARCH_POLICY_VERSION = "resource-research-freshness-v1" as const;

export type ResourceFreshnessStatus = "current" | "due" | "unresearched" | "not_required";

export interface ResourceFreshness {
  status: ResourceFreshnessStatus;
  checkedAt: string | null;
  nextCheckAt: string | null;
  intervalDays: number | null;
  refreshRecommended: boolean;
  reason: string;
  policyVersion: typeof RESOURCE_RESEARCH_POLICY_VERSION;
}

function latestResearchDate(resource: KnowledgeResource): string | null {
  return [resource.lastResearchedAt, ...resource.entries.map((entry) => entry.researchedAt)]
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? null;
}

function requiredIntervalDays(resource: KnowledgeResource): number | null {
  if (resource.resourceType === "watchlist" || resource.intent === "track") return 14;
  if (resource.domain === "finance" || resource.domain === "health") return 30;
  if (resource.intent === "buy" || resource.intent === "visit" || resource.intent === "compare") return 60;
  if (resource.domain === "travel" || resource.domain === "food" || resource.domain === "ai_work") return 90;
  if (resource.entries.some((entry) => entry.research !== null)) return 180;
  return null;
}

function reasonFor(resource: KnowledgeResource, intervalDays: number | null): string {
  if (intervalDays === null) return "This resource is primarily evergreen or subjective, so routine research is hidden.";
  if (resource.resourceType === "watchlist" || resource.intent === "track") return "Tracked opportunities and watchlists can change quickly.";
  if (resource.domain === "finance" || resource.domain === "health") return `Material ${resource.domain} guidance is checked more often.`;
  if (resource.intent === "buy" || resource.intent === "visit" || resource.intent === "compare") return "Availability, logistics, and recommendations can change over time.";
  return "This resource contains researched details that can change over time.";
}

export function assessKnowledgeResourceFreshness(
  resource: KnowledgeResource,
  now: Date = new Date(),
): ResourceFreshness {
  const intervalDays = requiredIntervalDays(resource);
  const checkedAt = latestResearchDate(resource);
  const reason = reasonFor(resource, intervalDays);
  if (intervalDays === null) {
    return {
      status: "not_required",
      checkedAt,
      nextCheckAt: null,
      intervalDays: null,
      refreshRecommended: false,
      reason,
      policyVersion: RESOURCE_RESEARCH_POLICY_VERSION,
    };
  }
  if (!checkedAt) {
    return {
      status: "unresearched",
      checkedAt: null,
      nextCheckAt: null,
      intervalDays,
      refreshRecommended: true,
      reason,
      policyVersion: RESOURCE_RESEARCH_POLICY_VERSION,
    };
  }
  const nextCheck = new Date(checkedAt);
  nextCheck.setUTCDate(nextCheck.getUTCDate() + intervalDays);
  const due = nextCheck.getTime() <= now.getTime();
  return {
    status: due ? "due" : "current",
    checkedAt,
    nextCheckAt: nextCheck.toISOString(),
    intervalDays,
    refreshRecommended: due,
    reason,
    policyVersion: RESOURCE_RESEARCH_POLICY_VERSION,
  };
}
