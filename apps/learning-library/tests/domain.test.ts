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
      notes: [],
      researchBrief: null,
      personalization: null,
    });
  });

  it("rejects unknown content types and arbitrary fields", () => {
    expect(() => learningCardSchema.parse({ ...validCard, contentType: "viral_hook" })).toThrow();
    expect(() => learningCardSchema.parse({ ...validCard, inventedConfidence: 0.99 })).toThrow();
  });

  it("requires the analysis input receipt on every stored item", () => {
    expect(() => learningItemSchema.parse({ id: crypto.randomUUID(), card: validCard })).toThrow();
  });
});
