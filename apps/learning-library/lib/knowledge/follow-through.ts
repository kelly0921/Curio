import {
  type ContextSnapshot,
  resourceEngagementSchema,
  type FollowThroughKind,
  type KnowledgeResource,
  type ResourceEngagement,
} from "../domain";
import type { CurioRepository } from "../data/repository";
import { emptyResourceEngagement } from "./engagement";
import { assessKnowledgeResourceFreshness } from "./freshness";

const DAY_IN_MS = 24 * 60 * 60 * 1_000;
const SOON_WINDOW_IN_MS = 2 * DAY_IN_MS;

export type ActionableFollowThroughKind = Exclude<FollowThroughKind, "review">;

type StoredFollowThrough = NonNullable<ResourceEngagement["followThrough"]>;
type ActionableStoredFollowThrough = Omit<StoredFollowThrough, "kind"> & { kind: ActionableFollowThroughKind };

const REVIEW_CADENCE_DAYS: Record<ActionableFollowThroughKind, number> = {
  watchlist: 7,
  checklist: 7,
  trip_plan: 14,
  shortlist: 14,
};

const ACTIONABLE_CONTEXT_KINDS = new Set(["goal", "preference", "constraint", "plan", "habit"]);

export interface FollowThroughPlanEntry {
  id: string;
  title: string;
  detail: string;
  completed: boolean;
}

export type FollowThroughAttention = "now" | "soon" | "on_track";

export interface FollowThroughPlan {
  resourceId: string;
  resourceTitle: string;
  domain: KnowledgeResource["domain"];
  kind: ActionableFollowThroughKind;
  state: "active" | "completed";
  entries: FollowThroughPlanEntry[];
  completedCount: number;
  totalCount: number;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
  attention: FollowThroughAttention;
  whyNow: string;
  nextReviewAt: string | null;
}

export type FollowThroughUpdate =
  | { action: "start" }
  | { action: "toggle_entry"; entryId: string; completed: boolean }
  | { action: "complete" };

function usableEntries(resource: KnowledgeResource) {
  return resource.entries.filter((entry) => entry.status !== "superseded");
}

function isActionableStoredFollowThrough(
  followThrough: StoredFollowThrough | null | undefined,
): followThrough is ActionableStoredFollowThrough {
  return Boolean(followThrough && followThrough.kind !== "review");
}

function reviewDate(updatedAt: string, kind: ActionableFollowThroughKind): Date {
  return new Date(Date.parse(updatedAt) + REVIEW_CADENCE_DAYS[kind] * DAY_IN_MS);
}

function resourceContextText(resource: KnowledgeResource): string {
  return [
    resource.title,
    resource.canonicalTopic,
    ...resource.entities,
    ...usableEntries(resource).flatMap((entry) => [entry.heading ?? "", entry.detail]),
  ].join(" ").toLocaleLowerCase();
}

function matchesCurrentContext(
  resource: KnowledgeResource,
  context: ContextSnapshot | null | undefined,
  lastPlanUpdate: string,
  now: Date,
): boolean {
  if (!context) return false;
  const connectedIds = new Set(context.connections
    .filter((connection) => !connection.isDemo && connection.status === "connected")
    .map((connection) => connection.id));
  if (!connectedIds.size) return false;
  const text = resourceContextText(resource);
  return context.records.some((record) => connectedIds.has(record.connectionId)
    && ACTIONABLE_CONTEXT_KINDS.has(record.kind)
    && (record.domain === resource.domain || record.domain === "general")
    && record.observedAt.localeCompare(lastPlanUpdate) > 0
    && (!record.expiresAt || Date.parse(record.expiresAt) > now.getTime())
    && record.keywords.some((keyword) => {
      const normalized = keyword.trim().toLocaleLowerCase();
      return normalized.length >= 3 && text.includes(normalized);
    }));
}

function dueReason(kind: ActionableFollowThroughKind): string {
  if (kind === "watchlist") return "Time to recheck the evidence behind this watchlist.";
  if (kind === "trip_plan") return "Your trip prep is due for a quick review.";
  if (kind === "shortlist") return "Revisit this shortlist before the options go stale.";
  if (kind === "checklist") return "This checklist is ready for its next step.";
  return "This plan is ready for its next step.";
}

function soonReason(kind: ActionableFollowThroughKind): string {
  if (kind === "watchlist") return "This watchlist is due for an evidence check soon.";
  if (kind === "trip_plan") return "Your trip prep is coming up for review.";
  if (kind === "shortlist") return "This shortlist is coming up for review.";
  if (kind === "checklist") return "This checklist is coming back soon.";
  return "This plan is coming up soon.";
}

