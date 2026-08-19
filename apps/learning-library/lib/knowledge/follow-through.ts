import {
  resourceEngagementSchema,
  type FollowThroughKind,
  type KnowledgeResource,
  type ResourceEngagement,
} from "../domain";
import type { CurioRepository } from "../data/repository";
import { emptyResourceEngagement } from "./engagement";

export interface FollowThroughPlanEntry {
  id: string;
  title: string;
  detail: string;
  completed: boolean;
}

export interface FollowThroughPlan {
  resourceId: string;
  resourceTitle: string;
  domain: KnowledgeResource["domain"];
  kind: FollowThroughKind;
  state: "active" | "completed";
  entries: FollowThroughPlanEntry[];
  completedCount: number;
  totalCount: number;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export type FollowThroughUpdate =
  | { action: "start" }
  | { action: "toggle_entry"; entryId: string; completed: boolean }
  | { action: "complete" };

function usableEntries(resource: KnowledgeResource) {
  return resource.entries.filter((entry) => entry.status !== "superseded");
}

export function followThroughKindFor(resource: KnowledgeResource): FollowThroughKind {
  if (resource.intent === "track" || resource.resourceType === "watchlist") return "watchlist";
  if (resource.intent === "visit") return "trip_plan";
  if (resource.intent === "buy" || resource.intent === "compare") return "shortlist";
  if (resource.intent === "try" || resource.resourceType === "playbook") return "checklist";
  return "review";
}

export function buildFollowThroughPlan(
  resource: KnowledgeResource,
  engagement: ResourceEngagement | null | undefined,
): FollowThroughPlan | null {
  const followThrough = engagement?.followThrough;
  if (!followThrough) return null;
  const completedIds = new Set(followThrough.completedEntryIds);
  const entries = usableEntries(resource).map((entry) => ({
    id: entry.id,
    title: entry.heading ?? entry.detail,
    detail: entry.research?.verdict === "corrected" && entry.research.correction
      ? entry.research.correction
      : entry.detail,
    completed: completedIds.has(entry.id),
  }));
  return {
    resourceId: resource.id,
    resourceTitle: resource.title,
    domain: resource.domain,
    kind: followThrough.kind,
    state: followThrough.state,
    entries,
    completedCount: entries.filter((entry) => entry.completed).length,
    totalCount: entries.length,
    startedAt: followThrough.startedAt,
    completedAt: followThrough.completedAt,
    updatedAt: followThrough.updatedAt,
  };
}

export function buildActiveFollowThroughPlans(
  resources: KnowledgeResource[],
  engagement: ResourceEngagement[],
): FollowThroughPlan[] {
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  return engagement.flatMap((record): FollowThroughPlan[] => {
    const resource = resourcesById.get(record.resourceId);
    const plan = resource ? buildFollowThroughPlan(resource, record) : null;
    return plan?.state === "active" ? [plan] : [];
  }).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function updateResourceFollowThrough(
  profileId: string,
  resource: KnowledgeResource,
  update: FollowThroughUpdate,
  repository: CurioRepository,
  now = new Date(),
): Promise<{ engagement: ResourceEngagement; plan: FollowThroughPlan }> {
  const timestamp = now.toISOString();
  const existing = await repository.findResourceEngagement(profileId, resource.id)
    ?? emptyResourceEngagement(profileId, resource.id, now);
  const entries = usableEntries(resource);
  const validEntryIds = new Set(entries.map((entry) => entry.id));
  const current = existing.followThrough?.state === "active" ? existing.followThrough : null;
  const startedAt = current?.startedAt ?? timestamp;
  const completedEntryIds = new Set(current?.completedEntryIds.filter((id) => validEntryIds.has(id)) ?? []);

  if (update.action === "toggle_entry") {
    if (!validEntryIds.has(update.entryId)) throw new Error("FOLLOW_THROUGH_ENTRY_NOT_FOUND");
    if (update.completed) completedEntryIds.add(update.entryId);
    else completedEntryIds.delete(update.entryId);
  }
  if (update.action === "complete") {
    entries.forEach((entry) => completedEntryIds.add(entry.id));
  }

  const engagement = resourceEngagementSchema.parse({
    ...existing,
    followThrough: {
      kind: current?.kind ?? followThroughKindFor(resource),
      state: update.action === "complete" ? "completed" : "active",
      completedEntryIds: [...completedEntryIds],
      startedAt,
      completedAt: update.action === "complete" ? timestamp : null,
      updatedAt: timestamp,
    },
    updatedAt: timestamp,
  });
  const saved = await repository.saveResourceEngagement(engagement);
  const plan = buildFollowThroughPlan(resource, saved);
  if (!plan) throw new Error("FOLLOW_THROUGH_NOT_SAVED");
  return { engagement: saved, plan };
}
