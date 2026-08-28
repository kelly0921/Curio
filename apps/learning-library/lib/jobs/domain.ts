import { z } from "zod";
import { intentSchema, sourceTypeSchema, type IngestionInput } from "../domain";

const isoDateTimeSchema = z.string().datetime({ offset: false });

export const stagedMediaSchema = z.object({
  objectKey: z.string().min(1).max(500),
  name: z.string().min(1).max(240),
  type: z.string().min(1).max(160),
  size: z.number().int().positive().max(20 * 1024 * 1024),
}).strict();

export const processingJobInputSchema = z.object({
  sourceType: sourceTypeSchema,
  sourceUrl: z.string().url().max(2_000).nullable(),
  creator: z.string().max(200).nullable(),
  sourceCaption: z.string().max(12_000).nullable(),
  extractedVisualText: z.string().max(20_000).nullable(),
  intent: intentSchema,
  publicMediaUrls: z.array(z.string().url().max(4_000)).max(30).default([]),
  stagedMedia: stagedMediaSchema.nullable(),
}).strict();

export const processingJobStatusSchema = z.enum(["queued", "processing", "ready", "failed"]);

export const processingJobErrorSchema = z.object({
  code: z.string().min(1).max(80),
  message: z.string().min(1).max(300),
  recoverable: z.boolean(),
}).strict();

export const processingJobSchema = z.object({
  id: z.string().uuid(),
  profileId: z.string().uuid(),
  idempotencyKey: z.string().min(1).max(128),
  status: processingJobStatusSchema,
  input: processingJobInputSchema,
  itemId: z.string().uuid().nullable(),
  resourceId: z.string().uuid().nullable(),
  attempts: z.number().int().min(0).max(100),
  error: processingJobErrorSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
}).strict();

export const processingJobMessageSchema = z.object({
  jobId: z.string().uuid(),
  profileId: z.string().uuid(),
}).strict();

export type StagedMedia = z.infer<typeof stagedMediaSchema>;
export type ProcessingJobInput = z.infer<typeof processingJobInputSchema>;
export type ProcessingJobStatus = z.infer<typeof processingJobStatusSchema>;
export type ProcessingJobError = z.infer<typeof processingJobErrorSchema>;
export type ProcessingJob = z.infer<typeof processingJobSchema>;
export type ProcessingJobMessage = z.infer<typeof processingJobMessageSchema>;

export function processingJobReceipt(job: ProcessingJob) {
  return {
    id: job.id,
    status: job.status,
    itemId: job.itemId,
    resourceId: job.resourceId,
    attempts: job.attempts,
    error: job.error,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}

export function serializableJobInput(input: IngestionInput, stagedMedia: StagedMedia | null): ProcessingJobInput {
  return processingJobInputSchema.parse({
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl,
    creator: input.creator,
    sourceCaption: input.sourceCaption,
    extractedVisualText: input.extractedVisualText,
    intent: input.intent,
    publicMediaUrls: input.publicMediaUrls ?? [],
    stagedMedia,
  });
}

export function ingestionInputFromJob(input: ProcessingJobInput, mediaFile: File | null): IngestionInput {
  return {
    sourceType: input.sourceType,
    sourceUrl: input.sourceUrl,
    creator: input.creator,
    sourceCaption: input.sourceCaption,
    extractedVisualText: input.extractedVisualText,
    intent: input.intent,
    publicMediaUrls: input.publicMediaUrls,
    mediaFile,
  };
}
