import {
  knowledgeResourceSchema,
  learningItemSchema,
  type ContextDomain,
  type KnowledgeResource,
  type KnowledgeResourceEntry,
  type KnowledgeResourceType,
  type LearningCard,
  type LearningItem,
  type ResourceContribution,
  type SaveIntent,
} from "../domain";
import type { CurioRepository } from "../data/repository";
import type { KnowledgeResourceMergeResult, KnowledgeResourceMerger } from "../ai/services";

const STOP_WORDS = new Set([
  "a", "about", "and", "around", "basics", "best", "for", "from", "guide", "how", "in", "into",
  "of", "on", "plain", "planning", "preparation", "the", "things", "tips", "to", "travel", "trip", "upgrade", "upgrades", "watch", "what", "why", "with",
]);

function compact(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

function stem(token: string): string {
  if (token === "financial") return "finance";
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function tokens(value: string): Set<string> {
  return new Set(value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/gu, " ")
    .split(/\s+/u)
    .map(stem)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token)));
}

function overlapCoefficient(left: Set<string>, right: Set<string>): number {
  if (!left.size || !right.size) return 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / Math.min(left.size, right.size);
}

function cardSubject(card: LearningCard): string {
  return [card.title, card.primaryTopic, ...card.secondaryTopics, card.summary].join(" ").toLocaleLowerCase();
}

function intentSubject(card: LearningCard): string {
  return [
    cardSubject(card),
    card.suggestedAction,
    ...card.keyTakeaways,
    ...card.notes.flatMap((note) => [note.title, note.detail]),
  ].join(" ").toLocaleLowerCase();
}

export function inferResourceDomain(card: LearningCard): ContextDomain {
  if (card.domain !== "general") return card.domain;
  const subject = cardSubject(card);
  if (/\b(?:hsa|finance|financial|invest|investment|stock|portfolio|banking|tax|liquidity|wealth)\b/u.test(subject)) return "finance";
  if (/\b(?:travel|trip|japan|tokyo|flight|hotel|rail|train|tourist|vacation|airport)\b/u.test(subject)) return "travel";
  if (/\b(?:career|compensation|salary|job|workplace|promotion|interview|resume|mentor|professional)\b/u.test(subject)) return "career";
  if (/\b(?:ai|artificial intelligence|automation|actor|agent|prompt|llm|content audit)\b/u.test(subject)) return "ai_work";
  if (/\b(?:restaurant|recipe|food|dish|ingredient|cooking|cafe)\b/u.test(subject)) return "food";
  if (/\b(?:health|medical|exercise|fitness|nutrition|sleep)\b/u.test(subject)) return "health";
  if (/\b(?:home|house|apartment|decor|cleaning|repair)\b/u.test(subject)) return "home";
  if (/\b(?:relationship|dating|marriage|friendship|family)\b/u.test(subject)) return "relationships";
  return "general";
}

export function inferKnowledgeResourceType(card: LearningCard): KnowledgeResourceType {
  const subject = cardSubject(card);
  const glossarySubject = subject.replace(/\blong[-\s]term\b/gu, "");
  if (/\b(?:term|terms|definition|definitions|glossary|vocabulary|plain english|plain language)\b/u.test(glossarySubject)) return "glossary";
  if (card.presentationType === "how_to" || card.contentType === "tutorial") return "playbook";
  if (
    ["named_list", "ranked_list", "recommendation", "news_update"].includes(card.presentationType)
    && /\b(?:company|companies|stock|stocks|ticker|investment|investments|funding|startup|startups|opportunity|opportunities|beneficiary|beneficiaries|product|products)\b/u.test(subject)
  ) return "watchlist";
  return "guide";
}

export function canonicalResourceTopic(card: LearningCard): string {
  const topic = compact(card.primaryTopic);
  return topic || compact(card.title);
}

