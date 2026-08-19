import type {
  ContextDomain,
  ContextSnapshot,
  KnowledgeResource,
  KnowledgeResourceEntry,
  LearningItem,
  ResourceContribution,
  SaveIntent,
} from "../domain";
import { assessKnowledgeResourceFreshness } from "./freshness";

export const CROSS_SAVE_SYNTHESIS_VERSION = "cross-save-synthesis-v3-intents" as const;

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1_000;

const INTEREST_TITLES: Record<ContextDomain, string> = {
  finance: "Money ideas you explored",
  travel: "Travel ideas you explored",
  food: "Food ideas you explored",
  ai_work: "AI + work ideas you explored",
  career: "Career ideas you explored",
  health: "Health ideas you explored",
  home: "Home ideas you explored",
  relationships: "Relationship ideas you explored",
  general: "Other ideas you explored",
};

const GENERIC_CONCEPT_TOKENS = new Set([
  "a", "about", "account", "across", "advice", "an", "and", "announcement", "app", "approach",
  "basic", "basics", "best", "career", "company", "concept", "content", "explained", "finance", "financial",
  "entry", "food", "for", "fund", "funding", "general", "guide", "health", "how", "idea", "ideas", "in", "insight",
  "invest", "investing", "investment", "itinerary", "job", "knowledge", "lesson", "limit", "limits", "money",
  "of", "option", "overview", "plain", "planning", "point", "preparation", "recommendation", "resource", "role", "save",
  "saving", "source", "startup", "stock", "strategy", "term", "terms", "the", "tip", "tips", "to", "topic",
  "track", "travel", "trip", "understand", "use", "using", "watch", "way", "what", "why", "with", "work",
]);

const STRONG_SHORT_CONCEPTS = new Set(["hsa", "ira", "401k"]);

export interface CrossSaveTheme {
  id: string;
  domain: ContextDomain;
  title: string;
  description: string;
  resourceIds: string[];
  resourceTitles: string[];
  resourceCount: number;
  sourceCount: number;
  contextReason: string | null;
}

export interface CrossSaveInterest {
  id: string;
  domain: ContextDomain;
  title: string;
  description: string;
  resourceIds: string[];
  resourceTitles: string[];
  subjects: string[];
  resourceCount: number;
  sourceCount: number;
}

export interface CrossSaveRemember {
  resourceId: string;
  title: string;
  heading: string | null;
  point: string;
  reason: string;
}

export interface CrossSaveNextUse {
  resourceId: string;
  title: string;
  intent: Exclude<SaveIntent, "understand" | "reference">;
  label: string;
  heading: string | null;
  point: string;
  reason: string;
}

export interface CrossSaveChange {
  resourceId: string;
  title: string;
  kind: ResourceContribution["disposition"];
  label: string;
  summary: string;
  occurredAt: string;
}

export interface CrossSaveRepeated {
  resourceId: string;
  title: string;
  heading: string | null;
  point: string;
  supportCount: number;
}

export interface CrossSaveUnresolved {
  resourceId: string;
  title: string;
  heading: string | null;
  claim: string;
  reason: string;
  kind: "contested" | "not_verified" | "research_due" | "unresearched";
}

export interface CrossSaveSynthesis {
  generatedAt: string;
  engineVersion: typeof CROSS_SAVE_SYNTHESIS_VERSION;
  period: {
    mode: "this_week" | "library";
    label: string;
    startAt: string;
    endAt: string;
  };
  overview: {
    savedSourceCount: number;
    newResourceCount: number;
    changedResourceCount: number;
    librarySourceCount: number;
    headline: string;
    detail: string;
  };
  themes: CrossSaveTheme[];
  interests: CrossSaveInterest[];
  nextUse: CrossSaveNextUse | null;
  remember: CrossSaveRemember | null;
  changed: CrossSaveChange | null;
  repeated: CrossSaveRepeated | null;
  unresolved: CrossSaveUnresolved | null;
  fallbackResourceIds: string[];
}

interface SynthesisInput {
  items: LearningItem[];
  resources: KnowledgeResource[];
  context?: ContextSnapshot | null;
  now?: Date;
}

interface ResourceEntryCandidate {
  resource: KnowledgeResource;
  entry: KnowledgeResourceEntry;
  score: number;
}