function followThroughTiming(
  resource: KnowledgeResource,
  followThrough: ActionableStoredFollowThrough,
  completedCount: number,
  totalCount: number,
  context: ContextSnapshot | null | undefined,
  now: Date,
): Pick<FollowThroughPlan, "attention" | "whyNow" | "nextReviewAt"> {
  if (followThrough.state === "completed") {
    return { attention: "on_track", whyNow: "This plan is complete.", nextReviewAt: null };
  }
  const nextReview = reviewDate(followThrough.updatedAt, followThrough.kind);
  const nextReviewAt = nextReview.toISOString();
  if (totalCount > 0 && completedCount === totalCount) {
    return {
      attention: "now",
      whyNow: "Everything is checked off. Mark this plan done when you are finished.",
      nextReviewAt,
    };
  }
  if (resource.updatedAt.localeCompare(followThrough.updatedAt) > 0) {
    return {
      attention: "now",
      whyNow: "This resource gained new information since you last checked it.",
      nextReviewAt,
    };
  }
  const freshness = assessKnowledgeResourceFreshness(resource, now);
  if (freshness.status === "due" || freshness.status === "unresearched") {
    return {
      attention: "now",
      whyNow: freshness.status === "unresearched"
        ? "The source is saved, but its important claims still need an evidence check."
        : freshness.reason,
      nextReviewAt,
    };
  }
  if (matchesCurrentContext(resource, context, followThrough.updatedAt, now)) {
    return {
      attention: "now",
      whyNow: "This matches a current priority from your connected context.",
      nextReviewAt,
    };
  }
  const timeUntilReview = nextReview.getTime() - now.getTime();
  if (timeUntilReview <= 0) {
    return { attention: "now", whyNow: dueReason(followThrough.kind), nextReviewAt };
  }
  if (timeUntilReview <= SOON_WINDOW_IN_MS) {
    return { attention: "soon", whyNow: soonReason(followThrough.kind), nextReviewAt };
  }
  return {
    attention: "on_track",
    whyNow: "Nothing needs attention yet. Curio will bring this plan back when it does.",
    nextReviewAt,
  };
}

export function followThroughKindFor(resource: KnowledgeResource): ActionableFollowThroughKind | null {
  if (resource.intent === "track" || resource.resourceType === "watchlist") return "watchlist";
  if (resource.intent === "visit") return "trip_plan";
  if (resource.intent === "buy" || resource.intent === "compare") return "shortlist";
  if (resource.intent === "try" || resource.resourceType === "playbook") return "checklist";
  return null;
}

export function buildFollowThroughPlan(
  resource: KnowledgeResource,
  engagement: ResourceEngagement | null | undefined,
  context?: ContextSnapshot | null,
  now = new Date(),
): FollowThroughPlan | null {
  const followThrough = engagement?.followThrough;
  if (!isActionableStoredFollowThrough(followThrough)) return null;
  const completedIds = new Set(followThrough.completedEntryIds);
  const entries = usableEntries(resource).map((entry) => ({
    id: entry.id,
    title: entry.heading ?? entry.detail,
    detail: entry.research?.verdict === "corrected" && entry.research.correction
      ? entry.research.correction
      : entry.detail,
    completed: completedIds.has(entry.id),
  }));
  const completedCount = entries.filter((entry) => entry.completed).length;
  return {
    resourceId: resource.id,
    resourceTitle: resource.title,
    domain: resource.domain,
    kind: followThrough.kind,
    state: followThrough.state,
    entries,
    completedCount,
    totalCount: entries.length,
    startedAt: followThrough.startedAt,
    completedAt: followThrough.completedAt,
    updatedAt: followThrough.updatedAt,
    ...followThroughTiming(resource, followThrough, completedCount, entries.length, context, now),
  };
}

export function buildActiveFollowThroughPlans(
  resources: KnowledgeResource[],
  engagement: ResourceEngagement[],
  context?: ContextSnapshot | null,
  now = new Date(),
): FollowThroughPlan[] {
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  return engagement.flatMap((record): FollowThroughPlan[] => {
    const resource = resourcesById.get(record.resourceId);
    const plan = resource ? buildFollowThroughPlan(resource, record, context, now) : null;
    return plan?.state === "active" ? [plan] : [];
  }).sort((left, right) => {
    const rank: Record<FollowThroughAttention, number> = { now: 0, soon: 1, on_track: 2 };
    return rank[left.attention] - rank[right.attention]
      || (left.nextReviewAt ?? "9999").localeCompare(right.nextReviewAt ?? "9999")
      || right.updatedAt.localeCompare(left.updatedAt);
  });
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
  const existingActive = existing.followThrough?.state === "active" ? existing.followThrough : null;
  const current = isActionableStoredFollowThrough(existingActive) ? existingActive : null;
  const kind = current?.kind ?? followThroughKindFor(resource);
  if (!kind) throw new Error("FOLLOW_THROUGH_NOT_ACTIONABLE");
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
      kind,
      state: update.action === "complete" ? "completed" : "active",
      completedEntryIds: [...completedEntryIds],
      startedAt,
      completedAt: update.action === "complete" ? timestamp : null,
      updatedAt: timestamp,
    },
    updatedAt: timestamp,
  });
  const saved = await repository.saveResourceEngagement(engagement);
  const plan = buildFollowThroughPlan(resource, saved, null, now);
  if (!plan) throw new Error("FOLLOW_THROUGH_NOT_SAVED");
  return { engagement: saved, plan };
}
