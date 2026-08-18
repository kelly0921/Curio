import { z } from "zod";

export const processingStatusSchema = z.enum([
  "received",
  "retrieving_source",
  "transcribing",
  "analyzing",
  "researching",
  "ready",
  "partial",
  "unsupported",
  "failed",
]);

export const accessLevelSchema = z.enum([
  "full",
  "partial",
  "link_only",
  "unsupported",
  "failed",
]);

export const sourceTypeSchema = z.enum(["uploaded_media", "instagram_url", "external_url", "demo_fixture"]);
export const sourcePlatformSchema = z.enum(["instagram", "youtube", "tiktok", "vimeo", "web", "local", "demo"]);
export const intentSchema = z.enum(["remember", "try", "verify", "reference", "use_for_content"]);

export const sourceMaterialSchema = z.object({
  kind: z.enum(["transcript", "caption", "visible_text"]),
  label: z.string().min(1).max(120),
  text: z.string().min(1).max(80_000),
  origin: z.enum([
    "openai_transcription",
    "openai_web_search",
    "instagram_public_embed_caption",
    "instagram_public_embed_transcription",
    "user_supplied",
    "demo_fixture",
  ]),
  completeness: z.enum(["complete_for_channel", "partial", "unknown"]),
}).strict();

export const claimToVerifySchema = z.object({
  claim: z.string().min(1).max(1_000),
  category: z.enum([
    "personal_opinion",
    "anecdotal_experience",
    "factual_claim",
    "high_stakes_factual_claim",
  ]),
  reasonToVerify: z.string().min(1).max(1_000),
}).strict();

export const learningNoteSchema = z.object({
  type: z.enum(["principle", "tactic", "claim", "example", "resource"]),
  title: z.string().min(1).max(120),
  detail: z.string().min(1).max(800),
}).strict();

export const researchSourceSchema = z.object({
  title: z.string().min(1).max(240),
  publisher: z.string().min(1).max(160),
  url: z.string().url().max(2_000),
}).strict();

export const researchFindingSchema = z.object({
  topic: z.string().min(1).max(180),
  verdict: z.enum(["confirmed", "supported_with_context", "corrected", "not_verified", "opinion"]),
  explanation: z.string().min(1).max(1_200),
  correction: z.string().min(1).max(800).nullable(),
  sources: z.array(researchSourceSchema).max(3),
}).strict();

const isoDateTimeSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/,
  "Expected an ISO-8601 UTC timestamp",
);

export const contextDomainSchema = z.enum([
  "finance",
  "travel",
  "food",
  "ai_work",
  "career",
  "health",
  "home",
  "relationships",
  "general",
]);

export const contextRecordKindSchema = z.enum([
  "goal",
  "fact",
  "preference",
  "constraint",
  "plan",
  "habit",
  "resource",
]);

export const contextConnectionSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  provider: z.enum(["mock", "notion"]),
  displayName: z.string().min(1).max(160),
  status: z.enum(["connected", "syncing", "attention_required", "disconnected"]),
  scopes: z.array(z.string().min(1).max(120)).max(20),
  isDemo: z.boolean(),
  lastSyncedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
}).strict();

export const contextRecordSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  connectionId: z.string().uuid(),
  domain: contextDomainSchema,
  kind: contextRecordKindSchema,
  statement: z.string().min(1).max(1_000),
  keywords: z.array(z.string().min(1).max(80)).max(20),
  sourceLabel: z.string().min(1).max(160),
  sourceReference: z.string().max(500).nullable(),
  sensitivity: z.enum(["standard", "private", "sensitive"]),
  confidence: z.enum(["explicit", "imported", "inferred"]),
  observedAt: isoDateTimeSchema,
  expiresAt: isoDateTimeSchema.nullable(),
}).strict();

export const contextSnapshotSchema = z.object({
  profileId: z.string().uuid(),
  connections: z.array(contextConnectionSchema),
  records: z.array(contextRecordSchema),
  syncedAt: isoDateTimeSchema,
}).strict();

export const recommendationFeedbackSchema = z.object({
  state: z.enum(["done", "later", "not_relevant"]),
  updatedAt: isoDateTimeSchema,
  revisitAt: isoDateTimeSchema.nullable(),
}).strict();

export const learningPersonalizationSchema = z.object({
  domain: contextDomainSchema,
  priority: z.enum(["high", "medium", "low"]),
  priorityScore: z.number().int().min(0).max(100),
  recommendationTier: z.enum(["do_now", "useful_for_goals", "worth_remembering"]),
  evidenceStatus: z.enum(["validated", "mixed", "unresearched", "opinion"]),
  whyNow: z.string().min(1).max(800),
  personalizedUse: z.string().min(1).max(800),
  nextStep: z.string().min(1).max(500),
  contextUsed: z.array(z.object({
    recordId: z.string().uuid(),
    domain: contextDomainSchema,
    kind: contextRecordKindSchema,
    statement: z.string().min(1).max(1_000),
    sourceLabel: z.string().min(1).max(160),
    isDemo: z.boolean(),
  }).strict()).max(4),
  generatedAt: isoDateTimeSchema,
  engineVersion: z.string().min(1).max(120),
}).strict();

