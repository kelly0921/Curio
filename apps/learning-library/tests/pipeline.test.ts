import { describe, expect, it, vi } from "vitest";
import type { LearningCardAnalyzer, LearningCardResearcher, MediaTranscriber, PublicSourceRetriever } from "@/lib/ai/services";
import { MemoryLearningItemRepository } from "@/lib/data/memory-repository";
import type { IngestionInput, LearningCard } from "@/lib/domain";
import { LEARNING_CARD_PROMPT_VERSION } from "@/lib/ai/prompt";
import { processLearningItem, sourceFingerprint } from "@/lib/processing/pipeline";
import { PUBLIC_SOURCE_RETRIEVAL_VERSION } from "@/lib/retrieval/instagram-reel";
import type { SourceVisualStore } from "@/lib/media/source-visual-store";

const profileId = "00000000-0000-4000-8000-000000000031";

const card: LearningCard = {
  title: "A grounded card",
  primaryTopic: "career",
  secondaryTopics: ["communication"],
  domain: "career",
  presentationType: "explainer",
  contentType: "framework",
  summary: "A source-grounded summary.",
  keyTakeaways: ["Keep the evidence."],
  relevanceReason: "Useful for early-career reflection.",
  suggestedAction: "Write one note.",
  claimsToVerify: [],
  notes: [
    { type: "principle", title: "Keep evidence", detail: "Preserve the source material behind the learning." },
    { type: "tactic", title: "Write one note", detail: "Record one useful idea while the context is available." },
    { type: "claim", title: "Ground the summary", detail: "Every summary should remain traceable to source evidence." },
    { type: "example", title: "Retain provenance", detail: "Store the transcript or caption beside the card." },
  ],
  researchBrief: null,
  personalization: null,
};

function uploadInput(file: File): IngestionInput {
  return {
    sourceType: "uploaded_media",
    sourceUrl: null,
    creator: "@teacher",
    sourceCaption: null,
    extractedVisualText: null,
    intent: "remember",
    mediaFile: file,
  };
}