function resourceMatchScore(resource: KnowledgeResource, card: LearningCard): number {
  const type = inferKnowledgeResourceType(card);
  const domain = inferResourceDomain(card);
  if (resource.resourceType !== type || resource.domain !== domain) return 0;
  const topicScore = overlapCoefficient(tokens(resource.canonicalTopic), tokens(canonicalResourceTopic(card)));
  const titleScore = overlapCoefficient(tokens(resource.title), tokens(card.title));
  return Math.max(topicScore, titleScore * 0.9);
}

function resourceCandidates(resources: KnowledgeResource[], card: LearningCard): KnowledgeResource[] {
  const type = inferKnowledgeResourceType(card);
  const domain = inferResourceDomain(card);
  return resources
    .filter((resource) => resource.resourceType === type && resource.domain === domain)
    .map((resource) => ({ resource, score: resourceMatchScore(resource, card) }))
    .sort((left, right) => right.score - left.score || right.resource.updatedAt.localeCompare(left.resource.updatedAt))
    .slice(0, 5)
    .map(({ resource }) => resource);
}

export interface SaveIntentInference {
  intent: SaveIntent;
  confidence: number;
  reason: string;
}

export function inferSaveIntentWithConfidence(card: LearningCard): SaveIntentInference {
  const subject = intentSubject(card);
  const coreSubject = cardSubject(card);
  const domain = inferResourceDomain(card);
  const resourceType = inferKnowledgeResourceType(card);
  if (resourceType === "glossary") {
    return { intent: "understand", confidence: 0.99, reason: "The source explains terms or definitions." };
  }
  if (card.presentationType === "comparison") {
    return { intent: "compare", confidence: 0.99, reason: "The source is structured as a comparison." };
  }
  if (/\b(?:versus|vs\.?|pros and cons|side[-\s]by[-\s]side|compare|comparison|which (?:one|option)|differences? between|alternatives? to)\b/u.test(coreSubject)) {
    return { intent: "compare", confidence: 0.9, reason: "The source weighs alternatives or decision points." };
  }
  if (
    card.presentationType === "recommendation"
    && domain !== "finance"
    && /\b(?:product|products|buy|purchase|device|devices|gear|price|priced|worth buying|before you buy)\b/u.test(coreSubject)
  ) {
    return { intent: "buy", confidence: 0.92, reason: "The source recommends a product for a purchase decision." };
  }
  if (resourceType === "watchlist") {
    return { intent: "track", confidence: 0.98, reason: "The source names opportunities or entities whose status can change." };
  }
  if (card.presentationType === "news_update") {
    return { intent: "track", confidence: 0.96, reason: "The source is a time-sensitive update." };
  }
  if (card.presentationType === "how_to" || card.contentType === "tutorial") {
    return { intent: "try", confidence: 0.98, reason: "The source teaches a method or practical tactic." };
  }
  if (
    domain === "travel"
    && /\b(?:place|places|destination|destinations|visit|restaurant|hotel|japan|tokyo|trip|itinerary|flight|tourist|vacation)\b/u.test(coreSubject)
  ) {
    return { intent: "visit", confidence: 0.94, reason: "The source is useful while planning a trip or visit." };
  }
  if (domain === "food" && /\b(?:restaurant|restaurants|cafe|cafes|bakery|bar|place|places|visit|where to eat|what to order)\b/u.test(coreSubject)) {
    return { intent: "visit", confidence: 0.93, reason: "The source recommends a place to visit or order from." };
  }
  if (card.contentType === "tactic") {
    return { intent: "try", confidence: 0.94, reason: "The source contains a practical tactic to use." };
  }
  if (
    domain !== "finance"
    && domain !== "health"
    && /\b(?:step[-\s]by[-\s]step|checklist|workflow|set up|setup|implement|template|recipe|how to (?:make|build|create|use|start))\b/u.test(subject)
  ) {
    return { intent: "try", confidence: 0.88, reason: "The source contains a practical process to try." };
  }
  if (card.presentationType === "story" || card.contentType === "personal_experience") {
    return { intent: "reference", confidence: 0.82, reason: "The source is primarily experience or perspective to keep for reference." };
  }
  return { intent: "understand", confidence: 0.78, reason: "The source primarily explains an idea." };
}