interface ChangeCandidate {
  resource: KnowledgeResource;
  contribution: ResourceContribution;
  score: number;
}

interface UnresolvedCandidate {
  resource: KnowledgeResource;
  entry: KnowledgeResourceEntry;
  score: number;
  kind: CrossSaveUnresolved["kind"];
  reason: string;
}

interface NextUseCandidate {
  resource: KnowledgeResource;
  entry: KnowledgeResourceEntry;
  intent: CrossSaveNextUse["intent"];
  score: number;
}

function toMillis(value: string): number {
  const result = Date.parse(value);
  return Number.isFinite(result) ? result : 0;
}

function inWindow(value: string, startAt: number, endAt: number): boolean {
  const time = toMillis(value);
  return time >= startAt && time <= endAt;
}

function plural(count: number, singular: string, pluralValue = `${singular}s`): string {
  return count === 1 ? singular : pluralValue;
}

function compact(value: string, maxLength = 190): string {
  const normalized = value.replace(/\s+/gu, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  const sentence = normalized.slice(0, maxLength + 1).match(/^(.{70,}?[.!?])(?:\s|$)/u)?.[1];
  if (sentence) return sentence;
  const shortened = normalized.slice(0, maxLength - 1).replace(/\s+\S*$/u, "").trim();
  return `${shortened || normalized.slice(0, maxLength - 1)}…`;
}

function researchScore(entry: KnowledgeResourceEntry): number {
  if (entry.research?.verdict === "confirmed") return 18;
  if (entry.research?.verdict === "supported_with_context") return 14;
  if (entry.research?.verdict === "opinion") return 2;
  if (!entry.research) return 6;
  return 0;
}

function contextFitScore(resource: KnowledgeResource, entry: KnowledgeResourceEntry, context?: ContextSnapshot | null): number {
  if (!context) return 0;
  const text = [resource.title, resource.canonicalTopic, ...resource.entities, entry.heading ?? "", entry.detail].join(" ").toLocaleLowerCase();
  return Math.min(30, context.records
    .filter((record) => record.domain === resource.domain || record.domain === "general")
    .reduce((score, record) => score + Math.min(3, record.keywords.filter((keyword) => text.includes(keyword.toLocaleLowerCase())).length) * 6, 0));
}

function resourceDurabilityScore(resource: KnowledgeResource): number {
  if (resource.resourceType === "watchlist" || resource.intent === "track") return -24;
  if (resource.resourceType === "playbook" || resource.resourceType === "glossary") return 8;
  return 5;
}

function entryCandidates(resources: KnowledgeResource[], context?: ContextSnapshot | null): ResourceEntryCandidate[] {
  return resources.flatMap((resource) => resource.entries
    .filter((entry) => (entry.status ?? "active") === "active")
    .map((entry) => ({
      resource,
      entry,
      score: (entry.sourceItemIds.length * 12)
        + researchScore(entry)
        + resourceDurabilityScore(resource)
        + contextFitScore(resource, entry, context)
        + (entry.heading ? 3 : 0)
        + Math.min(6, Math.floor(entry.detail.length / 100)),
    })));
}

function nonDemoContextReason(domain: ContextDomain, context?: ContextSnapshot | null): string | null {
  if (!context) return null;
  const demoConnections = new Set(context.connections.filter((connection) => connection.isDemo).map((connection) => connection.id));
  const record = context.records.find((candidate) => candidate.domain === domain && !demoConnections.has(candidate.connectionId));
  if (!record) return null;
  return compact(record.statement, 120);
}

function normalizedConceptTokens(value: string): string[] {
  const withAliases = value.toLocaleLowerCase()
    .replace(/\bhealth savings? accounts?\b/gu, "hsa")
    .replace(/\bartificial intelligence\b/gu, "ai")
    .replace(/\b401\s*\(k\)\b/gu, "401k");
  return (withAliases.match(/[a-z0-9]+/gu) ?? [])
    .map((token) => {
      if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
      if (token.length > 4 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
      return token;
    })
    .filter((token) => token.length > 1 && !GENERIC_CONCEPT_TOKENS.has(token));
}

function conceptDisplay(key: string, original?: string): string {
  if (key === "hsa") return "Health savings accounts";
  if (key === "ira") return "IRAs";
  if (key === "401k") return "401(k)s";
  if (key === "ai") return "AI";
  const cleaned = original?.replace(/^topic\s+/iu, "").trim();
  if (cleaned) return cleaned;
  return key.replace(/\b\w/gu, (letter) => letter.toLocaleUpperCase());
}

function conceptKeyIsStrong(key: string): boolean {
  const tokens = key.split(" ");
  return tokens.length >= 2 || STRONG_SHORT_CONCEPTS.has(key) || key.length >= 5;
}

function resourceConcepts(resource: KnowledgeResource): Map<string, string> {
  const concepts = new Map<string, string>();
  const candidates = [
    resource.canonicalTopic,
    ...resource.entities,
    ...resource.entries.map((entry) => entry.heading).filter((heading): heading is string => Boolean(heading)),
  ];
  candidates.forEach((candidate) => {
    const key = normalizedConceptTokens(candidate).join(" ");
    if (key && conceptKeyIsStrong(key) && !concepts.has(key)) concepts.set(key, conceptDisplay(key, candidate));
  });
  return concepts;
}

function resourceConceptTokenSet(resource: KnowledgeResource): Set<string> {
  return new Set([...resourceConcepts(resource).keys()].flatMap((key) => key.split(" ")));
}

function conceptOverlapScore(left: KnowledgeResource, right: KnowledgeResource): number {
  const leftConcepts = resourceConcepts(left);
  const rightConcepts = resourceConcepts(right);
  const exactKeys = [...leftConcepts.keys()].filter((key) => rightConcepts.has(key) && conceptKeyIsStrong(key));
  if (exactKeys.length) return 100 + Math.max(...exactKeys.map((key) => key.split(" ").length * 10 + key.length));
  if (left.domain !== right.domain) return 0;
  const rightTokens = resourceConceptTokenSet(right);
  const sharedTokens = [...resourceConceptTokenSet(left)].filter((token) => rightTokens.has(token));
  return sharedTokens.length >= 2 ? 50 + sharedTokens.length * 10 : 0;
}

function stableThemeId(label: string, resourceIds: string[]): string {
  const value = `${label}|${[...resourceIds].sort().join("|")}`;
  let hash = 0;
  for (const character of value) hash = ((hash << 5) - hash + character.charCodeAt(0)) | 0;
  const slug = normalizedConceptTokens(label).slice(0, 4).join("-") || "connected-saves";
  return `theme-${slug}-${Math.abs(hash).toString(36)}`;
}

function sharedConceptLabel(resources: KnowledgeResource[]): string {
  if (resources.length === 1) {
    const first = resourceConcepts(resources[0]).entries().next().value as [string, string] | undefined;
    return first?.[1] ?? resources[0].canonicalTopic ?? resources[0].title;
  }
  const phraseCounts = new Map<string, { count: number; display: string }>();
  resources.forEach((resource) => resourceConcepts(resource).forEach((display, key) => {
    const existing = phraseCounts.get(key);
    phraseCounts.set(key, { count: (existing?.count ?? 0) + 1, display: existing?.display ?? display });
  }));
  const sharedPhrase = [...phraseCounts.entries()]
    .filter(([, value]) => value.count >= 2)
    .sort((left, right) => right[1].count - left[1].count || right[0].split(" ").length - left[0].split(" ").length || right[0].length - left[0].length)[0];
  if (sharedPhrase) return conceptDisplay(sharedPhrase[0], sharedPhrase[1].display);

  const tokenCounts = new Map<string, number>();
  resources.forEach((resource) => resourceConceptTokenSet(resource).forEach((token) => tokenCounts.set(token, (tokenCounts.get(token) ?? 0) + 1)));
  const sharedTokens = [...tokenCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((left, right) => right[1] - left[1] || right[0].length - left[0].length)
    .slice(0, 2)
    .map(([token]) => token);
  return conceptDisplay(sharedTokens.join(" ") || "connected saves");
}

function buildThemes(
  resources: KnowledgeResource[],
  context?: ContextSnapshot | null,
): CrossSaveTheme[] {
  const connections = resources.map(() => new Set<number>());
  for (let left = 0; left < resources.length; left += 1) {
    for (let right = left + 1; right < resources.length; right += 1) {
      if (conceptOverlapScore(resources[left], resources[right]) <= 0) continue;
      connections[left].add(right);
      connections[right].add(left);
    }
  }
  const visited = new Set<number>();
  const components: KnowledgeResource[][] = [];
  resources.forEach((resource, startIndex) => {
    if (visited.has(startIndex)) return;
    const indexes: number[] = [];
    const queue = [startIndex];
    visited.add(startIndex);
    while (queue.length) {
      const index = queue.shift();
      if (index === undefined) break;
      indexes.push(index);
      connections[index].forEach((connectedIndex) => {
        if (visited.has(connectedIndex)) return;
        visited.add(connectedIndex);
        queue.push(connectedIndex);
      });
    }
    components.push(indexes.map((index) => resources[index] ?? resource));
  });

  return components.flatMap((component): CrossSaveTheme[] => {
    const sourceIds = new Set(component.flatMap((resource) => resource.sourceItemIds));
    if (sourceIds.size < 2 || (component.length === 1 && component[0].sourceItemIds.length < 2)) return [];
    const sortedResources = [...component].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const visibleResources = sortedResources.slice(0, 4);
    const domains = new Set(sortedResources.map((resource) => resource.domain));
    const domain = domains.size === 1 ? sortedResources[0].domain : "general";
    const title = compact(sharedConceptLabel(sortedResources), 80);
    const description = sortedResources.length === 1
      ? `${sourceIds.size} saves now strengthen one ${sortedResources[0].resourceType}: ${sortedResources[0].title}.`
      : `${sourceIds.size} saves overlap on ${title.toLocaleLowerCase()} across ${sortedResources.length} ${plural(sortedResources.length, "guide")}.`;
    return [{
      id: stableThemeId(title, sortedResources.map((resource) => resource.id)),
      domain,
      title,
      description: compact(description),
      resourceIds: sortedResources.map((resource) => resource.id),
      resourceTitles: visibleResources.map((resource) => resource.title),
      resourceCount: sortedResources.length,
      sourceCount: sourceIds.size,
      contextReason: nonDemoContextReason(domain, context),
    }];
  }).sort((left, right) => {
    const leftContext = left.contextReason ? 1 : 0;
    const rightContext = right.contextReason ? 1 : 0;
    return (rightContext - leftContext)
      || (right.sourceCount - left.sourceCount)
      || (right.resourceCount - left.resourceCount)
      || left.title.localeCompare(right.title);
  });
}

function buildInterests(resources: KnowledgeResource[], themes: CrossSaveTheme[]): CrossSaveInterest[] {
  const themedResourceIds = new Set(themes.flatMap((theme) => theme.resourceIds));
  const groups = new Map<ContextDomain, KnowledgeResource[]>();
  resources.filter((resource) => !themedResourceIds.has(resource.id)).forEach((resource) => {
    groups.set(resource.domain, [...(groups.get(resource.domain) ?? []), resource]);
  });
  return [...groups.entries()].flatMap(([domain, groupedResources]): CrossSaveInterest[] => {
    if (groupedResources.length < 2) return [];
    const sortedResources = [...groupedResources].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const visibleResources = sortedResources.slice(0, 4);
    const subjects = visibleResources.map((resource) => compact(resource.canonicalTopic || resource.title, 70));
    const sourceIds = new Set(sortedResources.flatMap((resource) => resource.sourceItemIds));
    return [{
      id: `interest-${domain}`,
      domain,
      title: INTEREST_TITLES[domain],
      description: `${sortedResources.length} separate recent ${plural(sortedResources.length, "subject")} in the same broad area.`,
      resourceIds: visibleResources.map((resource) => resource.id),
      resourceTitles: visibleResources.map((resource) => resource.title),
      subjects,
      resourceCount: sortedResources.length,
      sourceCount: sourceIds.size,
    }];
  }).sort((left, right) => right.sourceCount - left.sourceCount || right.resourceCount - left.resourceCount || left.title.localeCompare(right.title)).slice(0, 3);
}

function unresolvedCandidates(resources: KnowledgeResource[], now: Date): UnresolvedCandidate[] {
  return resources.flatMap((resource): UnresolvedCandidate[] => {
    const candidates: UnresolvedCandidate[] = [];
    resource.entries.forEach((entry) => {
      if ((entry.status ?? "active") === "contested") {
        candidates.push({
          resource,
          entry,
          kind: "contested",
          reason: "Saved sources disagree on this point.",
          score: 120 + entry.sourceItemIds.length,
        });
      } else if (entry.research?.verdict === "not_verified") {
        candidates.push({
          resource,
          entry,
          kind: "not_verified",
          reason: compact(entry.research.explanation, 150),
          score: 100 + entry.sourceItemIds.length,
        });
      }
    });
    const freshness = assessKnowledgeResourceFreshness(resource, now);
    if ((freshness.status === "due" || freshness.status === "unresearched") && (resource.domain === "finance" || resource.domain === "health")) {
      const entry = resource.entries.find((candidate) => (candidate.status ?? "active") === "active" && candidate.research?.verdict !== "opinion");
      if (entry) candidates.push({
        resource,
        entry,
        kind: freshness.status === "due" ? "research_due" : "unresearched",
        reason: freshness.status === "due" ? "This guidance is time-sensitive and due for a research refresh." : "This material guidance has not been independently checked yet.",
        score: freshness.status === "due" ? 72 : 64,
      });
    }
    return candidates;
  }).sort((left, right) => right.score - left.score || right.resource.updatedAt.localeCompare(left.resource.updatedAt));
}

function repeatedCandidates(resources: KnowledgeResource[]): ResourceEntryCandidate[] {
  return entryCandidates(resources)
    .filter(({ entry }) => entry.sourceItemIds.length >= 2 && entry.research?.verdict !== "not_verified")
    .sort((left, right) => right.score - left.score || right.resource.updatedAt.localeCompare(left.resource.updatedAt));
}

function isActionIntent(intent: SaveIntent): intent is CrossSaveNextUse["intent"] {
  return intent !== "understand" && intent !== "reference";
}

function nextUseCandidates(resources: KnowledgeResource[], context?: ContextSnapshot | null): NextUseCandidate[] {
  return resources.flatMap((resource): NextUseCandidate[] => {
    const intent = resource.intent;
    if (!isActionIntent(intent)) return [];
    return resource.entries
      .filter((entry) => (entry.status ?? "active") === "active" && !["corrected", "not_verified"].includes(entry.research?.verdict ?? ""))
      .map((entry) => ({
        resource,
        entry,
        intent,
        score: (entry.sourceItemIds.length * 10)
          + researchScore(entry)
          + contextFitScore(resource, entry, context)
          + (entry.heading ? 4 : 0),
      }));
  }).sort((left, right) => right.score - left.score || right.resource.updatedAt.localeCompare(left.resource.updatedAt));
}

function nextUseCopy(intent: CrossSaveNextUse["intent"]): { label: string; reason: string } {
  if (intent === "try") return { label: "Ready to try", reason: "Curio organized this as something practical to use." };
  if (intent === "visit") return { label: "Plan with this", reason: "Keep this close when planning the visit." };
  if (intent === "buy") return { label: "Before buying", reason: "Review this point before making the purchase." };
  if (intent === "track") return { label: "Worth watching", reason: "This can change, so Curio keeps its research date visible." };
  return { label: "Before deciding", reason: "Use this point while weighing the options." };
}

function changeCandidates(resources: KnowledgeResource[], startAt: number, endAt: number): ChangeCandidate[] {
  const dispositionScore: Record<ResourceContribution["disposition"], number> = {
    conflict: 100,
    updated: 80,
    enriched: 60,
    supporting: 45,
    created: 20,
  };
  return resources.flatMap((resource) => resource.contributions
    .filter((contribution) => contribution.disposition !== "created" && inWindow(contribution.createdAt, startAt, endAt))
    .map((contribution) => ({
      resource,
      contribution,
      score: dispositionScore[contribution.disposition]
        + (/correction|corrected|conflict|disagree/iu.test(contribution.summary) ? 25 : 0),
    })))
    .sort((left, right) => right.score - left.score || right.contribution.createdAt.localeCompare(left.contribution.createdAt));
}

function changeLabel(disposition: ResourceContribution["disposition"]): string {
  if (disposition === "conflict") return "Sources disagree";
  if (disposition === "updated") return "What changed";
  if (disposition === "enriched") return "New detail added";
  if (disposition === "supporting") return "Reinforced by another save";
  return "New in your library";
}

function chooseUnused<T extends { resource: KnowledgeResource }>(
  candidates: T[],
  usedResourceIds: Set<string>,
): T | null {
  return candidates.find((candidate) => !usedResourceIds.has(candidate.resource.id)) ?? null;
}

function buildOverview(
  mode: "this_week" | "library",
  savedSourceCount: number,
  librarySourceCount: number,
  newResourceCount: number,
  changedResourceCount: number,
  themes: CrossSaveTheme[],
  unresolved: CrossSaveUnresolved | null,
): CrossSaveSynthesis["overview"] {
  const themeCount = themes.length;
  const headline = mode === "this_week"
    ? themeCount > 0
      ? `${savedSourceCount} ${plural(savedSourceCount, "save")} became ${themeCount} connected ${plural(themeCount, "theme")}.`
      : `${savedSourceCount} new ${plural(savedSourceCount, "save")} added to your library.`
    : themeCount > 0
      ? `${themeCount} connected ${plural(themeCount, "theme")} are taking shape.`
      : "Your library is ready for its first meaningful pattern.";
  const details: string[] = [];
  if (newResourceCount > 0) details.push(`${newResourceCount} new ${plural(newResourceCount, "guide")} ${newResourceCount === 1 ? "is" : "are"} ready`);
  if (changedResourceCount > 0) details.push(`${changedResourceCount} existing ${plural(changedResourceCount, "guide")} gained new detail`);
  if (unresolved) details.push("one important point still needs a closer look");
  if (!details.length && themes.length) details.push(`The clearest thread is ${themes[0].title.toLocaleLowerCase()}`);
  return {
    savedSourceCount,
    newResourceCount,
    changedResourceCount,
    librarySourceCount,
    headline,
    detail: details.length ? `${details.join("; ")}.` : "Keep saving; Curio will connect ideas when the evidence is strong enough.",
  };
}

export function buildCrossSaveSynthesis({
  items,
  resources,
  context = null,
  now = new Date(),
}: SynthesisInput): CrossSaveSynthesis {
  const endAt = now.getTime();
  const startAt = endAt - WEEK_IN_MS;
  const eligibleRecentItems = items.filter((item) => item.card && inWindow(item.createdAt, startAt, endAt));
  const recentItemIds = new Set(eligibleRecentItems.map((item) => item.id));
  const recentResources = resources.filter((resource) => resource.sourceItemIds.some((id) => recentItemIds.has(id))
    || resource.contributions.some((contribution) => inWindow(contribution.createdAt, startAt, endAt)));
  const mode = eligibleRecentItems.length > 0 ? "this_week" : "library";
  const synthesisResources = mode === "this_week" ? recentResources : resources;
  const allThemes = buildThemes(synthesisResources, context);
  const themes = allThemes.slice(0, 3);
  const interests = buildInterests(synthesisResources, allThemes);
  const librarySourceCount = new Set(resources.flatMap((resource) => resource.sourceItemIds)).size;

  const usedResourceIds = new Set<string>();
  const unresolvedCandidate = unresolvedCandidates(synthesisResources, now)[0] ?? null;
  const unresolved: CrossSaveUnresolved | null = unresolvedCandidate ? {
    resourceId: unresolvedCandidate.resource.id,
    title: unresolvedCandidate.resource.title,
    heading: unresolvedCandidate.entry.heading,
    claim: compact(unresolvedCandidate.entry.detail),
    reason: unresolvedCandidate.reason,
    kind: unresolvedCandidate.kind,
  } : null;
  if (unresolvedCandidate) usedResourceIds.add(unresolvedCandidate.resource.id);

  const repeatedCandidate = chooseUnused(repeatedCandidates(synthesisResources), usedResourceIds);
  const repeated: CrossSaveRepeated | null = repeatedCandidate ? {
    resourceId: repeatedCandidate.resource.id,
    title: repeatedCandidate.resource.title,
    heading: repeatedCandidate.entry.heading,
    point: compact(repeatedCandidate.entry.detail),
    supportCount: repeatedCandidate.entry.sourceItemIds.length,
  } : null;
  if (repeatedCandidate) usedResourceIds.add(repeatedCandidate.resource.id);

  const changedCandidate = chooseUnused(changeCandidates(synthesisResources, startAt, endAt), usedResourceIds);
  const changed: CrossSaveChange | null = changedCandidate ? {
    resourceId: changedCandidate.resource.id,
    title: changedCandidate.resource.title,
    kind: changedCandidate.contribution.disposition,
    label: changeLabel(changedCandidate.contribution.disposition),
    summary: compact(changedCandidate.contribution.summary),
    occurredAt: changedCandidate.contribution.createdAt,
  } : null;
  if (changedCandidate) usedResourceIds.add(changedCandidate.resource.id);

  const nextUseCandidate = chooseUnused(nextUseCandidates(synthesisResources, context), usedResourceIds);
  const nextUseCopyValue = nextUseCandidate ? nextUseCopy(nextUseCandidate.intent) : null;
  const nextUse: CrossSaveNextUse | null = nextUseCandidate && nextUseCopyValue ? {
    resourceId: nextUseCandidate.resource.id,
    title: nextUseCandidate.resource.title,
    intent: nextUseCandidate.intent,
    label: nextUseCopyValue.label,
    heading: nextUseCandidate.entry.heading,
    point: compact(nextUseCandidate.entry.detail),
    reason: nextUseCopyValue.reason,
  } : null;
  if (nextUseCandidate) usedResourceIds.add(nextUseCandidate.resource.id);

  const rememberCandidate = chooseUnused(
    entryCandidates(synthesisResources, context)
      .filter(({ resource, entry }) => (resource.intent === "understand" || resource.intent === "reference")
        && !["corrected", "not_verified"].includes(entry.research?.verdict ?? ""))
      .sort((left, right) => right.score - left.score || right.resource.updatedAt.localeCompare(left.resource.updatedAt)),
    usedResourceIds,
  ) ?? (usedResourceIds.size === 0 ? entryCandidates(synthesisResources, context).sort((left, right) => right.score - left.score)[0] ?? null : null);
  const remember: CrossSaveRemember | null = rememberCandidate ? {
    resourceId: rememberCandidate.resource.id,
    title: rememberCandidate.resource.title,
    heading: rememberCandidate.entry.heading,
    point: compact(rememberCandidate.entry.detail),
    reason: rememberCandidate.entry.sourceItemIds.length >= 2
      ? `This point appeared across ${rememberCandidate.entry.sourceItemIds.length} saves.`
      : rememberCandidate.entry.research?.verdict === "confirmed"
        ? "Independent research supports this point."
        : rememberCandidate.entry.research?.verdict === "supported_with_context"
          ? "Research supports this with useful context."
          : "A useful point to keep handy.",
  } : null;

  const newResourceCount = recentResources.filter((resource) => {
    const firstContribution = [...resource.contributions].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
    return Boolean(firstContribution && firstContribution.disposition === "created" && inWindow(firstContribution.createdAt, startAt, endAt));
  }).length;
  const changedResourceCount = recentResources.filter((resource) => {
    const firstContribution = [...resource.contributions].sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
    const wasCreatedThisWeek = Boolean(firstContribution && firstContribution.disposition === "created" && inWindow(firstContribution.createdAt, startAt, endAt));
    return !wasCreatedThisWeek && resource.contributions.some((contribution) => contribution.disposition !== "created" && inWindow(contribution.createdAt, startAt, endAt));
  }).length;
  const overview = buildOverview(mode, eligibleRecentItems.length, librarySourceCount, newResourceCount, changedResourceCount, themes, unresolved);
  const fallbackResourceIds = [...resources]
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
    .slice(0, 4)
    .map((resource) => resource.id);

  return {
    generatedAt: now.toISOString(),
    engineVersion: CROSS_SAVE_SYNTHESIS_VERSION,
    period: {
      mode,
      label: mode === "this_week" ? "This week" : "Across your library",
      startAt: new Date(startAt).toISOString(),
      endAt: now.toISOString(),
    },
    overview,
    themes,
    interests,
    nextUse,
    remember,
    changed,
    repeated,
    unresolved,
    fallbackResourceIds,
  };
}
