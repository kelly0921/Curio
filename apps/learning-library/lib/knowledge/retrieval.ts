import type {
  ContextDomain,
  KnowledgeResource,
  KnowledgeResourceEntry,
  LearningItem,
  ResearchFinding,
} from "../domain";

const DETERMINISTIC_SEARCH_VERSION = "knowledge-search-v2-cross-resource" as const;

const SEARCH_STOP_WORDS = new Set([
  "a", "about", "all", "an", "and", "are", "can", "could", "did", "do", "does", "find", "for", "from", "give", "have", "help", "how", "i",
  "in", "is", "it", "know", "me", "my", "need", "of", "on", "or", "please", "sav", "save", "saved", "should", "show", "tell", "that", "the", "thing", "things",
  "to", "use", "using", "want", "was", "were", "what", "when", "where", "which", "who", "why", "with", "would",
]);

function stem(token: string): string {
  if (/^invest(?:ed|ing|ment|ments|or|ors)?$/u.test(token)) return "invest";
  if (/^tax(?:es|ation)?$/u.test(token)) return "tax";
  if (/^compan(?:y|ies)$/u.test(token)) return "company";
  if (/^saving(?:s)?$/u.test(token)) return "saving";
  if (token.length > 5 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function tokens(value: string): string[] {
  return value
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9\s]/gu, " ")
    .split(/\s+/u)
    .map(stem)
    .filter((token) => token.length > 1 && !SEARCH_STOP_WORDS.has(token));
}

function queryTokens(value: string): string[] {
  const raw = value.toLocaleLowerCase().normalize("NFKD");
  const expanded = new Set(tokens(raw));
  if (expanded.has("hsa") || /\bhealth\s+savings?\s+accounts?\b/u.test(raw)) {
    ["hsa", "health", "saving", "account"].forEach((token) => expanded.add(token));
  }
  if (expanded.has("ai") || /\bartificial\s+intelligence\b/u.test(raw) || expanded.has("llm")) {
    ["ai", "artificial", "intelligence", "llm"].forEach((token) => expanded.add(token));
  }
  if (expanded.has("trip") || expanded.has("travel")) {
    expanded.add("trip");
    expanded.add("travel");
  }
  if (expanded.has("stock") || expanded.has("ticker")) {
    expanded.add("company");
    expanded.add("invest");
  }
  return [...expanded].slice(0, 20);
}

function sourceSearchText(item: LearningItem): string {
  const card = item.card;
  return [
    item.creator,
    item.sourceCaption,
    item.transcript?.slice(0, 20_000),
    item.extractedVisualText,
    card?.title,
    card?.primaryTopic,
    ...(card?.secondaryTopics ?? []),
    card?.summary,
    ...(card?.keyTakeaways ?? []),
    ...(card?.notes ?? []).flatMap((note) => [note.title, note.detail]),
    ...(card?.claimsToVerify ?? []).flatMap((claim) => [claim.claim, claim.reasonToVerify]),
  ].filter((value): value is string => Boolean(value)).join(" ");
}

function fieldMatch(value: string | null | undefined, query: Set<string>): { count: number; matched: string[] } {
  if (!value) return { count: 0, matched: [] };
  const fieldTokens = new Set(tokens(value));
  const matched = [...query].filter((token) => fieldTokens.has(token));
  return { count: matched.length, matched };
}

function entrySearchText(entry: KnowledgeResourceEntry): string {
  return [
    entry.heading,
    entry.detail,
    entry.research?.topic,
    entry.research?.explanation,
    entry.research?.correction,
    ...entry.deepDives.flatMap((deepDive) => [deepDive.question, deepDive.answer]),
  ].filter((value): value is string => Boolean(value)).join(" ");
}

function entrySearchScore(entry: KnowledgeResourceEntry, query: Set<string>): number {
  return (
    fieldMatch(entry.heading, query).count * 9
    + fieldMatch(entry.detail, query).count * 5
    + fieldMatch(entry.research?.topic, query).count * 5
    + fieldMatch(entry.research?.explanation, query).count * 3
    + fieldMatch(entry.research?.correction, query).count * 5
    + entry.deepDives.reduce((score, deepDive) => score
      + fieldMatch(deepDive.question, query).count * 4
      + fieldMatch(deepDive.answer, query).count * 3, 0)
  );
}

function evidenceLabel(research: ResearchFinding | null): string {
  if (!research) return "From a saved source";
  if (research.verdict === "confirmed") return "Confirmed by research";
  if (research.verdict === "supported_with_context") return "Verified with context";
  if (research.verdict === "corrected") return "Corrected by Curio";
  if (research.verdict === "not_verified") return "Not fully verified";
  return "Saved perspective";
}

function compactText(value: string, maxLength = 240): string {
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (normalized.length <= maxLength) return normalized;
  const boundary = normalized.lastIndexOf(" ", maxLength - 1);
  return `${normalized.slice(0, boundary > maxLength * 0.7 ? boundary : maxLength - 1).trimEnd()}…`;
}