export function inferSaveIntent(card: LearningCard): SaveIntent {
  return inferSaveIntentWithConfidence(card).intent;
}

function resolvedIntent(
  card: LearningCard,
  matched: KnowledgeResource | null | undefined,
  aiIntent: SaveIntent | null | undefined,
): SaveIntent {
  const inferred = inferSaveIntentWithConfidence(card);
  if (inferred.intent !== "understand" && inferred.confidence >= 0.85) return inferred.intent;
  if (aiIntent && aiIntent !== "understand") return aiIntent;
  if (matched?.intent && matched.intent !== "understand") return matched.intent;
  return aiIntent ?? matched?.intent ?? inferred.intent;
}

function splitTakeaway(value: string): { heading: string | null; detail: string } {
  const trimmed = compact(value);
  const dash = trimmed.match(/^(.{2,160}?)\s+[—–]\s+(.+)$/u);
  if (dash) return { heading: compact(dash[1]), detail: compact(dash[2]) };
  const colon = trimmed.match(/^([^:]{2,80}):\s+(.+)$/u);
  if (colon) return { heading: compact(colon[1]), detail: compact(colon[2]) };
  return { heading: null, detail: trimmed };
}

function entryKind(resourceType: KnowledgeResourceType): KnowledgeResourceEntry["kind"] {
  if (resourceType === "glossary") return "term";
  if (resourceType === "playbook") return "step";
  if (resourceType === "watchlist") return "recommendation";
  return "insight";
}

function entryMatchScore(left: KnowledgeResourceEntry, right: KnowledgeResourceEntry): number {
  if (left.heading && right.heading) {
    const headingScore = overlapCoefficient(tokens(left.heading), tokens(right.heading));
    if (headingScore === 1) return 1;
  }
  return overlapCoefficient(tokens(`${left.heading ?? ""} ${left.detail}`), tokens(`${right.heading ?? ""} ${right.detail}`));
}

function researchRank(entry: KnowledgeResourceEntry): number {
  if (!entry.research) return 0;
  if (entry.research.verdict === "corrected") return 5;
  if (entry.research.verdict === "confirmed") return 4;
  if (entry.research.verdict === "supported_with_context") return 3;
  if (entry.research.verdict === "not_verified") return 2;
  return 1;
}

function entriesFromCard(
  item: LearningItem,
  resourceType: KnowledgeResourceType,
  id: () => string,
): KnowledgeResourceEntry[] {
  if (!item.card) return [];
  const alignedResearch = item.card.researchBrief?.findings.length === item.card.keyTakeaways.length;
  return item.card.keyTakeaways.map((takeaway, index) => {
    const split = splitTakeaway(takeaway);
    return {
      id: id(),
      kind: entryKind(resourceType),
      heading: split.heading,
      detail: split.detail,
      sourceItemIds: [item.id],
      research: alignedResearch ? item.card?.researchBrief?.findings[index] ?? null : null,
      researchedAt: alignedResearch ? item.card?.researchBrief?.researchedAt ?? null : null,
      status: "active",
      relatedEntryIds: [],
    };
  });
}

function resourceEntities(card: LearningCard, entries: KnowledgeResourceEntry[]): string[] {
  const candidates = [
    card.primaryTopic,
    ...card.secondaryTopics,
    ...entries.map((entry) => entry.heading).filter((heading): heading is string => Boolean(heading)),
  ].map(compact).filter(Boolean);
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = candidate.toLocaleLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 30);
}

