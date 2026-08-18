import { describe, expect, it } from "vitest";
import {
  buildLearningCardPrompt,
  detectNamedTakeawayTargets,
  detectPromisedListCount,
  detectSupplementResearchAngles,
  LEARNING_CARD_RESEARCH_SYSTEM_PROMPT,
  LEARNING_CARD_SYSTEM_PROMPT,
  researchSourceMatchesNamedTarget,
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

  it("makes full Reel evidence primary and keeps the caption secondary", () => {
    const prompt = buildLearningCardPrompt({
      accessLevel: "partial",
      sourceMaterials: [{
        kind: "caption",
        label: "Reel caption",
        text: "Caption headline",
        origin: "instagram_browser_caption",
        completeness: "complete_for_channel",
      }, {
        kind: "visible_text",
        label: "Timestamped Reel visuals",
        text: "[00:05] On-screen text: Tip one",
        origin: "instagram_browser_visual_analysis",
        completeness: "partial",
      }, {
        kind: "transcript",
        label: "Full Reel transcript",
        text: "Spoken tip one with details.",
        origin: "instagram_browser_transcription",
        completeness: "complete_for_channel",
      }],
    });

    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("PRIMARY SOURCE EVIDENCE");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("caption is supporting context only");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("proper nouns control their spelling and label");
    expect(LEARNING_CARD_RESEARCH_SYSTEM_PROMPT).toContain("full Reel transcript and timestamped visual evidence");
    expect(prompt).toContain('"canonicalVisibleLabels"');
    expect(prompt.indexOf("[00:05] On-screen text: Tip one")).toBeLessThan(prompt.indexOf("Spoken tip one with details."));
    expect(prompt.indexOf("Spoken tip one with details.")).toBeLessThan(prompt.indexOf("Caption headline"));
  });

  it("requires compact lesson-first writing without repetitive attribution", () => {
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("Lead with the lesson itself");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("Do not write filler attribution");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("summary: one sentence, at most 35 words");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("keyTakeaways: 1–5 distinct points");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("claimsToVerify: keep only the 3 highest-value");
  });

  it("routes cards by both subject domain and information structure", () => {
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("INFORMATION DESIGN ROUTER");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("domain by the knowledge the reader is saving");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("presentationType by the source's dominant information structure");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("finance domain");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("named_list in travel");
    expect(LEARNING_CARD_RESEARCH_SYSTEM_PROMPT).toContain("alignedFindingTargets");
    expect(LEARNING_CARD_RESEARCH_SYSTEM_PROMPT).toContain("instead of paraphrasing the source takeaway");
    expect(LEARNING_CARD_RESEARCH_SYSTEM_PROMPT).toContain("For travel, add the practical logistics");
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

  it("preserves unnumbered named subjects and aligns one research finding to each", () => {
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("Treat 2–5 distinct on-screen headings");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("Exact visible name — why the source included it");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("every primary company, ticker, security, asset, or industry thesis");
    expect(LEARNING_CARD_SYSTEM_PROMPT).toContain("historical examples, competitors, cited suppliers");
    expect(LEARNING_CARD_RESEARCH_SYSTEM_PROMPT).toContain("exactly one finding for every target");
    expect(LEARNING_CARD_RESEARCH_SYSTEM_PROMPT).toContain("the source's claimed thesis or catalyst");
    expect(LEARNING_CARD_RESEARCH_SYSTEM_PROMPT).toContain("Never attach another company's page");
    expect(detectNamedTakeawayTargets([
      "Coherent — Optical components connect it to AI data-center demand.",
      "Lumentum — High-speed optics are the source's stated catalyst.",
      "Verify the revenue exposure before treating either as a pure-play investment.",
    ])).toEqual(["Coherent", "Lumentum"]);
    expect(detectNamedTakeawayTargets([
      "Optical transceivers are the broad theme.",
      "Policy language is not an investment recommendation.",
    ])).toEqual([]);

    expect(detectPromisedListCount([{
      kind: "transcript",
      label: "Full Reel transcript",
      text: "These are three U.S. companies that stand to benefit: AOI, Lumentum, and Viavi.",
      origin: "instagram_browser_transcription",
      completeness: "complete_for_channel",
    }])).toBe(3);

    expect(researchSourceMatchesNamedTarget("AOI", {
      title: "Applied Optoelectronics 2025 Annual Report",
      publisher: "SEC",
      url: "https://www.sec.gov/example/ao-inc",
    })).toBe(true);
    expect(researchSourceMatchesNamedTarget("AOI", {
      title: "EML 200G PAM4 CWDM Laser",
      publisher: "Lumentum",
      url: "https://www.lumentum.com/en/products/eml-200g",
    })).toBe(false);
  });

  it("requires a useful independent supplement when a promised list is inaccessible", () => {
    expect(LEARNING_CARD_RESEARCH_SYSTEM_PROMPT).toContain("Use independent_supplement");
    expect(LEARNING_CARD_RESEARCH_SYSTEM_PROMPT).toContain("match the promised list count up to five");
    expect(LEARNING_CARD_RESEARCH_SYSTEM_PROMPT).toContain("return exactly that many findings up to five");
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

    expect(detectSupplementResearchAngles([{
      kind: "transcript",
      label: "Full Reel transcript",
      text: "Five Japan trip tips: use vacuum bags; add Suica; download apps; carry an overflow bag; buy a smoothie.",
      origin: "instagram_browser_transcription",
      completeness: "complete_for_channel",
    }])).toEqual([]);
  });
});
