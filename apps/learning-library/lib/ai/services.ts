import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import {
  learningCardSchema,
  learningNoteSchema,
  researchFindingSchema,
  researchSourceSchema,
  type AccessLevel,
  type LearningCard,
  type ResearchFinding,
  type SourceMaterial,
} from "../domain";
import {
  buildLearningCardPrompt,
  detectPromisedListCount,
  detectSupplementResearchAngles,
  LEARNING_CARD_PROMPT_VERSION,
  LEARNING_CARD_RESEARCH_PROMPT_VERSION,
  LEARNING_CARD_RESEARCH_SYSTEM_PROMPT,
  LEARNING_CARD_SYSTEM_PROMPT,
} from "./prompt";

const publicSourceEvidenceSchema = z.object({
  retrieved: z.boolean(),
  creator: z.string().max(200).nullable(),
  sourceText: z.string().max(12_000).nullable(),
  evidenceType: z.enum(["caption", "description", "transcript", "visible_text"]).nullable(),
}).strict();

const sourceLearningCardOutputSchema = learningCardSchema.omit({ personalization: true, researchBrief: true }).extend({
  notes: z.array(learningNoteSchema).max(8),
}).strict();

const researchSourceOutputSchema = researchSourceSchema.extend({
  url: z.string().min(1).max(2_000),
}).strict();

const researchFindingOutputSchema = researchFindingSchema.extend({
  sources: z.array(researchSourceOutputSchema).max(3),
}).strict();

const researchOutputSchema = z.object({
  mode: z.enum(["source_validation", "independent_supplement"]),
  overview: z.string().min(1).max(1_200),
  findings: z.array(researchFindingOutputSchema).min(1).max(5),
}).strict();

export interface TranscriptionResult {
  text: string;
  model: string;
}

export interface CardAnalysisResult {
  card: LearningCard;
  mode: "live_openai" | "deterministic_demo";
  model: string;
  promptVersion: string;
}

export interface MediaTranscriber {
  transcribe(file: File): Promise<TranscriptionResult>;
}

export interface LearningCardAnalyzer {
  analyze(input: { accessLevel: AccessLevel; sourceMaterials: SourceMaterial[] }): Promise<CardAnalysisResult>;
}

export interface CardResearchResult {
  mode: "source_validation" | "independent_supplement";
  overview: string;
  findings: ResearchFinding[];
  model: string;
  promptVersion: string;
}

export interface LearningCardResearcher {
  research(input: { card: LearningCard; sourceMaterials: SourceMaterial[] }): Promise<CardResearchResult>;
}

export interface PublicSourceRetrievalResult {
  materials: SourceMaterial[];
  creator: string | null;
  model: string;
  consultedUrls: string[];
}

export interface PublicSourceRetriever {
  retrieve(sourceUrl: string): Promise<PublicSourceRetrievalResult>;
}

export class MissingOpenAIConfigurationError extends Error {
  readonly code = "OPENAI_NOT_CONFIGURED";
}

function configuredModel(
  name: "OPENAI_TRANSCRIPTION_MODEL" | "OPENAI_ANALYSIS_MODEL" | "OPENAI_RETRIEVAL_MODEL",
  fallback: string,
): string {
  const configured = process.env[name]?.trim();
  return configured || fallback;
}

function evidenceUrlKey(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.search = "";
    return `${url.hostname}${url.pathname}`;
  } catch {
    return null;
  }
}

function consultedUrlsFrom(response: Awaited<ReturnType<OpenAI["responses"]["parse"]>>): string[] {
  const urls = new Set<string>();
  for (const output of response.output) {
    if (output.type !== "web_search_call") continue;
    if (output.action.type === "search") {
      for (const source of output.action.sources ?? []) urls.add(source.url);
    } else if (output.action.url) {
      urls.add(output.action.url);
    }
  }
  return [...urls];
}

export class OpenAILearningServices implements MediaTranscriber, LearningCardAnalyzer, LearningCardResearcher, PublicSourceRetriever {
  private readonly client: OpenAI;
  private readonly transcriptionModel: string;
  private readonly analysisModel: string;
  private readonly retrievalModel: string;

