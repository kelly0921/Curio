import {
  forYouFeedbackSchema,
  resourceEngagementSchema,
  type ForYouFeedback,
  type ForYouLane,
  type ResourceEngagement,
  type ResourceEngagementSignal,
} from "../domain";
import type { CurioRepository } from "../data/repository";

const REMIND_LATER_MS = 7 * 24 * 60 * 60 * 1_000;

export function emptyResourceEngagement(
  profileId: string,
  resourceId: string,
  now = new Date(),
): ResourceEngagement {
  return resourceEngagementSchema.parse({
    profileId,
    resourceId,
    openCount: 0,
    expandedCount: 0,
    sourceOpenCount: 0,
    deepDiveCount: 0,
    lastOpenedAt: null,
    lastExpandedAt: null,
    lastSourceOpenedAt: null,
    lastDeepDiveAt: null,
    followThrough: null,
    updatedAt: now.toISOString(),
  });
}

export async function recordResourceEngagement(
  profileId: string,
  resourceId: string,
  signal: ResourceEngagementSignal,
  repository: CurioRepository,
  now = new Date(),
): Promise<ResourceEngagement> {
  const timestamp = now.toISOString();
  const existing = await repository.findResourceEngagement(profileId, resourceId);
  const base = existing ?? emptyResourceEngagement(profileId, resourceId, now);
  const next = resourceEngagementSchema.parse({
    ...base,
    openCount: base.openCount + (signal === "opened" ? 1 : 0),
    expandedCount: base.expandedCount + (signal === "expanded" ? 1 : 0),
    sourceOpenCount: base.sourceOpenCount + (signal === "source_opened" ? 1 : 0),
    deepDiveCount: base.deepDiveCount + (signal === "deep_dive" ? 1 : 0),
    lastOpenedAt: signal === "opened" ? timestamp : base.lastOpenedAt,
    lastExpandedAt: signal === "expanded" ? timestamp : base.lastExpandedAt,
    lastSourceOpenedAt: signal === "source_opened" ? timestamp : base.lastSourceOpenedAt,
    lastDeepDiveAt: signal === "deep_dive" ? timestamp : base.lastDeepDiveAt,
    updatedAt: timestamp,
  });
  return repository.saveResourceEngagement(next);
}

export async function saveForYouRecommendationFeedback(
  input: {
    profileId: string;
    recommendationId: string;
    resourceId: string;
    lane: ForYouLane;
    action: ForYouFeedback["state"];
  },
  repository: CurioRepository,
  now = new Date(),
): Promise<ForYouFeedback> {
  const feedback = forYouFeedbackSchema.parse({
    profileId: input.profileId,
    recommendationId: input.recommendationId,
    resourceId: input.resourceId,
    lane: input.lane,
    state: input.action,
    updatedAt: now.toISOString(),
    revisitAt: input.action === "later"
      ? new Date(now.getTime() + REMIND_LATER_MS).toISOString()
      : null,
  });
  return repository.saveForYouFeedback(feedback);
}
