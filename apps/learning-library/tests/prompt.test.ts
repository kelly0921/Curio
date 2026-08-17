import { describe, expect, it } from "vitest";
import { buildLearningCardPrompt, LEARNING_CARD_SYSTEM_PROMPT } from "@/lib/ai/prompt";

describe("Learning Card prompt boundary", () => {
  it("keeps source, user context, and interpretation explicitly separated", () => {
    const prompt = buildLearningCardPrompt({
      accessLevel: "partial",
      sourceMaterials: [{
        kind: "transcript",
        label: "Speech transcript",
        text: "Document the decision and the outcome.",
        origin: "openai_transcription",
        completeness: "complete_for_channel",
      }],
    });

    expect(prompt).toContain("SOURCE MATERIAL:");
    expect(prompt).toContain("USER CONTEXT:");
    expect(prompt).toContain("GENERATED INTERPRETATION:");
    expect(prompt).toContain("complete visual/video meaning may be missing");
    expect(prompt).toContain("Document the decision and the outcome.");
    expect(prompt).toContain("No personal context is supplied during source extraction");
  });

  it("forbids attributing personal context to the creator", () => {
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("Never attribute it to the creator");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("Never imply you watched a full video");
  });

  it("requires compact lesson-first writing without repetitive attribution", () => {
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("Lead with the lesson itself");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("Do not write filler attribution");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("summary: one sentence, at most 35 words");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("keyTakeaways: 2–3 distinct points");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("claimsToVerify: keep only the 3 highest-value");
  });
});
