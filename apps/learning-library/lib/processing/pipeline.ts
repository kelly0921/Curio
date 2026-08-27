import {
  learningItemSchema,
  type AccessLevel,
  type IngestionInput,
  type LearningItem,
  type ProcessingIssue,
  type ProcessingResult,
  type SourceMaterial,
} from "../domain";
import type { LearningItemRepository } from "../data/repository";
import {
  DemoLearningCardAnalyzer,
  MissingOpenAIConfigurationError,
  type LearningCardAnalyzer,
  type LearningCardResearcher,
  type MediaTranscriber,
  type PublicSourceRetriever,
} from "../ai/services";
import {
  LEARNING_CARD_PROMPT_VERSION,
  LEARNING_CARD_RESEARCH_PROMPT_VERSION,
  prioritizeSourceMaterials,
} from "../ai/prompt";
import { PUBLIC_SOURCE_RETRIEVAL_VERSION } from "../retrieval/instagram-reel";
import type { SourceVisualStore } from "../media/source-visual-store";

export const DEMO_TRANSCRIPT = `Most people make their work visible by creating more status updates. Try documenting instead of reporting. When you make a decision, write down the decision, the outcome, and one lesson while the context is still fresh. That small work log can become evidence for a performance review, an example for someone you mentor, or the seed of a useful post. The goal is not to count activity. It is to preserve the outcomes that would otherwise disappear.`;

export interface PipelineDependencies {
  profileId: string;
  repository: LearningItemRepository;
  transcriber: MediaTranscriber | null;
  retriever?: PublicSourceRetriever | null;
  analyzer: LearningCardAnalyzer | null;
  researcher?: LearningCardResearcher | null;
  sourceVisualStore?: SourceVisualStore | null;
  demoAnalyzer?: LearningCardAnalyzer;
  id?: () => string;
  now?: () => string;
}

