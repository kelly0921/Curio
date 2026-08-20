import {
  knowledgeResourceSchema,
  resourceDeepDiveSchema,
  type KnowledgeResource,
  type KnowledgeResourceEntry,
  type ResourceDeepDive,
  type ResourceDeepDiveKind,
} from "../domain";
import type { KnowledgeResourceEntryDeepDiver } from "../ai/services";
import type { CurioRepository } from "../data/repository";

export interface ResourceEntryDeepDiveResult {
  resource: KnowledgeResource;
  deepDive: ResourceDeepDive;
  generated: boolean;
}

function questionSubject(entry: KnowledgeResourceEntry): string {
  const subject = entry.heading?.trim() || entry.detail.trim();
  return subject.length > 180 ? `${subject.slice(0, 177).trimEnd()}…` : subject;
}

export function resourceEntryDeepDiveQuestion(
  entry: KnowledgeResourceEntry,
  kind: ResourceDeepDiveKind,
): string {
  const subject = questionSubject(entry);
  if (kind === "how_it_works") return `How does ${subject} actually work?`;
  if (kind === "practical_example") return `What is a concrete, realistic example of ${subject}?`;
  if (kind === "limits_and_risks") return `What important limits, risks, or exceptions apply to ${subject}?`;
  return `What evidence or changes should someone watch to know whether ${subject} remains useful or true?`;
}

export async function deepenKnowledgeResourceEntry(
  profileId: string,
  resourceId: string,
  entryId: string,
  kind: ResourceDeepDiveKind,
  repository: CurioRepository,
  deepDiver: KnowledgeResourceEntryDeepDiver,
  options: {
    id?: () => string;
    now?: () => string;
    refresh?: boolean;
  } = {},
): Promise<ResourceEntryDeepDiveResult | null> {
  const resource = await repository.findResourceById(profileId, resourceId);
  if (!resource) return null;
  const entry = resource.entries.find((candidate) => candidate.id === entryId);
  if (!entry) throw new Error("RESOURCE_ENTRY_NOT_FOUND");
  if (entry.status === "superseded") throw new Error("RESOURCE_ENTRY_SUPERSEDED");

  const existing = entry.deepDives.find((deepDive) => deepDive.kind === kind);
  if (existing && !options.refresh) return { resource, deepDive: existing, generated: false };

  const now = options.now ?? (() => new Date().toISOString());
  const id = options.id ?? (() => crypto.randomUUID());
  const question = resourceEntryDeepDiveQuestion(entry, kind);
  const researched = await deepDiver.deepDive({ entry, kind, question });
  const deepDive = resourceDeepDiveSchema.parse({
    id: existing?.id ?? id(),
    kind,
    question,
    answer: researched.answer,
    sources: researched.sources,
    researchedAt: now(),
    model: researched.model,
    promptVersion: researched.promptVersion,
  });
  const entries = resource.entries.map((candidate) => candidate.id === entry.id ? {
    ...candidate,
    deepDives: [...candidate.deepDives.filter((saved) => saved.kind !== kind), deepDive],
  } : candidate);
  const saved = await repository.saveResource(knowledgeResourceSchema.parse({
    ...resource,
    entries,
    version: resource.version + 1,
    updatedAt: deepDive.researchedAt,
  }));
  return { resource: saved, deepDive, generated: true };
}