function changeSummary(
  resourceType: KnowledgeResourceType,
  disposition: ResourceContribution["disposition"],
  added: number,
  supported: number,
  updated: number,
  conflicts: number,
): string {
  const label = resourceType === "glossary" ? "term" : resourceType === "playbook" ? "step" : resourceType === "watchlist" ? "item" : "insight";
  if (disposition === "created") return `Created this ${resourceType} with ${added} ${label}${added === 1 ? "" : "s"}.`;
  const parts: string[] = [];
  const ordinaryAdded = Math.max(0, added - updated - conflicts);
  if (ordinaryAdded) parts.push(`Added ${ordinaryAdded} new ${label}${ordinaryAdded === 1 ? "" : "s"}`);
  if (supported) parts.push(`${supported} existing ${label}${supported === 1 ? " was" : "s were"} already covered`);
  if (updated) parts.push(`${updated} ${label}${updated === 1 ? " was" : "s were"} updated`);
  if (conflicts) parts.push(`${conflicts} ${label}${conflicts === 1 ? " conflicts" : "s conflict"} with an earlier source`);
  if (parts.length) return `${parts.join("; ")}.`;
  if (disposition === "updated" && added) return `Refreshed this source and updated ${added} ${label}${added === 1 ? "" : "s"}.`;
  if (disposition === "updated") return `Refreshed this source without adding repeated ${label}s.`;
  if (added && supported) return `Added ${added} new ${label}${added === 1 ? "" : "s"}; ${supported} existing ${label}${supported === 1 ? " was" : "s were"} reinforced.`;
  if (added) return `Added ${added} new ${label}${added === 1 ? "" : "s"} to this ${resourceType}.`;
  return `No repeated notes were added; this source reinforced ${supported} existing ${label}${supported === 1 ? "" : "s"}.`;
}

export interface ResourceUpsertResult {
  item: LearningItem;
  resource: KnowledgeResource;
  contribution: ResourceContribution;
}

interface ResourceUpsertOptions {
  id?: () => string;
  now?: () => string;
  merger?: KnowledgeResourceMerger | null;
}

