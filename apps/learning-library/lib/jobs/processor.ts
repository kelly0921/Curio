import type { BrowserWorker } from "@cloudflare/puppeteer";
import { OpenAILearningServices } from "../ai/services";
import { D1LearningItemRepository } from "../data/d1-repository";
import { upsertKnowledgeResourceForItem } from "../knowledge/resources";
import { sourceVisualStoreFromBucket } from "../media/source-visual-store";
import { logCurioEvent } from "../observability";
import { processLearningItem } from "../processing/pipeline";
import {
  CloudflareInstagramReelCapture,
  InstagramFullReelRetriever,
} from "../retrieval/instagram-reel";
import {
  experimentalInstagramEmbedEnabled,
  InstagramPublicEmbedRetriever,
  PublicSourceRetrieverChain,
} from "../retrieval/public-source";
import { ingestionInputFromJob, processingJobMessageSchema, type ProcessingJobMessage } from "./domain";
import { R2ProcessingMediaStore } from "./media-store";
import { D1ProcessingJobRepository } from "./repository";

const MAX_JOB_ATTEMPTS = 5;
const STALE_JOB_MS = 10 * 60 * 1_000;

function safeFailure(error: unknown): { code: string; message: string; recoverable: boolean } {
  const code = error instanceof Error ? error.message : "";
  if (code === "STAGED_MEDIA_NOT_FOUND" || code === "STAGED_MEDIA_SIZE_MISMATCH") {
    return {
      code,
      message: "The uploaded source is no longer available. Add it again to retry.",
      recoverable: false,
    };
  }
  return {
    code: "PROCESSING_TEMPORARILY_UNAVAILABLE",
    message: "Curio could not finish this source yet. Retry when you’re ready.",
    recoverable: true,
  };
}

function retryDelaySeconds(attempt: number): number {
  return Math.min(900, 30 * (2 ** Math.max(0, attempt - 1)));
}

async function processMessage(
  message: Message<ProcessingJobMessage>,
  env: CloudflareEnv,
): Promise<void> {
  const parsed = processingJobMessageSchema.safeParse(message.body);
  if (!parsed.success) {
    logCurioEvent({ event: "processing_message_rejected", errorCode: "INVALID_QUEUE_MESSAGE" }, "error");
    message.ack();
    return;
  }

  const jobs = new D1ProcessingJobRepository(env.CURIO_DB);
  const now = new Date();
  const claimed = await jobs.claim(
    parsed.data.profileId,
    parsed.data.jobId,
    now.toISOString(),
    new Date(now.getTime() - STALE_JOB_MS).toISOString(),
  );
  if (!claimed) {
    const current = await jobs.findById(parsed.data.profileId, parsed.data.jobId);
    if (!current || current.status === "ready" || current.status === "failed") message.ack();
    else message.retry({ delaySeconds: 600 });
    return;
  }

  const startedAt = Date.now();
  logCurioEvent({ event: "processing_job_started", jobId: claimed.id, attempt: claimed.attempts });
  const mediaStore = new R2ProcessingMediaStore(env.CURIO_SOURCE_MEDIA);
  try {
    const mediaFile = claimed.input.stagedMedia ? await mediaStore.load(claimed.input.stagedMedia) : null;
    const input = ingestionInputFromJob(claimed.input, mediaFile);
    const repository = new D1LearningItemRepository(env.CURIO_DB);
    const services = new OpenAILearningServices({ apiKey: env.OPENAI_API_KEY });
    const retriever = new PublicSourceRetrieverChain([
      new InstagramFullReelRetriever(
        new CloudflareInstagramReelCapture(env.BROWSER as BrowserWorker),
        services,
        services,
      ),
      ...(experimentalInstagramEmbedEnabled() ? [new InstagramPublicEmbedRetriever(services)] : []),
      services,
    ]);
    const result = await processLearningItem(input, {
      profileId: claimed.profileId,
      repository,
      transcriber: services,
      retriever,
      analyzer: services,
      researcher: services,
      sourceVisualStore: sourceVisualStoreFromBucket(env.CURIO_SOURCE_MEDIA),
    });
    const resourceMerger = process.env.RESOURCE_MERGE_AI_ENABLED === "true" ? services : null;
    const resourceUpdate = result.item.card && (!result.duplicate || result.item.resourceIds.length === 0)
      ? await upsertKnowledgeResourceForItem(result.item, repository, { merger: resourceMerger })
      : null;
    const item = resourceUpdate?.item ?? result.item;
    await jobs.markReady(claimed, item.id, resourceUpdate?.resource.id ?? item.resourceIds[0] ?? null, new Date().toISOString());
    try {
      await mediaStore.remove(claimed.input.stagedMedia);
    } catch {
      logCurioEvent({ event: "processing_media_cleanup_failed", jobId: claimed.id, errorCode: "R2_DELETE_FAILED" }, "warn");
    }
    logCurioEvent({
      event: "processing_job_completed",
      jobId: claimed.id,
      status: "ready",
      attempt: claimed.attempts,
      durationMs: Date.now() - startedAt,
    });
    message.ack();
  } catch (error) {
    const failure = safeFailure(error);
    const exhausted = !failure.recoverable || claimed.attempts >= MAX_JOB_ATTEMPTS;
    if (exhausted) {
      await jobs.markFailed(claimed, { ...failure, recoverable: false }, new Date().toISOString());
      try {
        await mediaStore.remove(claimed.input.stagedMedia);
      } catch {
        logCurioEvent({ event: "processing_media_cleanup_failed", jobId: claimed.id, errorCode: "R2_DELETE_FAILED" }, "warn");
      }
      message.ack();
    } else {
      await jobs.markQueued(claimed, failure, new Date().toISOString());
      message.retry({ delaySeconds: retryDelaySeconds(claimed.attempts) });
    }
    logCurioEvent({
      event: exhausted ? "processing_job_failed" : "processing_job_retry_scheduled",
      jobId: claimed.id,
      status: exhausted ? "failed" : "queued",
      errorCode: failure.code,
      attempt: claimed.attempts,
      durationMs: Date.now() - startedAt,
    }, exhausted ? "error" : "warn");
  }
}

export async function consumeProcessingQueue(
  batch: MessageBatch<ProcessingJobMessage>,
  env: CloudflareEnv,
): Promise<void> {
  await Promise.all(batch.messages.map((message) => processMessage(message, env)));
}
