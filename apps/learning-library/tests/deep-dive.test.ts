import { describe, expect, it } from "vitest";
import type { KnowledgeResourceEntryDeepDiver } from "@/lib/ai/services";
import { MemoryLearningItemRepository } from "@/lib/data/memory-repository";
import { knowledgeResourceSchema } from "@/lib/domain";
import { deepenKnowledgeResourceEntry, resourceEntryDeepDiveQuestion } from "@/lib/knowledge/deep-dive";

const resourceId = "10000000-0000-4000-8000-000000000801";
const entryId = "20000000-0000-4000-8000-000000000801";
const sourceItemId = "30000000-0000-4000-8000-000000000801";
const profileId = "00000000-0000-4000-8000-000000000031";

function resource() {
  return knowledgeResourceSchema.parse({
    id: resourceId,
    profileId,
    resourceType: "glossary",
    domain: "finance",
    intent: "understand",
    canonicalTopic: "stock splits",
    title: "Stock splits in plain English",
    summary: "A short explanation of stock splits.",
    entities: ["stock split"],
    entries: [{
      id: entryId,
      kind: "term",
      heading: "Stock split",
      detail: "One share becomes multiple cheaper shares while total value stays the same.",
      sourceItemIds: [sourceItemId],
      research: {
        topic: "Stock split",
        verdict: "confirmed",
        explanation: "A split changes share count and per-share price proportionally.",
        correction: null,
        sources: [{ title: "Investor bulletin", publisher: "SEC", url: "https://www.sec.gov/example" }],
      },
      researchedAt: "2026-08-18T12:00:00.000Z",
    }],
    sourceItemIds: [sourceItemId],
    contributions: [{
      sourceItemId,
      disposition: "created",
      addedEntryIds: [entryId],
      supportedEntryIds: [],
      summary: "Created this glossary with 1 term.",
      createdAt: "2026-08-18T12:00:00.000Z",
    }],
    lastResearchedAt: "2026-08-18T12:00:00.000Z",
    version: 1,
    createdAt: "2026-08-18T12:00:00.000Z",
    updatedAt: "2026-08-18T12:00:00.000Z",
  });
}

describe("resource entry deep dives", () => {
  it("persists a researched answer once and reuses it on the next tap", async () => {
    const repository = new MemoryLearningItemRepository();
    await repository.saveResource(resource());
    let calls = 0;
    const deepDiver: KnowledgeResourceEntryDeepDiver = {
      async deepDive(input) {
        calls += 1;
        expect(input.question).toBe("How does Stock split actually work?");
        return {
          answer: "A 2-for-1 split doubles the share count and halves the per-share price, leaving the position value unchanged at the split moment.",
          sources: [{ title: "Stock split guide", publisher: "SEC", url: "https://www.sec.gov/stock-splits" }],
          model: "test-research-model",
          promptVersion: "test-deep-dive-v1",
        };
      },
    };

    const first = await deepenKnowledgeResourceEntry(profileId, resourceId, entryId, "how_it_works", repository, deepDiver, {
      id: () => "40000000-0000-4000-8000-000000000801",
      now: () => "2026-08-19T12:00:00.000Z",
    });
    const second = await deepenKnowledgeResourceEntry(profileId, resourceId, entryId, "how_it_works", repository, deepDiver);

    expect(first?.generated).toBe(true);
    expect(first?.resource.version).toBe(2);
    expect(first?.resource.entries[0].deepDives).toEqual([first?.deepDive]);
    expect(second?.generated).toBe(false);
    expect(second?.deepDive.id).toBe(first?.deepDive.id);
    expect(calls).toBe(1);
  });

  it("builds bounded, point-specific questions and rejects missing entries", async () => {
    const saved = resource();
    expect(resourceEntryDeepDiveQuestion(saved.entries[0], "practical_example"))
      .toBe("What is a concrete, realistic example of Stock split?");
    expect(resourceEntryDeepDiveQuestion(saved.entries[0], "limits_and_risks"))
      .toBe("What important limits, risks, or exceptions apply to Stock split?");

    const repository = new MemoryLearningItemRepository();
    await repository.saveResource(saved);
    await expect(deepenKnowledgeResourceEntry(
      profileId,
      resourceId,
      "20000000-0000-4000-8000-000000000899",
      "how_it_works",
      repository,
      { async deepDive() { throw new Error("should not run"); } },
    )).rejects.toThrow("RESOURCE_ENTRY_NOT_FOUND");
  });
});