export const researchBriefSchema = z.object({
  mode: z.enum(["source_validation", "independent_supplement"]).default("source_validation"),
  overview: z.string().min(1).max(1_200),
  findings: z.array(researchFindingSchema).min(1).max(5),
  researchedAt: isoDateTimeSchema,
  model: z.string().min(1).max(120),
  promptVersion: z.string().max(120).nullable().default(null),
}).strict();

export const learningCardSchema = z.object({
  title: z.string().min(1).max(160),
  primaryTopic: z.string().min(1).max(80),
  secondaryTopics: z.array(z.string().min(1).max(80)).max(5),
  contentType: z.enum([
    "tactic",
    "framework",
    "factual_information",
    "opinion",
    "personal_experience",
    "resource_recommendation",
    "story",
    "tutorial",
  ]),
  summary: z.string().min(1).max(1_200),
  keyTakeaways: z.array(z.string().min(1).max(500)).min(1).max(5),
  relevanceReason: z.string().min(1).max(1_200),
  suggestedAction: z.string().min(1).max(500),
  claimsToVerify: z.array(claimToVerifySchema).max(6),
  notes: z.array(learningNoteSchema).max(8).default([]),
  researchBrief: researchBriefSchema.nullable().default(null),
  personalization: learningPersonalizationSchema.nullable().default(null),
}).strict();

export const processingIssueSchema = z.object({
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(1_000),
  recoverable: z.boolean(),
}).strict();

export const learningItemSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  sourceType: sourceTypeSchema,
  sourceUrl: z.string().url().nullable(),
  platform: sourcePlatformSchema,
  creator: z.string().max(200).nullable(),
  sourceCaption: z.string().max(12_000).nullable(),
  transcript: z.string().max(80_000).nullable(),
  extractedVisualText: z.string().max(20_000).nullable(),
  uploadedMediaReference: z.string().max(500).nullable(),
  sourceFingerprint: z.string().min(1).max(128),
  accessLevel: accessLevelSchema,
  processingStatus: processingStatusSchema,
  intent: intentSchema,
  sourceMaterials: z.array(sourceMaterialSchema),
  card: learningCardSchema.nullable(),
  analysisMode: z.enum(["live_openai", "deterministic_demo", "not_run"]),
  analysisModel: z.string().max(120).nullable(),
  analysisPromptVersion: z.string().max(120).nullable().default(null),
  transcriptionModel: z.string().max(120).nullable(),
  issues: z.array(processingIssueSchema),
  recommendationFeedback: recommendationFeedbackSchema.nullable().default(null),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
}).strict();

export const personalProfile = Object.freeze({
  id: "00000000-0000-4000-8000-000000000031",
  summary: [
    "software engineer in early career",
    "interested in entrepreneurship and fintech/payments",
    "builds side projects and creates content online",
    "focused on career growth, mentoring, and public speaking",
    "learning about investing and wealth building",
  ],
  timezone: "America/New_York",
});

export type ProcessingStatus = z.infer<typeof processingStatusSchema>;
export type AccessLevel = z.infer<typeof accessLevelSchema>;
export type SourceMaterial = z.infer<typeof sourceMaterialSchema>;
export type LearningCard = z.infer<typeof learningCardSchema>;
export type LearningNote = z.infer<typeof learningNoteSchema>;
export type ResearchFinding = z.infer<typeof researchFindingSchema>;
export type ResearchBrief = z.infer<typeof researchBriefSchema>;
export type ContextDomain = z.infer<typeof contextDomainSchema>;
export type ContextRecordKind = z.infer<typeof contextRecordKindSchema>;
export type ContextConnection = z.infer<typeof contextConnectionSchema>;
export type ContextRecord = z.infer<typeof contextRecordSchema>;
export type ContextSnapshot = z.infer<typeof contextSnapshotSchema>;
export type LearningPersonalization = z.infer<typeof learningPersonalizationSchema>;
export type RecommendationFeedback = z.infer<typeof recommendationFeedbackSchema>;
export type LearningItem = z.infer<typeof learningItemSchema>;
export type ProcessingIssue = z.infer<typeof processingIssueSchema>;
export type Intent = z.infer<typeof intentSchema>;

export interface IngestionInput {
  sourceType: z.infer<typeof sourceTypeSchema>;
  sourceUrl: string | null;
  creator: string | null;
  sourceCaption: string | null;
  extractedVisualText: string | null;
  intent: Intent;
  mediaFile: File | null;
}

export interface ProcessingResult {
  item: LearningItem;
  duplicate: boolean;
}
