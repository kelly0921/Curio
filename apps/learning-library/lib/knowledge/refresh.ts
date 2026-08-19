import { learningItemSchema, knowledgeResourceSchema, type KnowledgeResource, type ResearchFinding } from "../domain";
import type { LearningCardResearcher } from "../ai/services";
import type { CurioRepository } from "../data/repository";
import { upsertKnowledgeResourceForItem } from "./resources";
import { assessKnowledgeResourceFreshness, type ResourceFreshness } from "./freshness";

type ResearchVerdict = ResearchFinding["verdict"];

export interface ResourceResearchChange {
  entryId: string;
  heading: string | null;
  previousVerdict: ResearchVerdict | null;
  verdict: ResearchVerdict;
  note: string;
}

export interface ResourceResearchReceipt {
  checkedAt: string;
  checkedSourceCount: number;
  materialChangeCount: number;
  summary: string;
  changes: ResourceResearchChange[];
}

export interface ResourceResearchRefreshResult {
  resource: KnowledgeResource;
  freshness: ResourceFreshness;
  receipt: ResourceResearchReceipt;
}

function entryKey(entry: KnowledgeResource["entries"][number]): string {
  return `${entry.heading ?? ""} ${entry.detail}`.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, " ").trim();
}

function findingChanged(before: ResearchFinding | null, after: ResearchFinding): boolean {
  return !before
    || before.verdict !== after.verdict
    || before.correction !== after.correction
    || before.explanation !== after.explanation;
}

function changeNote(finding: ResearchFinding): string {
  if (finding.verdict === "corrected") return finding.correction ?? finding.explanation;
  if (finding.verdict === "supported_with_context") return finding.explanation;
  if (finding.verdict === "not_verified") return finding.explanation;
  if (finding.verdict === "confirmed") return "Current research still supports this point.";
  return "This remains a creator perspective rather than an externally verified claim.";
}

function receiptSummary(changes: ResourceResearchChange[], wasResearched: boolean): string {
  if (!changes.length) return "Research is current; no material changes were found.";
  const corrected = changes.filter((change) => change.verdict === "corrected").length;
  const contextualized = changes.filter((change) => change.verdict === "supported_with_context").length;
  const unresolved = changes.filter((change) => change.verdict === "not_verified").length;
  const confirmed = changes.filter((change) => change.verdict === "confirmed").length;
  const parts: string[] = [];
  if (corrected) parts.push(`${corrected} correction${corrected === 1 ? "" : "s"}`);
  if (contextualized) parts.push(`${contextualized} point${contextualized === 1 ? "" : "s"} gained context`);
  if (unresolved) parts.push(`${unresolved} point${unresolved === 1 ? " remains" : "s remain"} unverified`);
  if (confirmed) parts.push(`${confirmed} point${confirmed === 1 ? " was" : "s were"} confirmed`);
  return `${wasResearched ? "Research refreshed" : "Research added"}: ${parts.join("; ")}.`;
}

export async function refreshKnowledgeResourceResearch(
  resourceId: string,
  repository: CurioRepository,
  researcher: LearningCardResearcher,
  options: { now?: () => string } = {},
): Promise<ResourceResearchRefreshResult | null> {
  const now = options.now ?? (() => new Date().toISOString());
  const checkedAt = now();
  const before = await repository.findResourceById(resourceId);
  if (!before) return null;
  const allItems = await repository.list();
  const sources = allItems
    .filter((item) => before.sourceItemIds.includes(item.id) && item.card && item.sourceMaterials.length > 0)
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  if (!sources.length) throw new Error("NO_RESEARCHABLE_SOURCES");

  const refreshedResearch = [];
  for (const source of sources) {
    const card = source.card;
    if (!card) continue;
    refreshedResearch.push({
      source,
      research: await researcher.research({ card, sourceMaterials: source.sourceMaterials }),
    });
  }

  for (const { source, research } of refreshedResearch) {
    const card = source.card;
    if (!card) continue;
    const refreshedItem = learningItemSchema.parse({
      ...source,
      card: {
        ...card,
        researchBrief: {
          mode: research.mode,
          overview: research.overview,
          findings: research.findings,
          researchedAt: checkedAt,
          model: research.model,
          promptVersion: research.promptVersion,
        },
      },
      issues: source.issues.filter((issue) => !["RESEARCH_FAILED", "OPENAI_NOT_CONFIGURED"].includes(issue.code)),
      updatedAt: checkedAt,
    });
    await repository.save(refreshedItem);
    await upsertKnowledgeResourceForItem(refreshedItem, repository, { now: () => checkedAt });
  }

  const rebuilt = await repository.findResourceById(resourceId);
  if (!rebuilt) throw new Error("RESOURCE_REBUILD_FAILED");
  const beforeEntries = new Map(before.entries.map((entry) => [entryKey(entry), entry]));
  const changes = rebuilt.entries
    .filter((entry) => entry.status !== "superseded" && entry.research)
    .flatMap((entry): ResourceResearchChange[] => {
      const prior = beforeEntries.get(entryKey(entry))?.research ?? null;
      const research = entry.research;
      if (!research || !findingChanged(prior, research)) return [];
      return [{
        entryId: entry.id,
        heading: entry.heading,
        previousVerdict: prior?.verdict ?? null,
        verdict: research.verdict,
        note: changeNote(research),
      }];
    });
  const receipt: ResourceResearchReceipt = {
    checkedAt,
    checkedSourceCount: refreshedResearch.length,
    materialChangeCount: changes.length,
    summary: receiptSummary(changes, Boolean(before.lastResearchedAt)),
    changes: changes.slice(0, 8),
  };
  const contributions = [...rebuilt.contributions];
  const latestContribution = contributions.at(-1);
  if (latestContribution) contributions[contributions.length - 1] = { ...latestContribution, summary: receipt.summary };
  const resource = await repository.saveResource(knowledgeResourceSchema.parse({
    ...rebuilt,
    contributions,
    lastResearchedAt: checkedAt,
    updatedAt: checkedAt,
  }));
  return {
    resource,
    freshness: assessKnowledgeResourceFreshness(resource, new Date(checkedAt)),
    receipt,
  };
}
