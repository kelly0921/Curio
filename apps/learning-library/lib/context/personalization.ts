import {
  learningItemSchema,
  learningPersonalizationSchema,
  type ContextDomain,
  type ContextRecord,
  type ContextSnapshot,
  type LearningItem,
  type LearningPersonalization,
} from "../domain";

export const PERSONALIZATION_ENGINE_VERSION = "context-router-v2" as const;

const DOMAIN_PATTERNS: Record<Exclude<ContextDomain, "general">, RegExp> = {
  finance: /\b(finance|financial|money|wealth|invest|investment|stock|fund|tax|hsa|retirement|ira|saving|budget|credit|debt)\b/iu,
  travel: /\b(travel|trip|flight|hotel|destination|itinerary|vacation|tourism|packing)\b/iu,
  food: /\b(food|recipe|restaurant|meal|cook|cooking|ingredient|cuisine|bake|dinner|lunch)\b/iu,
  ai_work: /\b(ai|artificial intelligence|automation|agent|claude|openai|chatgpt|prompt|workflow|notion|content system)\b/iu,
  career: /\b(career|job|work|promotion|leadership|mentor|mentoring|communication|interview|performance review)\b/iu,
  health: /\b(health|medical|fitness|exercise|sleep|nutrition|wellness|therapy)\b/iu,
  home: /\b(home|house|apartment|decor|furniture|cleaning|garden|renovation)\b/iu,
  relationships: /\b(relationship|friend|family|dating|partner|parenting|community)\b/iu,
};

const KIND_WEIGHT: Record<ContextRecord["kind"], number> = {
  goal: 24,
  plan: 22,
  constraint: 18,
  fact: 14,
  preference: 12,
  habit: 10,
  resource: 8,
};

const TIER_WEIGHT: Record<LearningPersonalization["recommendationTier"], number> = {
  do_now: 3,
  useful_for_goals: 2,
  worth_remembering: 1,
};

function cardText(item: LearningItem): string {
  if (!item.card) return "";
  return [
    item.card.title,
    item.card.primaryTopic,
    ...item.card.secondaryTopics,
    item.card.summary,
    ...item.card.keyTakeaways,
    ...item.card.notes.flatMap((note) => [note.title, note.detail]),
    item.card.researchBrief?.overview ?? "",
  ].join(" ").toLocaleLowerCase();
}

export function detectContextDomain(item: LearningItem): ContextDomain {
  const text = cardText(item);
  let best: { domain: ContextDomain; score: number } = { domain: "general", score: 0 };
  for (const [domain, pattern] of Object.entries(DOMAIN_PATTERNS) as [Exclude<ContextDomain, "general">, RegExp][]) {
    const matches = text.match(new RegExp(pattern.source, `${pattern.flags}g`));
    const score = matches?.length ?? 0;
    if (score > best.score) best = { domain, score };
  }
  return best.domain;
}

function keywordOverlap(record: ContextRecord, content: string): number {
  return record.keywords.filter((keyword) => content.includes(keyword.toLocaleLowerCase())).length;
}

function recordScore(record: ContextRecord, overlap: number): number {
  return KIND_WEIGHT[record.kind] + Math.min(overlap, 3) * 10;
}

function priorityFor(score: number): LearningPersonalization["priority"] {
  if (score >= 76) return "high";
  if (score >= 52) return "medium";
  return "low";
}

function sentence(value: string): string {
  return value.replace(/[.!?]+$/u, "");
}