export async function upsertKnowledgeResourceForItem(
  item: LearningItem,
  repository: CurioRepository,
  options: ResourceUpsertOptions = {},
): Promise<ResourceUpsertResult | null> {
  if (!item.card) return null;
  const id = options.id ?? (() => crypto.randomUUID());
  const now = options.now ?? (() => new Date().toISOString());
  const timestamp = now();
  const resources = await repository.listResources(item.profileId);
  const directlyLinked = resources.find((resource) => resource.sourceItemIds.includes(item.id));
  const candidates = directlyLinked ? [directlyLinked] : resourceCandidates(resources, item.card);
  let mergeDecision: KnowledgeResourceMergeResult | null = null;
  if (options.merger && candidates.length) {
    try {
      mergeDecision = await options.merger.decide({ item, candidates });
    } catch {
      mergeDecision = null;
    }
  }

  const aiMatched = mergeDecision?.matchDecision === "merge"
    ? candidates.find((candidate) => candidate.id === mergeDecision?.matchedResourceId)
    : null;
  const deterministicMatched = resources
    .map((resource) => ({ resource, score: resourceMatchScore(resource, item.card as LearningCard) }))
    .filter((candidate) => candidate.score >= 0.72)
    .sort((left, right) => right.score - left.score)[0]?.resource;
  const matched = directlyLinked
    ?? (mergeDecision ? aiMatched : deterministicMatched);
  if (directlyLinked && mergeDecision?.matchDecision !== "merge") mergeDecision = null;
  const resourceType = matched?.resourceType ?? inferKnowledgeResourceType(item.card);
  const incomingEntries = entriesFromCard(item, resourceType, id);
  const wasExistingSource = Boolean(matched?.sourceItemIds.includes(item.id));
  const retainedEntries = (matched?.entries ?? [])
    .map((entry) => ({ ...entry, sourceItemIds: entry.sourceItemIds.filter((sourceId) => sourceId !== item.id) }))
    .filter((entry) => entry.sourceItemIds.length > 0);
  const retainedEntryIds = new Set(retainedEntries.map((entry) => entry.id));
  const baseEntries = retainedEntries.map((entry) => {
    const relatedEntryIds = entry.relatedEntryIds.filter((entryId) => retainedEntryIds.has(entryId));
    return {
      ...entry,
      status: relatedEntryIds.length ? entry.status : "active" as const,
      relatedEntryIds,
    };
  });
  const addedEntryIds: string[] = [];
  const supportedEntryIds: string[] = [];
  const updatedEntryIds: string[] = [];
  const conflictingEntryIds: string[] = [];

  for (const [incomingIndex, incoming] of incomingEntries.entries()) {
    const aiPoint = matched && mergeDecision?.matchDecision === "merge"
      ? mergeDecision.pointDecisions.find((point) => point.incomingIndex === incomingIndex) ?? null
      : null;
    const aiEntryIndex = aiPoint?.existingEntryId
      ? baseEntries.findIndex((entry) => entry.id === aiPoint.existingEntryId)
      : -1;
    const deterministicExisting = baseEntries
      .map((entry, index) => ({ entry, index, score: entryMatchScore(entry, incoming) }))
      .filter((candidate) => candidate.score >= 0.78)
      .sort((left, right) => right.score - left.score)[0];
    const action = aiPoint && (aiPoint.action === "new" || aiEntryIndex >= 0)
      ? aiPoint.action
      : deterministicExisting
        ? "supports"
        : "new";
    const existingIndex = aiPoint && aiEntryIndex >= 0
      ? aiEntryIndex
      : deterministicExisting?.index ?? -1;
    const existing = existingIndex >= 0 ? baseEntries[existingIndex] : null;

    if (action === "new" || !existing) {
      baseEntries.push(incoming);
      addedEntryIds.push(incoming.id);
      continue;
    }
    if (action === "conflicts") {
      const contestedIncoming: KnowledgeResourceEntry = {
        ...incoming,
        status: "contested",
        relatedEntryIds: [existing.id],
      };
      baseEntries[existingIndex] = {
        ...existing,
        status: "contested",
        relatedEntryIds: [...new Set([...existing.relatedEntryIds, contestedIncoming.id])],
      };
      baseEntries.push(contestedIncoming);
      addedEntryIds.push(contestedIncoming.id);
      conflictingEntryIds.push(contestedIncoming.id);
      continue;
    }
    if (action === "updates") {
      const updatedIncoming: KnowledgeResourceEntry = {
        ...incoming,
        status: "active",
        relatedEntryIds: [existing.id],
      };
      baseEntries[existingIndex] = {
        ...existing,
        status: "superseded",
        relatedEntryIds: [...new Set([...existing.relatedEntryIds, updatedIncoming.id])],
      };
      baseEntries.push(updatedIncoming);
      addedEntryIds.push(updatedIncoming.id);
      updatedEntryIds.push(updatedIncoming.id);
      continue;
    }
    const combined: KnowledgeResourceEntry = {
      ...existing,
      sourceItemIds: [...new Set([...existing.sourceItemIds, item.id])],
    };
    if (researchRank(incoming) > researchRank(combined)) {
      combined.research = incoming.research;
      combined.researchedAt = incoming.researchedAt;
    }
    baseEntries[existingIndex] = combined;
    supportedEntryIds.push(combined.id);
  }

  const disposition: ResourceContribution["disposition"] = conflictingEntryIds.length
    ? "conflict"
    : !matched
    ? "created"
    : updatedEntryIds.length || wasExistingSource
      ? "updated"
      : addedEntryIds.length
        ? "enriched"
        : "supporting";
  const contribution: ResourceContribution = {
    sourceItemId: item.id,
    disposition,
    addedEntryIds,
    supportedEntryIds,
    updatedEntryIds,
    conflictingEntryIds,
    summary: changeSummary(
      resourceType,
      disposition,
      addedEntryIds.length,
      supportedEntryIds.length,
      updatedEntryIds.length,
      conflictingEntryIds.length,
    ),
    decisionMode: mergeDecision ? "ai" : "deterministic",
    decisionConfidence: mergeDecision?.confidence ?? 1,
    decisionReason: mergeDecision?.reason ?? null,
    mergeModel: mergeDecision?.model ?? null,
    mergePromptVersion: mergeDecision?.promptVersion ?? null,
    createdAt: timestamp,
  };
  const previousContributions = (matched?.contributions ?? []).filter((entry) => entry.sourceItemId !== item.id);
  const sourceItemIds = [...new Set([...(matched?.sourceItemIds.filter((sourceId) => sourceId !== item.id) ?? []), item.id])];
  const lastResearchedAt = [
    matched?.lastResearchedAt ?? null,
    item.card.researchBrief?.researchedAt ?? null,
  ].filter((value): value is string => Boolean(value)).sort().at(-1) ?? null;
  const resource = knowledgeResourceSchema.parse({
    id: matched?.id ?? id(),
    profileId: item.profileId,
    resourceType,
    domain: matched?.domain ?? inferResourceDomain(item.card),
    intent: resolvedIntent(item.card, matched, mergeDecision?.inferredIntent),
    canonicalTopic: matched?.canonicalTopic ?? canonicalResourceTopic(item.card),
    title: matched && mergeDecision?.matchDecision === "merge"
      ? mergeDecision.synthesizedTitle ?? matched.title
      : matched?.title ?? item.card.title,
    summary: matched && mergeDecision?.matchDecision === "merge"
      ? mergeDecision.synthesizedSummary ?? matched.summary
      : matched?.summary ?? item.card.summary,
    entities: [...new Set([...(matched?.entities ?? []), ...resourceEntities(item.card, baseEntries)])].slice(0, 30),
    entries: baseEntries,
    sourceItemIds,
    contributions: [...previousContributions.slice(-199), contribution],
    lastResearchedAt,
    mergeModel: mergeDecision?.model ?? matched?.mergeModel ?? null,
    mergePromptVersion: mergeDecision?.promptVersion ?? matched?.mergePromptVersion ?? null,
    version: (matched?.version ?? 0) + 1,
    createdAt: matched?.createdAt ?? timestamp,
    updatedAt: timestamp,
  });
  const savedResource = await repository.saveResource(resource);
  const savedItem = await repository.save(learningItemSchema.parse({
    ...item,
    resourceIds: [savedResource.id],
    inferredIntent: resource.intent,
  }));
  return { item: savedItem, resource: savedResource, contribution };
}

