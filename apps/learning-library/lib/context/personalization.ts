import {
  learningItemSchema,
  learningPersonalizationSchema,
  type ContextDomain,
  type ContextRecord,
  type ContextSnapshot,
  type LearningItem,
  type LearningPersonalization,
} from "../domain";

export const PERSONALIZATION_ENGINE_VERSION = "context-router-v1" as const;

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
  goal: 30,
  plan: 28,
  constraint: 26,
  fact: 20,
  preference: 18,
  habit: 15,
  resource: 10,
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

function recordScore(record: ContextRecord, content: string): number {
  const overlap = record.keywords.filter((keyword) => content.includes(keyword.toLocaleLowerCase())).length;
  return KIND_WEIGHT[record.kind] + Math.min(overlap, 3) * 8;
}

function priorityFor(score: number): LearningPersonalization["priority"] {
  if (score >= 75) return "high";
  if (score >= 48) return "medium";
  return "low";
}

function sentence(value: string): string {
  return value.replace(/[.!?]+$/u, "");
}

export function personalizeLearningItem(item: LearningItem, snapshot: ContextSnapshot): LearningItem {
  if (!item.card) return learningItemSchema.parse(item);

  const domain = detectContextDomain(item);
  const content = cardText(item);
  const relevant = snapshot.records
    .filter((record) => record.domain === domain || record.domain === "general")
    .map((record) => ({ record, score: recordScore(record, content) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, 4);

  const hasActiveGoal = relevant.some(({ record }) => record.kind === "goal" || record.kind === "plan");
  const priorityScore = relevant.length
    ? Math.min(95, 34 + relevant.length * 9 + (hasActiveGoal ? 18 : 0) + Math.min(relevant[0]?.score ?? 0, 16))
    : 24;
  const primary = relevant[0]?.record;
  const secondary = relevant[1]?.record;
  const constraint = relevant.find(({ record }) => record.kind === "constraint")?.record;

  const personalization = learningPersonalizationSchema.parse({
    domain,
    priority: priorityFor(priorityScore),
    priorityScore,
    whyNow: primary
      ? `This connects to a current ${primary.kind}: ${sentence(primary.statement)}.${secondary ? ` It also relates to: ${sentence(secondary.statement)}.` : ""}`
      : `Curio identified this as ${domain.replace("_", " ")} knowledge, but no matching connected context is available yet.`,
    personalizedUse: primary
      ? `Use the validated notes as practical background for this connected priority: ${primary.statement}`
      : item.card.relevanceReason,
    nextStep: constraint
      ? `${sentence(item.card.suggestedAction)}. Keep this decision rule in view: ${constraint.statement}`
      : item.card.suggestedAction,
    contextUsed: relevant.map(({ record }) => ({
      recordId: record.id,
      domain: record.domain,
      kind: record.kind,
      statement: record.statement,
      sourceLabel: record.sourceLabel,
      isDemo: snapshot.connections.some((connection) => connection.id === record.connectionId && connection.isDemo),
    })),
    generatedAt: snapshot.syncedAt,
    engineVersion: PERSONALIZATION_ENGINE_VERSION,
  });

  return learningItemSchema.parse({
    ...item,
    card: { ...item.card, personalization },
  });
}

export function personalizeLearningItems(items: LearningItem[], snapshot: ContextSnapshot): LearningItem[] {
  return items
    .map((item) => personalizeLearningItem(item, snapshot))
    .sort((left, right) => (right.card?.personalization?.priorityScore ?? 0) - (left.card?.personalization?.priorityScore ?? 0));
}