describe("Learning Item pipeline", () => {
  it("transcribes uploaded media, records provenance, and stays partial", async () => {
    const repository = new MemoryLearningItemRepository();
    const transcriber: MediaTranscriber = { transcribe: vi.fn().mockResolvedValue({ text: "Keep a small decision log.", model: "test-transcriber" }) };
    const analyzer: LearningCardAnalyzer = { analyze: vi.fn().mockResolvedValue({ card, mode: "live_openai", model: "test-analyzer", promptVersion: LEARNING_CARD_PROMPT_VERSION }) };
    const result = await processLearningItem(uploadInput(new File(["video"], "lesson.mp4", { type: "video/mp4" })), {
      profileId,
      repository,
      transcriber,
      analyzer,
    });

    expect(result.item.processingStatus).toBe("partial");
    expect(result.item.accessLevel).toBe("partial");
    expect(result.item.sourceMaterials).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "transcript", text: "Keep a small decision log.", origin: "openai_transcription" }),
    ]));
    expect(result.item.card?.title).toBe("A grounded card");
    expect(analyzer.analyze).toHaveBeenCalledWith(expect.objectContaining({ accessLevel: "partial" }));
  });

  it("stores a bare source URL as link-only without calling the analyzer", async () => {
    const analyzer: LearningCardAnalyzer = { analyze: vi.fn() };
    const result = await processLearningItem({
      sourceType: "external_url",
      sourceUrl: "https://www.youtube.com/watch?v=ABC123&utm_source=share",
      creator: null,
      sourceCaption: null,
      extractedVisualText: null,
      intent: "reference",
      mediaFile: null,
    }, {
      profileId,
      repository: new MemoryLearningItemRepository(),
      transcriber: null,
      analyzer,
    });

    expect(result.item.accessLevel).toBe("link_only");
    expect(result.item.card).toBeNull();
    expect(result.item.platform).toBe("youtube");
    expect(result.item.issues[0]?.code).toBe("LINK_ONLY");
    expect(analyzer.analyze).not.toHaveBeenCalled();
  });

  it("retrieves public source text before generating a card", async () => {
    const analyzer: LearningCardAnalyzer = { analyze: vi.fn().mockResolvedValue({ card, mode: "live_openai", model: "test-analyzer", promptVersion: LEARNING_CARD_PROMPT_VERSION }) };
    const retriever: PublicSourceRetriever = {
      retrieve: vi.fn().mockResolvedValue({
        materials: [{
          kind: "caption",
          label: "Exact public page text retrieved with OpenAI web search",
          text: "Write the decision, outcome, and lesson while the context is fresh.",
          origin: "openai_web_search",
          completeness: "partial",
        }],
        creator: "@public_teacher",
        model: "test-retriever",
        consultedUrls: ["https://www.instagram.com/reel/ABC123/"],
        sourceVisual: { timestampSeconds: 1.5, mimeType: "image/jpeg", base64: "aW1hZ2U=" },
      }),
    };
    const sourceVisualStore: SourceVisualStore = {
      put: vi.fn().mockResolvedValue({
        kind: "reel_frame",
        objectKey: "profiles/profile/items/item/cover.jpg",
        mimeType: "image/jpeg",
        timestampSeconds: 1.5,
        normalizationVersion: "full-bleed-9x16-v1",
        capturedAt: "2026-08-19T12:00:00.000Z",
      }),
      get: vi.fn(),
    };
    const result = await processLearningItem({
      sourceType: "external_url",
      sourceUrl: "https://www.instagram.com/reel/ABC123/",
      creator: null,
      sourceCaption: null,
      extractedVisualText: null,
      intent: "remember",
      mediaFile: null,
    }, {
      profileId,
      repository: new MemoryLearningItemRepository(),
      transcriber: null,
      retriever,
      analyzer,
      sourceVisualStore,
    });

    expect(result.item.accessLevel).toBe("partial");
    expect(result.item.creator).toBe("@public_teacher");
    expect(result.item.sourceCaption).toContain("decision, outcome, and lesson");
    expect(result.item.sourceMaterials).toEqual([
      expect.objectContaining({ kind: "caption", origin: "openai_web_search", completeness: "partial" }),
    ]);
    expect(result.item.card?.title).toBe("A grounded card");
    expect(result.item.sourceVisual).toEqual(expect.objectContaining({ kind: "reel_frame", timestampSeconds: 1.5 }));
    expect(sourceVisualStore.put).toHaveBeenCalledWith(expect.objectContaining({ itemId: result.item.id }));
    expect(retriever.retrieve).toHaveBeenCalledWith("https://www.instagram.com/reel/ABC123/");
    expect(analyzer.analyze).toHaveBeenCalledOnce();
  });

  it("adds source-validated research after extracting detailed notes", async () => {
    const analyzer: LearningCardAnalyzer = {
      analyze: vi.fn().mockResolvedValue({ card, mode: "live_openai", model: "test-analyzer", promptVersion: LEARNING_CARD_PROMPT_VERSION }),
    };
    const researcher: LearningCardResearcher = {
      research: vi.fn().mockResolvedValue({
        mode: "source_validation",
        overview: "The central claim is supported, with an important eligibility condition.",
        model: "test-researcher",
        promptVersion: "test-research-v1",
        findings: [{
          topic: "HSA eligibility",
          verdict: "supported_with_context",
          explanation: "HSA contributions generally require eligible high-deductible health-plan coverage and no disqualifying coverage.",
          correction: "Eligibility is not based only on being healthy.",
          sources: [{ title: "Publication 969", publisher: "IRS", url: "https://www.irs.gov/publications/p969" }],
        }],
      }),
    };
    const result = await processLearningItem({
      sourceType: "external_url",
      sourceUrl: "https://example.com/hsa-lesson",
      creator: null,
      sourceCaption: "An HSA can be a powerful tax-advantaged account.",
      extractedVisualText: null,
      intent: "verify",
      mediaFile: null,
    }, {
      profileId,
      repository: new MemoryLearningItemRepository(),
      transcriber: null,
      analyzer,
      researcher,
    });

    expect(result.item.card?.notes).toHaveLength(4);
    expect(result.item.card?.researchBrief).toEqual(expect.objectContaining({
      mode: "source_validation",
      model: "test-researcher",
      findings: [expect.objectContaining({ verdict: "supported_with_context" })],
    }));
    expect(researcher.research).toHaveBeenCalledOnce();
    expect(result.item.processingStatus).toBe("partial");
  });

  it("can retry AI retrieval for an existing link-only item", async () => {
    const repository = new MemoryLearningItemRepository();
    const retriever: PublicSourceRetriever = {
      retrieve: vi.fn()
        .mockResolvedValueOnce({ materials: [], creator: null, model: "test-retriever", consultedUrls: [] })
        .mockResolvedValueOnce({
          materials: [{
            kind: "caption",
            label: "Exact public page text retrieved with OpenAI web search",
            text: "A public caption became available.",
            origin: "openai_web_search",
            completeness: "partial",
          }],
          creator: null,
          model: "test-retriever",
          consultedUrls: ["https://example.com/lesson"],
        }),
    };
    const analyzer: LearningCardAnalyzer = { analyze: vi.fn().mockResolvedValue({ card, mode: "live_openai", model: "test-analyzer", promptVersion: LEARNING_CARD_PROMPT_VERSION }) };
    const input: IngestionInput = {
      sourceType: "external_url",
      sourceUrl: "https://example.com/lesson",
      creator: null,
      sourceCaption: null,
      extractedVisualText: null,
      intent: "remember",
      mediaFile: null,
    };

    const first = await processLearningItem(input, { profileId, repository, transcriber: null, retriever, analyzer });
    const retried = await processLearningItem(input, { profileId, repository, transcriber: null, retriever, analyzer });

    expect(first.item.accessLevel).toBe("link_only");
    expect(retried.duplicate).toBe(false);
    expect(retried.item.id).toBe(first.item.id);
    expect(retried.item.card?.title).toBe("A grounded card");
    expect(retried.item.issues).toEqual([]);
    expect(retriever.retrieve).toHaveBeenCalledTimes(2);
  });

  it("upgrades an existing caption-only Reel once with primary audio and visual evidence", async () => {
    const repository = new MemoryLearningItemRepository();
    const analyze = vi.fn().mockResolvedValue({
      card,
      mode: "live_openai",
      model: "test-analyzer",
      promptVersion: LEARNING_CARD_PROMPT_VERSION,
    });
    const retriever: PublicSourceRetriever = {
      retrieve: vi.fn().mockResolvedValue({
        materials: [{
          kind: "transcript",
          label: "Full speech transcript from the public Instagram Reel",
          text: "Tip one. Tip two. Tip three. Tip four. Tip five.",
          origin: "instagram_browser_transcription",
          completeness: "complete_for_channel",
        }, {
          kind: "visible_text",
          label: "Timestamped visual evidence sampled across the full Reel",
          text: "[00:03] On-screen text: Tip 1",
          origin: "instagram_browser_visual_analysis",
          completeness: "partial",
        }],
        creator: "@public_teacher",
        model: "test-transcriber+test-vision",
        transcriptionModel: "test-transcriber",
        consultedUrls: ["https://www.instagram.com/reel/ABC123/"],
      }),
    };
    const input: IngestionInput = {
      sourceType: "instagram_url",
      sourceUrl: "https://www.instagram.com/reel/ABC123/",
      creator: null,
      sourceCaption: "Five Japan trip tips.",
      extractedVisualText: null,
      intent: "remember",
      mediaFile: null,
    };

    const captionOnly = await processLearningItem(input, {
      profileId,
      repository,
      transcriber: null,
      analyzer: { analyze },
    });
    const upgraded = await processLearningItem(input, {
      profileId,
      repository,
      transcriber: null,
      retriever,
      analyzer: { analyze },
    });
    const duplicate = await processLearningItem(input, {
      profileId,
      repository,
      transcriber: null,
      retriever,
      analyzer: { analyze },
    });

    expect(captionOnly.item.sourceRetrievalVersion).toBeNull();
    expect(upgraded.duplicate).toBe(false);
    expect(upgraded.item.sourceRetrievalVersion).toBe(PUBLIC_SOURCE_RETRIEVAL_VERSION);
    expect(upgraded.item.transcriptionModel).toBe("test-transcriber");
    expect(upgraded.item.sourceMaterials.slice(0, 2).map((material) => material.origin)).toEqual([
      "instagram_browser_visual_analysis",
      "instagram_browser_transcription",
    ]);
    expect(duplicate.duplicate).toBe(true);
    expect(retriever.retrieve).toHaveBeenCalledOnce();
    expect(analyze).toHaveBeenCalledTimes(2);
  });

  it("uses new phone-discovered media to retry a Reel after a server-only fallback", async () => {
    const repository = new MemoryLearningItemRepository();
    const analyze = vi.fn().mockResolvedValue({ card, mode: "live_openai", model: "test-analyzer", promptVersion: LEARNING_CARD_PROMPT_VERSION });
    const input: IngestionInput = {
      sourceType: "external_url",
      sourceUrl: "https://www.instagram.com/reel/CLIENT123/",
      creator: null,
      sourceCaption: "Three useful tips.",
      extractedVisualText: null,
      intent: "remember",
      mediaFile: null,
    };
    const captionOnly = await processLearningItem(input, { profileId, repository, transcriber: null, analyzer: { analyze } });
    await repository.save({ ...captionOnly.item, sourceRetrievalVersion: PUBLIC_SOURCE_RETRIEVAL_VERSION });

    const retrieve = vi.fn().mockResolvedValue({
      materials: [{
        kind: "transcript",
        label: "Full speech transcript from the public Instagram Reel",
        text: "The complete spoken tips.",
        origin: "instagram_browser_transcription",
        completeness: "complete_for_channel",
      }],
      creator: null,
      model: "test-transcriber",
      transcriptionModel: "test-transcriber",
      consultedUrls: [input.sourceUrl],
    });
    const mediaUrls = ["https://media.cdninstagram.com/reel.mp4?efg=encoded"];
    const retried = await processLearningItem({ ...input, publicMediaUrls: mediaUrls }, {
      profileId,
      repository,
      transcriber: null,
      retriever: { retrieve },
      analyzer: { analyze },
    });

    expect(retried.duplicate).toBe(false);
    expect(retried.item.transcript).toBe("The complete spoken tips.");
    expect(retrieve).toHaveBeenCalledWith(input.sourceUrl, { publicMediaUrls: mediaUrls });
  });

  it("returns the existing item when identical media is submitted twice", async () => {
    const repository = new MemoryLearningItemRepository();
    const transcribe = vi.fn().mockResolvedValue({ text: "Same source.", model: "test-transcriber" });
    const analyze = vi.fn().mockResolvedValue({ card, mode: "live_openai", model: "test-analyzer", promptVersion: LEARNING_CARD_PROMPT_VERSION });
    const dependencies = {
      profileId,
      repository,
      transcriber: { transcribe },
      analyzer: { analyze },
    };
    const first = await processLearningItem(uploadInput(new File(["same bytes"], "one.mp4", { type: "video/mp4" })), dependencies);
    const second = await processLearningItem(uploadInput(new File(["same bytes"], "renamed.mp4", { type: "video/mp4" })), dependencies);

    expect(second.duplicate).toBe(true);
    expect(second.item.id).toBe(first.item.id);
    expect(transcribe).toHaveBeenCalledTimes(1);
    expect(analyze).toHaveBeenCalledTimes(1);
  });

  it("keeps meaningful video query parameters while ignoring tracking parameters", async () => {
    const input = (sourceUrl: string): IngestionInput => ({
      sourceType: "external_url",
      sourceUrl,
      creator: null,
      sourceCaption: null,
      extractedVisualText: null,
      intent: "remember",
      mediaFile: null,
    });

    const first = await sourceFingerprint(input("https://youtube.com/watch?v=first&utm_source=share"));
    const firstWithoutTracking = await sourceFingerprint(input("https://youtube.com/watch?v=first"));
    const second = await sourceFingerprint(input("https://youtube.com/watch?v=second"));

    expect(first).toBe(firstWithoutTracking);
    expect(first).not.toBe(second);
  });

  it("enriches an existing link-only save when context arrives later", async () => {
    const repository = new MemoryLearningItemRepository();
    const analyzer: LearningCardAnalyzer = { analyze: vi.fn().mockResolvedValue({ card, mode: "live_openai", model: "test-analyzer", promptVersion: LEARNING_CARD_PROMPT_VERSION }) };
    const base: IngestionInput = {
      sourceType: "external_url",
      sourceUrl: "https://example.com/lesson",
      creator: null,
      sourceCaption: null,
      extractedVisualText: null,
      intent: "remember",
      mediaFile: null,
    };
    const first = await processLearningItem(base, { profileId, repository, transcriber: null, analyzer });
    const enriched = await processLearningItem({ ...base, sourceCaption: "A useful lesson with enough evidence to process." }, {
      profileId,
      repository,
      transcriber: null,
      analyzer,
    });

    expect(first.item.accessLevel).toBe("link_only");
    expect(enriched.duplicate).toBe(false);
    expect(enriched.item.id).toBe(first.item.id);
    expect(enriched.item.card?.title).toBe("A grounded card");
    expect(enriched.item.issues).toEqual([]);
    expect(analyzer.analyze).toHaveBeenCalledOnce();
  });

  it("refreshes a saved URL card when the writing prompt version changes", async () => {
    const repository = new MemoryLearningItemRepository();
    const analyze = vi.fn()
      .mockResolvedValueOnce({ card, mode: "live_openai", model: "test-analyzer", promptVersion: "learning-card-v1" })
      .mockResolvedValueOnce({ card: { ...card, title: "A tighter learning" }, mode: "live_openai", model: "test-analyzer", promptVersion: LEARNING_CARD_PROMPT_VERSION });
    const input: IngestionInput = {
      sourceType: "external_url",
      sourceUrl: "https://example.com/versioned-lesson",
      creator: null,
      sourceCaption: "A complete source caption for prompt-version testing.",
      extractedVisualText: null,
      intent: "remember",
      mediaFile: null,
    };

    const first = await processLearningItem(input, { profileId, repository, transcriber: null, analyzer: { analyze } });
    const refreshed = await processLearningItem(input, { profileId, repository, transcriber: null, analyzer: { analyze } });

    expect(refreshed.duplicate).toBe(false);
    expect(refreshed.item.id).toBe(first.item.id);
    expect(refreshed.item.card?.title).toBe("A tighter learning");
    expect(refreshed.item.analysisPromptVersion).toBe(LEARNING_CARD_PROMPT_VERSION);
    expect(analyze).toHaveBeenCalledTimes(2);
  });
});
