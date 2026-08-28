import { describe, expect, it } from "vitest";
import {
  ingestionInputFromJob,
  processingJobReceipt,
  serializableJobInput,
} from "@/lib/jobs/domain";
import { MemoryProcessingJobRepository } from "@/lib/jobs/repository";

const profileId = "00000000-0000-4000-8000-000000000042";
const jobId = "00000000-0000-4000-8000-000000000043";
const createdAt = "2026-08-28T12:00:00.000Z";

function jobInput() {
  return serializableJobInput({
    sourceType: "instagram_url",
    sourceUrl: "https://www.instagram.com/reel/example/",
    creator: null,
    sourceCaption: null,
    extractedVisualText: null,
    intent: "remember",
    mediaFile: null,
    publicMediaUrls: [],
  }, null);
}

describe("processing jobs", () => {
  it("claims one queued job once and keeps attempts durable", async () => {
    const repository = new MemoryProcessingJobRepository();
    const created = await repository.create({
      id: jobId,
      profileId,
      idempotencyKey: "a".repeat(64),
      jobInput: jobInput(),
      now: createdAt,
    });
    const claimed = await repository.claim(
      profileId,
      jobId,
      "2026-08-28T12:01:00.000Z",
      "2026-08-28T11:51:00.000Z",
    );

    expect(created.status).toBe("queued");
    expect(claimed).toMatchObject({ status: "processing", attempts: 1 });
    await expect(repository.claim(
      profileId,
      jobId,
      "2026-08-28T12:02:00.000Z",
      "2026-08-28T11:52:00.000Z",
    )).resolves.toBeNull();
  });

  it("resets terminal timestamps when a recoverable job is queued again", async () => {
    const repository = new MemoryProcessingJobRepository();
    const created = await repository.create({
      id: jobId,
      profileId,
      idempotencyKey: "b".repeat(64),
      jobInput: jobInput(),
      now: createdAt,
    });
    const failed = await repository.markFailed(created, {
      code: "QUEUE_UNAVAILABLE",
      message: "Retry later.",
      recoverable: true,
    }, "2026-08-28T12:02:00.000Z");
    const queued = await repository.markQueued(failed, null, "2026-08-28T12:03:00.000Z");

    expect(queued).toMatchObject({ status: "queued", error: null, startedAt: null, completedAt: null });
  });

  it("returns a status receipt without source contents or profile identity", async () => {
    const repository = new MemoryProcessingJobRepository();
    const job = await repository.create({
      id: jobId,
      profileId,
      idempotencyKey: "c".repeat(64),
      jobInput: jobInput(),
      now: createdAt,
    });

    const receipt = processingJobReceipt(job);
    expect(receipt).toMatchObject({ id: jobId, status: "queued", attempts: 0 });
    expect(receipt).not.toHaveProperty("input");
    expect(receipt).not.toHaveProperty("profileId");
    expect(receipt).not.toHaveProperty("idempotencyKey");
  });

  it("reconstructs an ingestion input only after staged media is loaded", () => {
    const file = new File(["audio"], "source.mp3", { type: "audio/mpeg" });
    const input = ingestionInputFromJob(jobInput(), file);
    expect(input.mediaFile).toBe(file);
    expect(input.sourceUrl).toBe("https://www.instagram.com/reel/example/");
  });
});