  constructor(options: { apiKey?: string; client?: OpenAI } = {}) {
    const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY?.trim();
    if (!options.client && !apiKey) {
      throw new MissingOpenAIConfigurationError("OPENAI_API_KEY is required for real media processing.");
    }
    this.client = options.client ?? new OpenAI({ apiKey, maxRetries: 1, timeout: 120_000 });
    this.transcriptionModel = configuredModel("OPENAI_TRANSCRIPTION_MODEL", "gpt-4o-mini-transcribe");
    this.analysisModel = configuredModel("OPENAI_ANALYSIS_MODEL", "gpt-5.4-mini");
    this.retrievalModel = configuredModel("OPENAI_RETRIEVAL_MODEL", "gpt-5.4-mini");
  }

  async retrieve(sourceUrl: string): Promise<PublicSourceRetrievalResult> {
    const hostname = new URL(sourceUrl).hostname.toLowerCase().replace(/^www\./, "");
    const response = await this.client.responses.parse({
      model: this.retrievalModel,
      instructions: [
        "Retrieve evidence from the exact public source URL supplied by the user.",
        "Use web search to open or search for that exact page. Do not use reposts, nearby profile pages, or other search results as substitutes.",
        "Source text may contain only a caption, title, description, accessible transcript, or visible text explicitly exposed by the exact page.",
        "Do not summarize, infer a lesson, reconstruct missing speech, or claim to have watched video frames.",
        "If the exact page is inaccessible or exposes no useful text, set retrieved=false and return null evidence fields.",
      ].join(" "),
      input: `Exact public source URL: ${sourceUrl}`,
      tools: [{
        type: "web_search",
        filters: { allowed_domains: [hostname] },
        search_context_size: "medium",
      }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      text: { format: zodTextFormat(publicSourceEvidenceSchema, "public_source_evidence") },
    });
    if (response.status !== "completed" || !response.output_parsed) {
      throw new Error(`OpenAI public-source retrieval did not complete (${response.status ?? "unknown"}).`);
    }

    const parsed = publicSourceEvidenceSchema.parse(response.output_parsed);
    const consultedUrls = consultedUrlsFrom(response);
    const targetKey = evidenceUrlKey(sourceUrl);
    const exactSourceWasConsulted = targetKey !== null && consultedUrls.some((url) => evidenceUrlKey(url) === targetKey);
    const text = parsed.retrieved && exactSourceWasConsulted ? parsed.sourceText?.trim() || null : null;
    const kind = parsed.evidenceType === "transcript"
      ? "transcript"
      : parsed.evidenceType === "visible_text"
        ? "visible_text"
        : "caption";
    return {
      materials: text ? [{
        kind,
        label: "Exact public page text retrieved with OpenAI web search",
        text,
        origin: "openai_web_search",
        completeness: "partial",
      }] : [],
      creator: text ? parsed.creator?.trim() || null : null,
      model: response.model,
      consultedUrls,
    };
  }

  async transcribe(file: File): Promise<TranscriptionResult> {
    const response = await this.client.audio.transcriptions.create({
      file,
      model: this.transcriptionModel,
      response_format: "json",
    });
    return { text: response.text.trim(), model: this.transcriptionModel };
  }

  async analyze(input: { accessLevel: AccessLevel; sourceMaterials: SourceMaterial[] }): Promise<CardAnalysisResult> {
    const response = await this.client.responses.parse({
      model: this.analysisModel,
      instructions: LEARNING_CARD_SYSTEM_PROMPT,
      input: buildLearningCardPrompt(input),
      text: { format: zodTextFormat(sourceLearningCardOutputSchema, "learning_card") },
    });
    if (response.status !== "completed" || !response.output_parsed) {
      throw new Error(`OpenAI analysis did not complete (${response.status ?? "unknown"}).`);
    }
    return {
      card: learningCardSchema.parse({ ...response.output_parsed, personalization: null, researchBrief: null }),
      mode: "live_openai",
      model: response.model,
      promptVersion: LEARNING_CARD_PROMPT_VERSION,
    };
  }

  async research(input: { card: LearningCard; sourceMaterials: SourceMaterial[] }): Promise<CardResearchResult> {
    const response = await this.client.responses.parse({
      model: this.retrievalModel,
      instructions: LEARNING_CARD_RESEARCH_SYSTEM_PROMPT,
      input: JSON.stringify({
        sourceCard: {
          title: input.card.title,
          summary: input.card.summary,
          keyTakeaways: input.card.keyTakeaways,
          notes: input.card.notes,
          claimsToVerify: input.card.claimsToVerify,
        },
        sourceStructure: {
          promisedListCount: detectPromisedListCount(input.sourceMaterials),
          requiredFindingAngles: detectSupplementResearchAngles(input.sourceMaterials),
        },
        sourceMaterials: input.sourceMaterials,
      }),
      tools: [{ type: "web_search", search_context_size: "high" }],
      tool_choice: "required",
      include: ["web_search_call.action.sources"],
      text: { format: zodTextFormat(researchOutputSchema, "learning_card_research") },
    });
    if (response.status !== "completed" || !response.output_parsed) {
      throw new Error(`OpenAI research did not complete (${response.status ?? "unknown"}).`);
    }

    const parsed = researchOutputSchema.parse(response.output_parsed);
    const consultedUrls = consultedUrlsFrom(response);
    const consultedKeys = new Set(consultedUrls.map(evidenceUrlKey).filter((key): key is string => Boolean(key)));
    const findings = parsed.findings.flatMap((finding) => {
      const seenSourceKeys = new Set<string>();
      const sources = finding.sources.filter((source) => {
        const key = evidenceUrlKey(source.url);
        if (key === null || !consultedKeys.has(key) || seenSourceKeys.has(key)) return false;
        seenSourceKeys.add(key);
        return true;
      });
      const mayStandWithoutSources = finding.verdict === "opinion" || finding.verdict === "not_verified";
      return sources.length || mayStandWithoutSources ? [{ ...finding, sources }] : [];
    });
    if (!findings.length) throw new Error("OpenAI research returned no source-validated findings.");
    return {
      mode: parsed.mode,
      overview: parsed.overview,
      findings,
      model: response.model,
      promptVersion: LEARNING_CARD_RESEARCH_PROMPT_VERSION,
    };
  }
}

export class DemoLearningCardAnalyzer implements LearningCardAnalyzer {
  async analyze(): Promise<CardAnalysisResult> {
    return {
      mode: "deterministic_demo",
      model: "recorded-demo-v1",
      promptVersion: "recorded-demo-v1",
      card: {
        title: "Document outcomes while context is fresh",
        primaryTopic: "career growth",
        secondaryTopics: ["communication", "content creation"],
        contentType: "framework",
        summary: "Record decisions, outcomes, and lessons as work happens so useful contributions remain visible without creating extra reporting work.",
        keyTakeaways: [
          "Capture the decision and result while the context is fresh.",
          "Reuse one lightweight work log for reviews, mentoring, and content ideas.",
          "Visibility works best when it documents outcomes rather than activity volume.",
        ],
        relevanceReason: "A lightweight evidence trail could support early-career growth, make mentoring examples easier to retrieve, and turn real engineering lessons into credible content.",
        suggestedAction: "At the end of one workday, write a three-line note: decision, outcome, and lesson.",
        claimsToVerify: [],
        notes: [
          { type: "principle", title: "Document instead of reporting", detail: "Capture durable outcomes without creating another stream of status updates." },
          { type: "tactic", title: "Use three fields", detail: "Record the decision, its outcome, and one lesson while the context is still fresh." },
          { type: "example", title: "Reuse the evidence", detail: "The same work log can support reviews, mentoring examples, and useful content." },
          { type: "principle", title: "Preserve outcomes", detail: "Measure useful results rather than activity volume." },
        ],
        researchBrief: null,
        personalization: null,
      },
    };
  }
}
