import type {
  ContextDomain,
  KnowledgeResource,
  KnowledgeResourceEntry,
  LearningItem,
} from "../domain";

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

function entrySearchScore(entry: KnowledgeResourceEntry, query: Set<string>): number {
  return (
    fieldMatch(entry.heading, query).count * 9
    + fieldMatch(entry.detail, query).count * 5
    + fieldMatch(entry.research?.topic, query).count * 5
    + fieldMatch(entry.research?.explanation, query).count * 3
    + fieldMatch(entry.research?.correction, query).count * 4
  );
}

export interface KnowledgeSearchPoint {
  entryId: string;
  heading: string | null;
  detail: string;
  status: KnowledgeResourceEntry["status"];
}

export interface KnowledgeSearchAnswer {
  resourceId: string;
  title: string;
  summary: string;
  points: KnowledgeSearchPoint[];
  sourceCount: number;
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

function answerFor(hit: KnowledgeSearchHit, query: Set<string>): KnowledgeSearchAnswer {
  const rankedEntries = hit.resource.entries
    .filter((entry) => entry.status !== "superseded")
    .map((entry, index) => ({ entry, index, score: entrySearchScore(entry, query) }))
    .sort((left, right) => right.score - left.score || left.index - right.index);
  const matchedEntries = rankedEntries.filter(({ score }) => score > 0);
  const selected = matchedEntries.length
    ? [...matchedEntries, ...rankedEntries.filter(({ score }) => score === 0)].slice(0, 3)
    : rankedEntries.slice(0, 3);
  return {
    resourceId: hit.resource.id,
    title: hit.resource.title,
    summary: hit.resource.summary,
    points: selected.map(({ entry }) => ({
      entryId: entry.id,
      heading: entry.heading,
      detail: entry.detail,
      status: entry.status,
    })),
    sourceCount: hit.resource.sourceItemIds.length,
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
        fieldMatch(`${entry.heading ?? ""} ${entry.detail} ${entry.research?.topic ?? ""} ${entry.research?.explanation ?? ""} ${entry.research?.correction ?? ""}`, query)
          .matched.forEach((token) => matchedTokens.add(token));
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

    const coverage = matchedTokens.size / query.size;
    if (score <= 0 || (query.size >= 3 && coverage < 0.25 && score < 14)) return [];
    return [{
      resource,
      score: Math.round(score + coverage * 20),
      matchedEntryIds: entryScores.filter((entry) => entry.score > 0).sort((left, right) => right.score - left.score).map((entry) => entry.id),
      matchedOn: matchedOn.slice(0, 4),
    }];
  }).sort((left, right) => right.score - left.score || right.resource.updatedAt.localeCompare(left.resource.updatedAt));
  const strongestScore = candidates[0]?.score ?? 0;
  const relativeCutoff = query.size >= 3 ? strongestScore * 0.3 : query.size === 2 ? strongestScore * 0.2 : 0;
  const results = candidates
    .filter((candidate, index) => index === 0 || candidate.score >= Math.max(8, relativeCutoff))
    .slice(0, Math.max(1, Math.min(input.limit ?? 8, 20)));

  return {
    query: trimmedQuery,
    answer: results[0] ? answerFor(results[0], query) : null,
    results,
  };
}