function normalizedSourceUrl(value: string): string {
  const url = new URL(value);
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  url.pathname = url.pathname.replace(/\/+$/, "");
  for (const key of [...url.searchParams.keys()]) {
    if (/^utm_/i.test(key) || ["fbclid", "gclid", "igsh", "igshid", "si", "feature"].includes(key.toLowerCase())) {
      url.searchParams.delete(key);
    }
  }
  url.searchParams.sort();
  return url.toString();
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256(value: string | ArrayBuffer): Promise<string> {
  const bytes = typeof value === "string" ? new TextEncoder().encode(value) : value;
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
}

export async function sourceFingerprint(input: IngestionInput): Promise<string> {
  if (input.sourceType === "demo_fixture") return sha256("learning-library-demo-fixture-v1");
  if ((input.sourceType === "instagram_url" || input.sourceType === "external_url") && input.sourceUrl) {
    return sha256(`url:${normalizedSourceUrl(input.sourceUrl)}`);
  }
  if (input.mediaFile) return sha256(await input.mediaFile.arrayBuffer());
  throw new Error("The source is missing the URL or media required to fingerprint it.");
}

function issue(code: string, message: string, recoverable: boolean): ProcessingIssue {
  return { code, message, recoverable };
}

function initialMaterials(input: IngestionInput): SourceMaterial[] {
  const materials: SourceMaterial[] = [];
  if (input.sourceCaption) {
    materials.push({
      kind: "caption",
      label: "Caption supplied with this item",
      text: input.sourceCaption,
      origin: "user_supplied",
      completeness: "unknown",
    });
  }
  if (input.extractedVisualText) {
    materials.push({
      kind: "visible_text",
      label: "On-screen text supplied by the user",
      text: input.extractedVisualText,
      origin: "user_supplied",
      completeness: "partial",
    });
  }
  if (input.sourceType === "demo_fixture") {
    materials.push({
      kind: "transcript",
      label: "Recorded sample transcript",
      text: DEMO_TRANSCRIPT,
      origin: "demo_fixture",
      completeness: "complete_for_channel",
    });
  }
  return materials;
}

function initialAccessLevel(input: IngestionInput): AccessLevel {
  return input.sourceType === "instagram_url" || input.sourceType === "external_url" ? "link_only" : "partial";
}

function mergeMaterials(current: SourceMaterial[], incoming: SourceMaterial[]): SourceMaterial[] {
  const seen = new Set(current.map((material) => `${material.kind}:${material.text}`));
  return prioritizeSourceMaterials([
    ...current,
    ...incoming.filter((material) => !seen.has(`${material.kind}:${material.text}`)),
  ]);
}

function hasPrimaryReelEvidence(materials: SourceMaterial[]): boolean {
  return materials.some((material) => (
    material.origin === "instagram_browser_transcription"
    || material.origin === "instagram_browser_visual_analysis"
  ));
}

function sourcePlatform(input: IngestionInput): LearningItem["platform"] {
  if (input.sourceType === "uploaded_media") return "local";
  if (input.sourceType === "demo_fixture") return "demo";
  if (!input.sourceUrl) return "web";
  const hostname = new URL(input.sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
  if (hostname === "instagram.com" || hostname === "instagr.am") return "instagram";
  if (hostname === "youtube.com" || hostname === "youtu.be") return "youtube";
  if (hostname === "tiktok.com" || hostname.endsWith(".tiktok.com")) return "tiktok";
  if (hostname === "vimeo.com" || hostname.endsWith(".vimeo.com")) return "vimeo";
  return "web";
}

function replace(item: LearningItem, patch: Partial<LearningItem>, now: () => string): LearningItem {
  return learningItemSchema.parse({ ...item, ...patch, updatedAt: now() });
}

function safeProcessingMessage(error: unknown, operation: "transcription" | "analysis"): ProcessingIssue {
  if (error instanceof MissingOpenAIConfigurationError) {
    return issue(
      error.code,
      `OpenAI is not configured, so live ${operation} could not run. Add OPENAI_API_KEY on the server and retry.`,
      true,
    );
  }
  return issue(
    operation === "transcription" ? "TRANSCRIPTION_FAILED" : "ANALYSIS_FAILED",
    `${operation === "transcription" ? "Transcription" : "Learning Card generation"} failed. The available source evidence was preserved.`,
    true,
  );
}

function publicRetrievalIssue(error: unknown): ProcessingIssue {
  if (error instanceof MissingOpenAIConfigurationError) {
    return issue(
      error.code,
      "AI retrieval is not configured. Add OPENAI_API_KEY on the server, then try the public link again.",
      true,
    );
  }
  return issue(
    "PUBLIC_SOURCE_RETRIEVAL_FAILED",
    "Curio could not complete public-page retrieval. The link is saved, and you can try again or share a screen recording.",
    true,
  );
}

function researchIssue(error: unknown): ProcessingIssue {
  if (error instanceof MissingOpenAIConfigurationError) {
    return issue(
      error.code,
      "OpenAI is not configured, so the extracted notes were saved without external research.",
      true,
    );
  }
  return issue(
    "RESEARCH_FAILED",
    "The extracted notes were saved, but Curio could not complete source-validated web research. Try again later.",
    true,
  );
}

export async function processLearningItem(
  input: IngestionInput,
  dependencies: PipelineDependencies,
): Promise<ProcessingResult> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const id = dependencies.id ?? (() => crypto.randomUUID());
  const fingerprint = await sourceFingerprint(input);
  const existing = await dependencies.repository.findByFingerprint(dependencies.profileId, fingerprint);
  const incomingMaterials = initialMaterials(input);
  const isUrlSource = input.sourceType === "instagram_url" || input.sourceType === "external_url";
  const isInstagramSource = isUrlSource && sourcePlatform(input) === "instagram";
  const hasClientMediaHints = Boolean(input.publicMediaUrls?.length);
  const addsEvidence = existing && isUrlSource && !existing.card && incomingMaterials.some((incoming) =>
    !existing.sourceMaterials.some((current) => current.kind === incoming.kind && current.text === incoming.text));
  const retriesPublicRetrieval = existing && isUrlSource && !existing.card && existing.sourceMaterials.length === 0
    && Boolean(dependencies.retriever);
  const upgradesReelRetrieval = existing && isInstagramSource && Boolean(dependencies.retriever)
    && (existing.sourceRetrievalVersion !== PUBLIC_SOURCE_RETRIEVAL_VERSION || hasClientMediaHints)
    && !hasPrimaryReelEvidence(existing.sourceMaterials);
  const refreshesAnalysis = existing && isUrlSource && Boolean(existing.card) && existing.sourceMaterials.length > 0
    && (
      existing.analysisPromptVersion !== LEARNING_CARD_PROMPT_VERSION
      || (Boolean(dependencies.researcher) && existing.card?.researchBrief?.promptVersion !== LEARNING_CARD_RESEARCH_PROMPT_VERSION)
    );
  if (existing && !addsEvidence && !retriesPublicRetrieval && !upgradesReelRetrieval && !refreshesAnalysis) {
    return { item: existing, duplicate: true };
  }

  let item: LearningItem;
  if (existing && (addsEvidence || retriesPublicRetrieval || upgradesReelRetrieval || refreshesAnalysis)) {
    item = replace(existing, {
      creator: input.creator ?? existing.creator,
      sourceCaption: input.sourceCaption ?? existing.sourceCaption,
      extractedVisualText: input.extractedVisualText ?? existing.extractedVisualText,
      accessLevel: "partial",
      processingStatus: "received",
      intent: input.intent,
      sourceMaterials: mergeMaterials(existing.sourceMaterials, incomingMaterials),
      card: null,
      analysisMode: "not_run",
      analysisModel: null,
      analysisPromptVersion: null,
      issues: existing.issues.filter((entry) => ![
        "LINK_ONLY",
        "INSTAGRAM_LINK_ONLY",
        "NO_ANALYZABLE_SOURCE",
        "PUBLIC_SOURCE_RETRIEVAL_FAILED",
        "RESEARCH_FAILED",
      ].includes(entry.code)),
    }, now);
  } else {
    const createdAt = now();
    item = learningItemSchema.parse({
      id: id(),
      profileId: dependencies.profileId,
      sourceType: input.sourceType,
      sourceUrl: input.sourceUrl,
      platform: sourcePlatform(input),
      creator: input.sourceType === "demo_fixture" ? "Sample creator" : input.creator,
      sourceCaption: input.sourceCaption,
      transcript: input.sourceType === "demo_fixture" ? DEMO_TRANSCRIPT : null,
      extractedVisualText: input.extractedVisualText,
      uploadedMediaReference: input.mediaFile ? `ephemeral:${input.mediaFile.name}` : null,
      sourceFingerprint: fingerprint,
      accessLevel: initialAccessLevel(input),
      processingStatus: "received",
      intent: input.intent,
      sourceMaterials: incomingMaterials,
      card: null,
      analysisMode: "not_run",
      analysisModel: null,
      analysisPromptVersion: null,
      sourceRetrievalVersion: null,
      transcriptionModel: null,
      issues: [],
      createdAt,
      updatedAt: createdAt,
    });
  }
  await dependencies.repository.save(item);

  item = replace(item, { processingStatus: "retrieving_source" }, now);
  await dependencies.repository.save(item);

  const needsRicherReelEvidence = isInstagramSource
    && (item.sourceRetrievalVersion !== PUBLIC_SOURCE_RETRIEVAL_VERSION || hasClientMediaHints)
    && !hasPrimaryReelEvidence(item.sourceMaterials);
  if (isUrlSource && (item.sourceMaterials.length === 0 || needsRicherReelEvidence) && input.sourceUrl && dependencies.retriever) {
    try {
      const retrieval = input.publicMediaUrls?.length
        ? await dependencies.retriever.retrieve(input.sourceUrl, { publicMediaUrls: input.publicMediaUrls })
        : await dependencies.retriever.retrieve(input.sourceUrl);
      const retrievedCaption = retrieval.materials.find((material) => material.kind === "caption");
      const retrievedTranscript = retrieval.materials.find((material) => material.kind === "transcript");
      const retrievedVisualText = retrieval.materials.find((material) => material.kind === "visible_text");
      const hasRetrievedTranscription = retrieval.materials.some((material) => (
        material.origin === "instagram_browser_transcription"
        || material.origin === "instagram_public_embed_transcription"
      ));
      let sourceVisual = item.sourceVisual;
      if (retrieval.sourceVisual && dependencies.sourceVisualStore) {
        try {
          sourceVisual = await dependencies.sourceVisualStore.put({
            profileId: item.profileId,
            itemId: item.id,
            candidate: retrieval.sourceVisual,
            capturedAt: now(),
          });
        } catch (error) {
          console.warn(JSON.stringify({
            event: "source_visual_storage_failed",
            itemId: item.id,
            errorType: error instanceof Error ? error.name : "unknown",
          }));
        }
      }
      item = replace(item, {
        creator: retrieval.creator ?? item.creator,
        sourceCaption: retrievedCaption?.text ?? item.sourceCaption,
        transcript: retrievedTranscript?.text ?? item.transcript,
        extractedVisualText: retrievedVisualText?.text ?? item.extractedVisualText,
        sourceVisual,
        sourceRetrievalVersion: PUBLIC_SOURCE_RETRIEVAL_VERSION,
        transcriptionModel: hasRetrievedTranscription
          ? retrieval.transcriptionModel ?? retrieval.model
          : item.transcriptionModel,
        sourceMaterials: mergeMaterials(item.sourceMaterials, retrieval.materials),
        accessLevel: retrieval.materials.length ? "partial" : item.accessLevel,
      }, now);
      await dependencies.repository.save(item);
    } catch (error) {
      item = replace(item, {
        sourceRetrievalVersion: PUBLIC_SOURCE_RETRIEVAL_VERSION,
        issues: [...item.issues, publicRetrievalIssue(error)],
      }, now);
      await dependencies.repository.save(item);
    }
  }

  if (isUrlSource && item.sourceMaterials.length === 0) {
    item = replace(item, {
      processingStatus: "partial",
      accessLevel: "link_only",
      issues: [...item.issues, issue(
        "LINK_ONLY",
        dependencies.retriever
          ? "Curio tried AI retrieval, but this public page did not expose usable caption or transcript text. Try again or share a screen recording."
          : "The link was captured, but AI retrieval is not configured. Add OPENAI_API_KEY or share a screen recording.",
        true,
      )],
    }, now);
    return { item: await dependencies.repository.save(item), duplicate: false };
  }

  if (input.sourceType === "uploaded_media") {
    item = replace(item, { processingStatus: "transcribing" }, now);
    await dependencies.repository.save(item);
    if (!input.mediaFile) {
      item = replace(item, {
        processingStatus: "failed",
        accessLevel: "failed",
        issues: [issue("MEDIA_FILE_MISSING", "No media file was received.", true)],
      }, now);
      return { item: await dependencies.repository.save(item), duplicate: false };
    }
    try {
      if (!dependencies.transcriber) throw new MissingOpenAIConfigurationError("OpenAI is not configured.");
      const transcription = await dependencies.transcriber.transcribe(input.mediaFile);
      if (transcription.text) {
        item = replace(item, {
          transcript: transcription.text,
          transcriptionModel: transcription.model,
          accessLevel: "partial",
          sourceMaterials: [...item.sourceMaterials, {
            kind: "transcript",
            label: "Speech transcript from the uploaded media",
            text: transcription.text,
            origin: "openai_transcription",
            completeness: "complete_for_channel",
          }],
        }, now);
      } else {
        item = replace(item, {
          issues: [...item.issues, issue(
            "NO_SPEECH_DETECTED",
            "No useful speech was detected. This may be music-heavy or text-only content.",
            true,
          )],
        }, now);
      }
    } catch (error) {
      item = replace(item, { issues: [...item.issues, safeProcessingMessage(error, "transcription")] }, now);
    }
    await dependencies.repository.save(item);
  }

  if (item.sourceMaterials.length === 0) {
    const configurationFailure = item.issues.some((entry) => entry.code === "OPENAI_NOT_CONFIGURED");
    item = replace(item, {
      processingStatus: configurationFailure ? "failed" : "unsupported",
      accessLevel: configurationFailure ? "failed" : "unsupported",
      issues: configurationFailure
        ? item.issues
        : [...item.issues, issue(
          "NO_ANALYZABLE_SOURCE",
          "No transcript, caption, or visible text was available for a grounded Learning Card.",
          true,
        )],
    }, now);
    return { item: await dependencies.repository.save(item), duplicate: false };
  }

  item = replace(item, { processingStatus: "analyzing", accessLevel: "partial" }, now);
  await dependencies.repository.save(item);

  try {
    const analyzer = input.sourceType === "demo_fixture"
      ? dependencies.demoAnalyzer ?? new DemoLearningCardAnalyzer()
      : dependencies.analyzer;
    if (!analyzer) throw new MissingOpenAIConfigurationError("OpenAI is not configured.");
    const analysis = await analyzer.analyze({
      accessLevel: item.accessLevel,
      sourceMaterials: item.sourceMaterials,
    });
    item = replace(item, {
      card: analysis.card,
      analysisMode: analysis.mode,
      analysisModel: analysis.model,
      analysisPromptVersion: analysis.promptVersion,
      processingStatus: input.sourceType !== "demo_fixture" && dependencies.researcher
        ? "researching"
        : item.accessLevel === "full" ? "ready" : "partial",
    }, now);
  } catch (error) {
    item = replace(item, {
      processingStatus: "failed",
      issues: [...item.issues, safeProcessingMessage(error, "analysis")],
    }, now);
    return { item: await dependencies.repository.save(item), duplicate: false };
  }

  await dependencies.repository.save(item);

  if (item.card && input.sourceType !== "demo_fixture" && dependencies.researcher) {
    try {
      const research = await dependencies.researcher.research({
        card: item.card,
        sourceMaterials: item.sourceMaterials,
      });
      item = replace(item, {
        card: {
          ...item.card,
          researchBrief: {
            mode: research.mode,
            overview: research.overview,
            findings: research.findings,
            researchedAt: now(),
            model: research.model,
            promptVersion: research.promptVersion,
          },
        },
      }, now);
    } catch (error) {
      console.warn(JSON.stringify({
        event: "learning_card_research_failed",
        errorType: error instanceof Error ? error.name : "unknown",
        message: error instanceof Error ? error.message.slice(0, 300) : "Unknown research failure",
      }));
      item = replace(item, { issues: [...item.issues, researchIssue(error)] }, now);
    }
  }

  item = replace(item, {
    processingStatus: item.accessLevel === "full" ? "ready" : "partial",
  }, now);

  return { item: await dependencies.repository.save(item), duplicate: false };
}