function compact(value: string, max = 170): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 1).trimEnd()}…`;
}

function evidenceFor(item: LearningItem): {
  status: LearningPersonalization["evidenceStatus"];
  requiresReview: boolean;
} {
  const card = item.card;
  if (!card) return { status: "unresearched", requiresReview: true };
  if (card.contentType === "opinion" || card.contentType === "personal_experience") {
    return { status: "opinion", requiresReview: false };
  }

  const findings = card.researchBrief?.findings ?? [];
  const hasUnresolvedFinding = findings.some((finding) => finding.verdict === "corrected" || finding.verdict === "not_verified");
  const hasValidatedFinding = findings.some((finding) => finding.verdict === "confirmed" || finding.verdict === "supported_with_context");
  const hasHighStakesClaim = card.claimsToVerify.some((claim) => claim.category === "high_stakes_factual_claim");
  const hasUnresearchedClaim = !card.researchBrief && card.claimsToVerify.some((claim) => (
    claim.category === "factual_claim" || claim.category === "high_stakes_factual_claim"
  ));
  if (hasUnresolvedFinding || (hasHighStakesClaim && !hasValidatedFinding) || hasUnresearchedClaim) {
    return { status: "mixed", requiresReview: true };
  }
  if (hasValidatedFinding) {
    return { status: "validated", requiresReview: false };
  }
  return { status: "unresearched", requiresReview: false };
}

function recencyScore(createdAt: string, now: string): number {
  const ageMs = Math.max(0, Date.parse(now) - Date.parse(createdAt));
  const ageDays = ageMs / 86_400_000;
  if (ageDays <= 7) return 6;
  if (ageDays <= 30) return 4;
  if (ageDays <= 90) return 2;
  return 0;
}

function matchDescription(record: ContextRecord): string {
  const statement = compact(sentence(record.statement), 150);
  switch (record.kind) {
    case "goal": return `Supports your goal: ${statement}.`;
    case "plan": return `Useful for your current plan: ${statement}.`;
    case "preference": return `Fits a preference you have saved: ${statement}.`;
    case "habit": return `Connects with an existing habit: ${statement}.`;
    case "constraint": return `Relevant to a decision rule you follow: ${statement}.`;
    case "resource": return `Adds to a resource you already use: ${statement}.`;
    default: return `Builds on what you are learning: ${statement}.`;
  }
}

function isSuppressed(item: LearningItem, now: string): boolean {
  const feedback = item.recommendationFeedback;
  if (!feedback) return false;
  if (feedback.state === "done" || feedback.state === "not_relevant") return true;
  return feedback.state === "later" && Boolean(feedback.revisitAt && feedback.revisitAt > now);
}

function withoutPersonalization(item: LearningItem): LearningItem {
  if (!item.card) return learningItemSchema.parse(item);
  return learningItemSchema.parse({ ...item, card: { ...item.card, personalization: null } });
}

export function personalizeLearningItem(
  item: LearningItem,
  snapshot: ContextSnapshot,
  now = new Date().toISOString(),
): LearningItem {
  if (!item.card || isSuppressed(item, now)) return withoutPersonalization(item);

  const domain = detectContextDomain(item);
  const content = cardText(item);
  const relevant = snapshot.records
    .filter((record) => record.domain === domain || record.domain === "general")
    .map((record) => {
      const overlap = keywordOverlap(record, content);
      return { record, overlap, score: recordScore(record, overlap) };
    })
    .filter(({ overlap }) => overlap > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 3);

  if (!relevant.length) return withoutPersonalization(item);

  const evidence = evidenceFor(item);
  const hasActiveGoal = relevant.some(({ record }) => record.kind === "goal" || record.kind === "plan");
  const intentBoost = item.intent === "try" ? 12 : item.intent === "verify" ? 8 : 0;
  const evidenceAdjustment = evidence.status === "validated" ? 8 : evidence.requiresReview ? -12 : evidence.status === "unresearched" ? -4 : 0;
  const priorityScore = Math.max(20, Math.min(94,
    20
    + Math.min(relevant[0]?.score ?? 0, 30)
    + Math.min(relevant.length * 4, 12)
    + (hasActiveGoal ? 10 : 0)
    + intentBoost
    + recencyScore(item.createdAt, now)
    + evidenceAdjustment,
  ));
  const recommendationTier: LearningPersonalization["recommendationTier"] = evidence.requiresReview
    ? "worth_remembering"
    : priorityScore >= 76
      ? "do_now"
      : priorityScore >= 52
        ? "useful_for_goals"
        : "worth_remembering";
  const primary = relevant[0].record;

  const personalization = learningPersonalizationSchema.parse({
    domain,
    priority: priorityFor(priorityScore),
    priorityScore,
    recommendationTier,
    evidenceStatus: evidence.status,
    whyNow: matchDescription(primary),
    personalizedUse: evidence.status === "validated"
      ? `Use the researched notes as practical background for this ${domain.replace("_", " ")} priority.`
      : `Use this as background for your ${domain.replace("_", " ")} goals, and keep the source context in view.`,
    nextStep: evidence.requiresReview
      ? "Review Curio’s evidence and corrections before acting on this."
      : compact(item.card.suggestedAction, 260),
    contextUsed: relevant.map(({ record }) => ({
      recordId: record.id,
      domain: record.domain,
      kind: record.kind,
      statement: record.statement,
      sourceLabel: record.sourceLabel,
      isDemo: snapshot.connections.some((connection) => connection.id === record.connectionId && connection.isDemo),
    })),
    generatedAt: now,
    engineVersion: PERSONALIZATION_ENGINE_VERSION,
  });

  return learningItemSchema.parse({
    ...item,
    card: { ...item.card, personalization },
  });
}

export function personalizeLearningItems(
  items: LearningItem[],
  snapshot: ContextSnapshot,
  now = new Date().toISOString(),
): LearningItem[] {
  return items
    .map((item) => personalizeLearningItem(item, snapshot, now))
    .sort((left, right) => {
      const leftPersonalization = left.card?.personalization;
      const rightPersonalization = right.card?.personalization;
      const tierDifference = (rightPersonalization ? TIER_WEIGHT[rightPersonalization.recommendationTier] : 0)
        - (leftPersonalization ? TIER_WEIGHT[leftPersonalization.recommendationTier] : 0);
      if (tierDifference) return tierDifference;
      const scoreDifference = (rightPersonalization?.priorityScore ?? 0) - (leftPersonalization?.priorityScore ?? 0);
      return scoreDifference || right.createdAt.localeCompare(left.createdAt);
    });
}