function preferredEntryDetail(entry: KnowledgeResourceEntry, query: Set<string>): string {
  if (entry.research?.verdict === "corrected" && entry.research.correction?.trim()) {
    return compactText(entry.research.correction);
  }
  const options = [
    ...entry.deepDives.map((deepDive) => ({ value: deepDive.answer, score: fieldMatch(`${deepDive.question} ${deepDive.answer}`, query).count * 6 })),
    { value: entry.research?.explanation ?? "", score: fieldMatch(entry.research?.explanation, query).count * 5 },
    { value: entry.detail, score: fieldMatch(entry.detail, query).count * 4 },
  ].filter(({ value }) => value.trim());
  return compactText(options.sort((left, right) => right.score - left.score)[0]?.value ?? entry.detail);
}

export interface KnowledgeSearchPoint {
  resourceId: string;
  resourceTitle: string;
  entryId: string;
  heading: string | null;
  detail: string;
  status: KnowledgeResourceEntry["status"];
  evidence: string;
}

export interface KnowledgeSearchAnswer {
  resourceId: string;
  title: string;
  summary: string;
  points: KnowledgeSearchPoint[];
  sourceCount: number;
  resourceCount: number;
  mode: "library_matches" | "library_synthesis";
  caveat: string | null;
  model: string | null;
  promptVersion: string;
}

export interface KnowledgeSearchHit {
  resource: KnowledgeResource;
  score: number;
  matchedEntryIds: string[];
  matchedOn: string[];
}

export interface KnowledgeSearchResponse {
  query: string;
  answer: KnowledgeSearchAnswer | null;
  results: KnowledgeSearchHit[];
}

