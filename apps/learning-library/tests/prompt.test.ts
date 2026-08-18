import { describe, expect, it } from "vitest";
import {
  buildLearningCardPrompt,
  detectSupplementResearchAngles,
  LEARNING_CARD_RESEARCH_SYSTEM_PROMPT,
  LEARNING_CARD_SYSTEM_PROMPT,
} from "@/lib/ai/prompt";

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
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("keyTakeaways: 1–5 distinct points");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("claimsToVerify: keep only the 3 highest-value");
  });

  it("preserves finite lists without inventing missing entries or padded notes", () => {
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("Use one keyTakeaway per available list entry");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("the entries themselves are unavailable, do not invent them");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("notes: preserve 0–8 substantive source details");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("Never treat framing, a follow prompt");

    const prompt = buildLearningCardPrompt({
      accessLevel: "partial",
      sourceMaterials: [{
        kind: "caption",
        label: "Public caption",
        text: "𝟓 𝐓𝐢𝐩𝐬 to Level Up Your Japan Trip",
        origin: "instagram_public_embed_caption",
        completeness: "complete_for_channel",
      }],
    });
    expect(prompt).toContain('"promisedListCount": 5');
  });

  it("requires a useful independent supplement when a promised list is inaccessible", () => {
    expect(LEARNING_CARD_RESEARCH_SYSTEM_PROMPT).toContain("Use independent_supplement");
    expect(LEARNING_CARD_RESEARCH_SYSTEM_PROMPT).toContain("match the promised list count up to five");
    expect(LEARNING_CARD_RESEARCH_SYSTEM_PROMPT).toContain("not a reconstruction");
    expect(LEARNING_CARD_RESEARCH_SYSTEM_PROMPT).toContain("create exactly one finding for each angle");
    expect(LEARNING_CARD_RESEARCH_SYSTEM_PROMPT).toContain("Keep supplement findings mutually distinct");
    expect(LEARNING_CARD_RESEARCH_SYSTEM_PROMPT).toContain("use at most one finding primarily about trains");
    expect(LEARNING_CARD_RESEARCH_SYSTEM_PROMPT).toContain("payments, connectivity, reservations or crowd planning");
    expect(LEARNING_CARD_RESEARCH_SYSTEM_PROMPT).toContain("Ignore promotional calls to follow");

    expect(detectSupplementResearchAngles([{
      kind: "caption",
      label: "Public caption",
      text: "𝟓 𝐓𝐢𝐩𝐬 to Level Up Your Japan Trip",
      origin: "instagram_public_embed_caption",
      completeness: "complete_for_channel",
    }])).toEqual([
      "local transportation and getting around",
      "money, payments, and avoiding unnecessary costs",
      "mobile connectivity, navigation, and essential digital setup",
      "reservations, crowd planning, or luggage logistics",
      "local etiquette, safety, or disruption planning",
    ]);
  });
});
