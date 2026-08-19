import type {
  ContextDomain,
  ContextSnapshot,
  KnowledgeResource,
  KnowledgeResourceEntry,
  LearningItem,
  ResourceContribution,
} from "../domain";
import { assessKnowledgeResourceFreshness } from "./freshness";

export const CROSS_SAVE_SYNTHESIS_VERSION = "cross-save-synthesis-v1" as const;

const WEEK_IN_MS = 7 * 24 * 60 * 60 * 1_000;

const THEME_TITLES: Record<ContextDomain, string> = {
  finance: "Money decisions taking shape",
  travel: "A trip is taking shape",
  food: "Places and dishes to come back to",
  ai_work: "AI workflows worth combining",
  career: "Career moves reinforcing each other",
  health: "Health guidance worth weighing",
  home: "Ideas for how you want to live",
  relationships: "Patterns for stronger relationships",
  general: "Ideas starting to connect",
};

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

export interface CrossSaveRemember {
  resourceId: string;
  title: string;
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

function joinTitles(titles: string[]): string {
  if (titles.length === 1) return titles[0];
  if (titles.length === 2) return `${titles[0]} and ${titles[1]}`;
  return `${titles.slice(0, -1).join(", ")}, and ${titles.at(-1)}`;
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

function buildThemes(
  resources: KnowledgeResource[],
  context?: ContextSnapshot | null,
): CrossSaveTheme[] {
  const groups = new Map<ContextDomain, KnowledgeResource[]>();
  resources.forEach((resource) => groups.set(resource.domain, [...(groups.get(resource.domain) ?? []), resource]));
  return [...groups.entries()].flatMap(([domain, groupedResources]): CrossSaveTheme[] => {
    const sourceIds = new Set(groupedResources.flatMap((resource) => resource.sourceItemIds));
    if (sourceIds.size < 2) return [];
    const sortedResources = [...groupedResources].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    const resourceTitles = sortedResources.slice(0, 3).map((resource) => resource.title);
    const description = sortedResources.length === 1
      ? `${resourceTitles[0]} now brings ${sourceIds.size} saves together in one place.`
      : domain === "finance"
        ? `Compare ${joinTitles(resourceTitles.slice(0, 2))} in one place before making a money decision.`
        : domain === "career"
          ? `See how ${joinTitles(resourceTitles.slice(0, 2))} relate to opportunity and career leverage.`
          : domain === "travel"
            ? `Turn ${joinTitles(resourceTitles.slice(0, 2))} into one trip-planning reference.`
            : domain === "ai_work"
              ? `Combine ${joinTitles(resourceTitles.slice(0, 2))} into a workflow you can reuse.`
              : `Review ${joinTitles(resourceTitles.slice(0, 2))} together instead of as isolated saves.`;
    return [{
      id: `theme-${domain}`,
      domain,
      title: THEME_TITLES[domain],
      description: compact(description),
      resourceIds: sortedResources.map((resource) => resource.id),
      resourceTitles,
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
  }).slice(0, 3);
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
  const themes = buildThemes(synthesisResources, context);
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

  const rememberCandidate = chooseUnused(
    entryCandidates(synthesisResources, context)
      .filter(({ entry }) => !["corrected", "not_verified"].includes(entry.research?.verdict ?? ""))
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
    remember,
    changed,
    repeated,
    unresolved,
    fallbackResourceIds,
  };
}