function rankedEntries(hit: KnowledgeSearchHit, query: Set<string>) {
  return hit.resource.entries
    .filter((entry) => entry.status !== "superseded")
    .map((entry, index) => ({ entry, index, score: entrySearchScore(entry, query) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
}

function answerPoint(resource: KnowledgeResource, entry: KnowledgeResourceEntry, query: Set<string>): KnowledgeSearchPoint {
  return {
    resourceId: resource.id,
    resourceTitle: resource.title,
    entryId: entry.id,
    heading: entry.heading,
    detail: preferredEntryDetail(entry, query),
    status: entry.status,
    evidence: evidenceLabel(entry.research),
  };
}

function compactSummary(resources: KnowledgeResource[], fallback: string): string {
  const seen = new Set<string>();
  const joined = resources.flatMap((resource): string[] => {
    const summary = resource.summary.trim();
    const key = summary.toLocaleLowerCase();
    if (!summary || seen.has(key)) return [];
    seen.add(key);
    return [summary];
  }).slice(0, 2).join(" ");
  if (!joined) return fallback;
  return compactText(joined, 280);
}

function answerFor(hits: KnowledgeSearchHit[], query: Set<string>): KnowledgeSearchAnswer | null {
  const primary = hits[0]?.resource;
  if (!primary) return null;
  const byHit = hits.map((hit) => ({ hit, entries: rankedEntries(hit, query) }));
  const maxPoints = byHit.length === 1 ? 3 : Math.min(4, byHit.length);
  const selected: { resource: KnowledgeResource; entry: KnowledgeResourceEntry }[] = [];
  const selectedKeys = new Set<string>();
  const add = (resource: KnowledgeResource, entry: KnowledgeResourceEntry | undefined) => {
    if (!entry || selected.length >= maxPoints) return;
    const key = `${resource.id}:${entry.id}`;
    if (selectedKeys.has(key)) return;
    selectedKeys.add(key);
    selected.push({ resource, entry });
  };

  byHit.slice(0, 3).forEach(({ hit, entries }) => add(hit.resource, entries.find(({ score }) => score > 0)?.entry ?? entries[0]?.entry));
  if (byHit.length < 3) {
    byHit.forEach(({ hit, entries }) => entries.forEach(({ entry }) => add(hit.resource, entry)));
  }
  const points = selected.map(({ resource, entry }) => answerPoint(resource, entry, query));
  const resourceIds = new Set(points.map((point) => point.resourceId));
  const answerResources = hits.filter((hit) => resourceIds.has(hit.resource.id)).map((hit) => hit.resource);
  const sourceIds = new Set(answerResources.flatMap((resource) => resource.sourceItemIds));
  return {
    resourceId: primary.id,
    title: primary.title,
    summary: compactSummary(answerResources, primary.summary),
    points,
    sourceCount: sourceIds.size,
    resourceCount: resourceIds.size,
    mode: resourceIds.size > 1 ? "library_synthesis" : "library_matches",
    caveat: null,
    model: null,
    promptVersion: DETERMINISTIC_SEARCH_VERSION,
  };
}

export function searchKnowledge(input: {
  query: string;
  resources: KnowledgeResource[];
  items: LearningItem[];
  domain?: ContextDomain | null;
  limit?: number;
}): KnowledgeSearchResponse {
  const trimmedQuery = input.query.trim().replace(/\s+/gu, " ").slice(0, 300);
  const expandedTokens = queryTokens(trimmedQuery);
  if (!expandedTokens.length) return { query: trimmedQuery, answer: null, results: [] };
  const query = new Set(expandedTokens);
  const rawQuery = trimmedQuery.toLocaleLowerCase();
  const inferredDomain: ContextDomain | null = expandedTokens.some((token) => ["account", "bank", "finance", "hsa", "invest", "portfolio", "stock", "tax", "ticker"].includes(token))
    ? "finance"
    : expandedTokens.some((token) => ["trip", "travel"].includes(token))
      ? "travel"
      : expandedTokens.some((token) => ["ai", "artificial", "intelligence", "llm"].includes(token))
        ? "ai_work"
        : expandedTokens.some((token) => ["dish", "food", "recipe", "restaurant"].includes(token))
          ? "food"
          : null;
  const asksForOptions = /\b(?:ideas?|options?|recommendations?|picks?|stocks?|companies?)\b/iu.test(rawQuery);
  const itemsById = new Map(input.items.map((item) => [item.id, item]));

  const candidates = input.resources.flatMap((resource): KnowledgeSearchHit[] => {
    if (input.domain && resource.domain !== input.domain) return [];
    let score = 0;
    const matchedTokens = new Set<string>();
    const matchedOn: string[] = [];
    const addField = (value: string | null | undefined, weight: number, label?: string | null) => {
      const match = fieldMatch(value, query);
      if (!match.count) return;
      score += match.count * weight;
      match.matched.forEach((token) => matchedTokens.add(token));
      if (label && !matchedOn.includes(label)) matchedOn.push(label);
    };

    addField(resource.title, 14, resource.title);
    addField(resource.canonicalTopic, 12, resource.canonicalTopic);
    addField(resource.summary, 6);
    addField(resource.domain, 6);
    addField(resource.resourceType, 5);
    addField(resource.intent, 4);
    resource.entities.forEach((entity) => addField(entity, 9, entity));

    const entryScores = resource.entries.map((entry) => {
      const entryScore = entrySearchScore(entry, query);
      if (entryScore > 0) {
        score += entryScore;
        fieldMatch(entrySearchText(entry), query).matched.forEach((token) => matchedTokens.add(token));
        if (entry.heading && !matchedOn.includes(entry.heading)) matchedOn.push(entry.heading);
      }
      return { id: entry.id, score: entryScore };
    });

    for (const sourceId of resource.sourceItemIds) {
      const source = itemsById.get(sourceId);
      if (!source) continue;
      const match = fieldMatch(sourceSearchText(source), query);
      if (!match.count) continue;
      score += match.count * 2;
      match.matched.forEach((token) => matchedTokens.add(token));
      const sourceLabel = source.card?.title ?? source.creator;
      if (sourceLabel && !matchedOn.includes(sourceLabel)) matchedOn.push(sourceLabel);
    }

    if (!input.domain && inferredDomain) score += resource.domain === inferredDomain ? 18 : -8;
    if (asksForOptions) {
      if (resource.resourceType === "watchlist") score += 42;
      if (["buy", "compare", "track", "visit"].includes(resource.intent)) score += 24;
      if (resource.resourceType === "glossary") score -= 18;
    }

    const coverage = matchedTokens.size / query.size;
    if (!matchedTokens.size || score <= 0 || (query.size >= 3 && coverage < 0.25 && score < 14)) return [];
    return [{
      resource,
      score: Math.round(score + coverage * 20),
      matchedEntryIds: entryScores.filter((entry) => entry.score > 0).sort((left, right) => right.score - left.score).map((entry) => entry.id),
      matchedOn: matchedOn.slice(0, 4),
    }];
  }).sort((left, right) => right.score - left.score || right.resource.updatedAt.localeCompare(left.resource.updatedAt));
  const strongestScore = candidates[0]?.score ?? 0;
  const relativeCutoff = strongestScore * (query.size >= 3 ? 0.35 : query.size === 2 ? 0.45 : 0.4);
  const results = candidates
    .filter((candidate, index) => index === 0 || candidate.score >= Math.max(8, relativeCutoff))
    .slice(0, Math.max(1, Math.min(input.limit ?? 8, 20)));
  const actionableResults = asksForOptions
    ? results.filter(({ resource }) => resource.resourceType === "watchlist" || ["buy", "compare", "track", "visit"].includes(resource.intent))
    : results;

  return {
    query: trimmedQuery,
    answer: answerFor(actionableResults.length ? actionableResults : results, query),
    results,
  };
}