export async function synchronizeKnowledgeResources(
  items: LearningItem[],
  repository: CurioRepository,
): Promise<KnowledgeResource[]> {
  const ordered = [...items].sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  for (const item of ordered) {
    if (!item.card) continue;
    const resources = await repository.listResources(item.profileId);
    if (resources.some((resource) => resource.sourceItemIds.includes(item.id))) continue;
    await upsertKnowledgeResourceForItem(item, repository);
  }
  const profileId = ordered[0]?.profileId ?? "00000000-0000-4000-8000-000000000031";
  const itemById = new Map(ordered.map((item) => [item.id, item]));
  const resources = await repository.listResources(profileId);
  for (const resource of resources) {
    const inferred = resource.sourceItemIds
      .map((itemId) => itemById.get(itemId)?.card ?? null)
      .filter((card): card is LearningCard => Boolean(card))
      .map(inferSaveIntentWithConfidence)
      .filter((candidate) => candidate.intent !== "understand"
        && (candidate.confidence >= 0.85 || (candidate.intent === "reference" && candidate.confidence >= 0.8)))
      .sort((left, right) => right.confidence - left.confidence)[0];
    const repairedIntent = inferred?.intent ?? "understand";
    if (resource.intent === repairedIntent) continue;

    await repository.saveResource(knowledgeResourceSchema.parse({
      ...resource,
      intent: repairedIntent,
      version: resource.version + 1,
    }));
    for (const itemId of resource.sourceItemIds) {
      const sourceItem = itemById.get(itemId);
      if (!sourceItem || (sourceItem.inferredIntent === repairedIntent && sourceItem.resourceIds.includes(resource.id))) continue;
      const repairedItem = learningItemSchema.parse({
        ...sourceItem,
        inferredIntent: repairedIntent,
        resourceIds: [...new Set([...sourceItem.resourceIds, resource.id])].slice(0, 10),
      });
      await repository.save(repairedItem);
      itemById.set(itemId, repairedItem);
    }
  }
  return repository.listResources(profileId);
}
