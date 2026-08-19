import { describe, expect, it } from "vitest";
import {
  knowledgeResourceSchema,
  learningItemSchema,
  type KnowledgeResource,
  type KnowledgeResourceEntry,
  type LearningItem,
} from "@/lib/domain";
import { searchKnowledge } from "@/lib/knowledge/retrieval";

const profileId = "00000000-0000-4000-8000-000000000031";
const timestamp = "2026-08-18T12:00:00.000Z";

function resource(input: {
  id: string;
  sourceId: string;
  title: string;
  canonicalTopic: string;
  summary: string;
  domain?: KnowledgeResource["domain"];
  resourceType?: KnowledgeResource["resourceType"];
  intent?: KnowledgeResource["intent"];
  entries: Array<Partial<KnowledgeResourceEntry> & Pick<KnowledgeResourceEntry, "id" | "detail">>;
}): KnowledgeResource {
  const entries = input.entries.map((entry) => ({
    kind: "insight" as const,
    heading: null,
    sourceItemIds: [input.sourceId],
    research: null,
    researchedAt: null,
    status: "active" as const,
    relatedEntryIds: [],
    deepDives: [],
    ...entry,
  }));
  return knowledgeResourceSchema.parse({
    id: input.id,
    profileId,
    resourceType: input.resourceType ?? "guide",
    domain: input.domain ?? "finance",
    intent: input.intent ?? "understand",
    canonicalTopic: input.canonicalTopic,
    title: input.title,
    summary: input.summary,
    entities: [input.canonicalTopic],
    entries,
    sourceItemIds: [input.sourceId],
    contributions: [{
      sourceItemId: input.sourceId,
      disposition: "created",
      addedEntryIds: entries.map((entry) => entry.id),
      supportedEntryIds: [],
      summary: "Created this guide.",
      createdAt: timestamp,
    }],
    lastResearchedAt: null,
    version: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

function item(input: { id: string; title: string; transcript?: string | null }): LearningItem {
  return learningItemSchema.parse({
    id: input.id,
    profileId,
    sourceType: "external_url",
    sourceUrl: `https://example.com/${input.id}`,
    platform: "instagram",
    creator: "@creator",
    sourceCaption: null,
    transcript: input.transcript ?? null,
    extractedVisualText: null,
    uploadedMediaReference: null,
    sourceFingerprint: `fingerprint-${input.id}`,
    accessLevel: "full",
    processingStatus: "ready",
    intent: "remember",
    sourceMaterials: [],
    card: {
      title: input.title,
      primaryTopic: input.title,
      secondaryTopics: [],
      domain: "general",
      presentationType: "explainer",
      contentType: "factual_information",
      summary: `Notes about ${input.title}.`,
      keyTakeaways: [`A useful point about ${input.title}.`],
      relevanceReason: "Useful later.",
      suggestedAction: "Review it.",
      claimsToVerify: [],
      notes: [],
      researchBrief: null,
      personalization: null,
    },
    analysisMode: "live_openai",
    analysisModel: "test",
    analysisPromptVersion: "test-v1",
    sourceRetrievalVersion: null,
    transcriptionModel: null,
    issues: [],
    createdAt: timestamp,
    updatedAt: timestamp,
  });
}

describe("knowledge retrieval", () => {
  it("answers a remembered-meaning query with the best living resource", () => {
    const hsaSourceId = "10000000-0000-4000-8000-000000000101";
    const bankingSourceId = "10000000-0000-4000-8000-000000000102";
    const hsa = resource({
      id: "20000000-0000-4000-8000-000000000101",
      sourceId: hsaSourceId,
      title: "How to use an HSA",
      canonicalTopic: "health savings account",
      summary: "An HSA can combine qualified medical spending with long-term tax-advantaged investing.",
      entries: [
        { id: "30000000-0000-4000-8000-000000000101", heading: "Invest for later", detail: "Eligible balances can remain invested for future qualified medical expenses." },
        { id: "30000000-0000-4000-8000-000000000102", heading: "Keep receipts", detail: "Retain records for qualified expenses and later reimbursement." },
      ],
    });
    const infiniteBanking = resource({
      id: "20000000-0000-4000-8000-000000000102",
      sourceId: bankingSourceId,
      title: "Infinite banking basics and limits",
      canonicalTopic: "infinite banking",
      summary: "A strategy involving cash-value life insurance, borrowing, fees, and liquidity tradeoffs.",
      entries: [{ id: "30000000-0000-4000-8000-000000000103", heading: "Policy loans", detail: "Borrowing depends on policy value and contract terms." }],
    });
    const weakOverlap = resource({
      id: "20000000-0000-4000-8000-000000000103",
      sourceId: "10000000-0000-4000-8000-000000000103",
      title: "AI tools",
      canonicalTopic: "AI tools",
      summary: "A watchlist for semiconductor companies.",
      entries: [{ id: "30000000-0000-4000-8000-000000000104", detail: "Track company fundamentals." }],
    });

    const result = searchKnowledge({
      query: "How can I invest with an HSA?",
      resources: [infiniteBanking, weakOverlap, hsa],
      items: [
        item({ id: hsaSourceId, title: "HSA benefits" }),
        item({ id: bankingSourceId, title: "Infinite banking" }),
        item({ id: weakOverlap.sourceItemIds[0], title: "AI career ideas", transcript: "AI investing can affect career demand." }),
      ],
    });

    expect(result.answer?.resourceId).toBe(hsa.id);
    expect(result.answer?.title).toBe("How to use an HSA");
    expect(result.answer?.points[0].heading).toBe("Invest for later");
    expect(result.answer?.points).toHaveLength(2);
    expect(result.results).toHaveLength(1);
  });

  it("uses original source text to retrieve the resource when the remembered phrase is not in its title", () => {
    const sourceId = "10000000-0000-4000-8000-000000000111";
    const japan = resource({
      id: "20000000-0000-4000-8000-000000000111",
      sourceId,
      title: "Five Japan trip upgrades",
      canonicalTopic: "Japan travel preparation",
      summary: "Practical packing, transit, and app tips for Japan.",
      domain: "travel",
      entries: [{ id: "30000000-0000-4000-8000-000000000111", heading: "Transit card", detail: "Set up a transit card before arrival." }],
    });
    const source = item({
      id: sourceId,
      title: "Japan tips",
      transcript: "For a physical Suica, use a retractable card holder so it stays easy to reach.",
    });

    const result = searchKnowledge({ query: "retractable card holder", resources: [japan], items: [source] });

    expect(result.answer?.resourceId).toBe(japan.id);
    expect(result.results[0].matchedOn).toContain("Japan tips");
  });

  it("groups useful points from more than one living resource without repeating source cards", () => {
    const transit = resource({
      id: "20000000-0000-4000-8000-000000000141",
      sourceId: "10000000-0000-4000-8000-000000000141",
      title: "Japan transit planning",
      canonicalTopic: "Japan travel transit",
      summary: "Practical transit setup for a Japan trip.",
      domain: "travel",
      entries: [{ id: "30000000-0000-4000-8000-000000000141", heading: "Set up a transit card", detail: "Confirm phone compatibility before relying on a mobile transit card." }],
    });
    const food = resource({
      id: "20000000-0000-4000-8000-000000000142",
      sourceId: "10000000-0000-4000-8000-000000000142",
      title: "Japan food stops",
      canonicalTopic: "Japan travel food",
      summary: "Convenient food ideas for a Japan trip.",
      domain: "travel",
      entries: [{ id: "30000000-0000-4000-8000-000000000142", heading: "Convenience-store recovery", detail: "Use a nearby combini for drinks and a quick breakfast on early travel days." }],
    });

    const result = searchKnowledge({ query: "What Japan travel tips did I save?", resources: [transit, food], items: [] });

    expect(result.answer?.resourceCount).toBe(2);
    expect(result.answer?.mode).toBe("library_synthesis");
    expect(result.answer?.points.map((point) => point.resourceId)).toEqual(expect.arrayContaining([transit.id, food.id]));
    expect(result.answer?.sourceCount).toBe(2);
    expect(result.results).toHaveLength(2);
  });

  it("prefers actionable finance watchlists over incidental investing mentions for an ideas query", () => {
    const watchlist = resource({
      id: "20000000-0000-4000-8000-000000000161",
      sourceId: "10000000-0000-4000-8000-000000000161",
      title: "Optical transceiver investment ideas",
      canonicalTopic: "optical transceiver beneficiaries",
      summary: "Companies to monitor around optical-network demand.",
      resourceType: "watchlist",
      intent: "track",
      entries: [{ id: "30000000-0000-4000-8000-000000000161", detail: "Track named suppliers and the demand evidence behind each thesis." }],
    });
    const career = resource({
      id: "20000000-0000-4000-8000-000000000162",
      sourceId: "10000000-0000-4000-8000-000000000162",
      title: "Investment careers and leverage",
      canonicalTopic: "investment career ideas",
      summary: "Career paths connected to capital and revenue leverage.",
      domain: "career",
      entries: [{ id: "30000000-0000-4000-8000-000000000162", detail: "Some investment roles tie compensation to capital allocation." }],
    });
    const glossary = resource({
      id: "20000000-0000-4000-8000-000000000163",
      sourceId: "10000000-0000-4000-8000-000000000163",
      title: "Investment terms",
      canonicalTopic: "investment vocabulary",
      summary: "Plain-language definitions.",
      resourceType: "glossary",
      entries: [{ id: "30000000-0000-4000-8000-000000000163", detail: "Liquidity describes how easily an investment can be sold." }],
    });

    const result = searchKnowledge({ query: "What investment ideas did I save?", resources: [career, glossary, watchlist], items: [] });

    expect(result.results[0].resource.id).toBe(watchlist.id);
    expect(result.results.map((hit) => hit.resource.id)).not.toContain(glossary.id);
    expect(result.answer?.points).toHaveLength(1);
    expect(result.answer?.points[0].resourceId).toBe(watchlist.id);
  });

  it("retrieves details from a saved deep dive, not only the short entry", () => {
    const hsa = resource({
      id: "20000000-0000-4000-8000-000000000151",
      sourceId: "10000000-0000-4000-8000-000000000151",
      title: "HSA reimbursement notes",
      canonicalTopic: "health savings account",
      summary: "How reimbursements work after qualified expenses.",
      entries: [{
        id: "30000000-0000-4000-8000-000000000151",
        heading: "Save receipts",
        detail: "Keep documentation for qualified medical expenses.",
        deepDives: [{
          id: "40000000-0000-4000-8000-000000000151",
          kind: "how_it_works",
          question: "Is there a reimbursement deadline?",
          answer: "Federal rules do not impose a fixed reimbursement deadline if the expense was qualified and incurred after the HSA was established.",
          sources: [],
          researchedAt: timestamp,
          model: "test",
          promptVersion: "test-v1",
        }],
      }],
    });

    const result = searchKnowledge({ query: "HSA reimbursement deadline", resources: [hsa], items: [] });

    expect(result.answer?.points[0].detail).toContain("do not impose a fixed reimbursement deadline");
    expect(result.results[0].matchedEntryIds).toContain(hsa.entries[0].id);
  });

  it("searches research corrections and excludes superseded points from the answer", () => {
    const sourceId = "10000000-0000-4000-8000-000000000121";
    const japan = resource({
      id: "20000000-0000-4000-8000-000000000121",
      sourceId,
      title: "Japan transit setup",
      canonicalTopic: "Japan transit cards",
      summary: "Current notes for using transit cards in Japan.",
      domain: "travel",
      entries: [
        { id: "30000000-0000-4000-8000-000000000121", heading: "Earlier advice", detail: "Pasmo always works the same as Suica.", status: "superseded" },
        {
          id: "30000000-0000-4000-8000-000000000122",
          heading: "Current advice",
          detail: "Verify device and card support before relying on a mobile transit card.",
          research: {
            topic: "Mobile Pasmo support",
            verdict: "corrected",
            explanation: "Support differs by device and setup.",
            correction: "Pasmo was not verified for every device in the saved source.",
            sources: [],
          },
        },
      ],
    });

    const result = searchKnowledge({ query: "Was Pasmo verified?", resources: [japan], items: [] });

    expect(result.answer?.resourceId).toBe(japan.id);
    expect(result.answer?.points.map((point) => point.heading)).toEqual(["Current advice"]);
    expect(result.answer?.points[0].detail).toBe("Pasmo was not verified for every device in the saved source.");
    expect(result.answer?.points[0].evidence).toBe("Corrected by Curio");
  });

  it("supports domain filtering and returns no forced answer for an empty query", () => {
    const sourceId = "10000000-0000-4000-8000-000000000131";
    const finance = resource({
      id: "20000000-0000-4000-8000-000000000131",
      sourceId,
      title: "Portfolio risk",
      canonicalTopic: "portfolio risk",
      summary: "Notes about investment concentration.",
      entries: [{ id: "30000000-0000-4000-8000-000000000131", detail: "Concentration can increase downside risk." }],
    });
    const result = searchKnowledge({ query: "portfolio risk", resources: [finance], items: [], domain: "travel" });
    const empty = searchKnowledge({ query: "what did I save?", resources: [finance], items: [] });

    expect(result.results).toEqual([]);
    expect(result.answer).toBeNull();
    expect(empty.results).toEqual([]);
    expect(empty.answer).toBeNull();
  });
});
