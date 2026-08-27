import { describe, expect, it } from "vitest";
import { learningCardSchema, learningItemSchema } from "@/lib/domain";

const validCard = {
  title: "Document decisions while context is fresh",
  primaryTopic: "career",
  secondaryTopics: ["communication"],
  contentType: "framework" as const,
  summary: "A lightweight practice for retaining outcomes.",
  keyTakeaways: ["Write down the decision and result."],
  relevanceReason: "It can support review and mentoring examples.",
  suggestedAction: "Capture one decision today.",
  claimsToVerify: [],
};

describe("Learning Card schema", () => {
  it("accepts the structured V0.1 card", () => {
    expect(learningCardSchema.parse(validCard)).toEqual({
      ...validCard,
      domain: "general",
      presentationType: "explainer",
      notes: [],
      researchBrief: null,
      personalization: null,
    });
  });

  it("rejects unknown content types and arbitrary fields", () => {
    expect(() => learningCardSchema.parse({ ...validCard, contentType: "viral_hook" })).toThrow();
    expect(() => learningCardSchema.parse({ ...validCard, inventedConfidence: 0.99 })).toThrow();
  });

  it("stores explicit content organization while defaulting legacy cards safely", () => {
    const structured = learningCardSchema.parse({
      ...validCard,
      domain: "finance",
      presentationType: "named_list",
    });
    expect(structured.domain).toBe("finance");
    expect(structured.presentationType).toBe("named_list");
    expect(() => learningCardSchema.parse({ ...validCard, presentationType: "social_post" })).toThrow();
  });

  it("keeps older research briefs compatible by defaulting their mode", () => {
    const parsed = learningCardSchema.parse({
      ...validCard,
      researchBrief: {
        overview: "The source claim was checked.",
        findings: [{
          topic: "Source claim",
          verdict: "confirmed",
          explanation: "An authoritative source supports it.",
          correction: null,
          sources: [{ title: "Official guide", publisher: "Agency", url: "https://example.gov/guide" }],
        }],
        researchedAt: "2026-08-18T12:00:00.000Z",
        model: "test-model",
        promptVersion: "legacy-research-prompt",
      },
    });

    expect(parsed.researchBrief?.mode).toBe("source_validation");
  });

  it("requires the analysis input receipt on every stored item", () => {
    expect(() => learningItemSchema.parse({ id: crypto.randomUUID(), card: validCard })).toThrow();
  });
});
