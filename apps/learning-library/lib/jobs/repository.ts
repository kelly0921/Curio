import {
  processingJobSchema,
  type ProcessingJob,
  type ProcessingJobError,
  type ProcessingJobInput,
} from "./domain";

interface ProcessingJobRow {
  record_json: string;
}

function parseRow(row: ProcessingJobRow): ProcessingJob {
  return processingJobSchema.parse(JSON.parse(row.record_json));
}

export interface ProcessingJobRepository {
  findById(profileId: string, id: string): Promise<ProcessingJob | null>;
  findByIdempotencyKey(profileId: string, key: string): Promise<ProcessingJob | null>;
  listRecent(profileId: string, limit?: number): Promise<ProcessingJob[]>;
  create(input: { id: string; profileId: string; idempotencyKey: string; jobInput: ProcessingJobInput; now: string }): Promise<ProcessingJob>;
  claim(profileId: string, id: string, now: string, staleBefore: string): Promise<ProcessingJob | null>;
  markQueued(job: ProcessingJob, error: ProcessingJobError | null, now: string): Promise<ProcessingJob>;
  markReady(job: ProcessingJob, itemId: string, resourceId: string | null, now: string): Promise<ProcessingJob>;
  markFailed(job: ProcessingJob, error: ProcessingJobError, now: string): Promise<ProcessingJob>;
}

function newJob(input: {
  id: string;
  profileId: string;
  idempotencyKey: string;
  jobInput: ProcessingJobInput;
  now: string;
}): ProcessingJob {
  return processingJobSchema.parse({
    id: input.id,
    profileId: input.profileId,
    idempotencyKey: input.idempotencyKey,
    status: "queued",
    input: input.jobInput,
    itemId: null,
    resourceId: null,
    attempts: 0,
    error: null,
    createdAt: input.now,
    updatedAt: input.now,
    startedAt: null,
    completedAt: null,
  });
}

export class D1ProcessingJobRepository implements ProcessingJobRepository {
  constructor(private readonly database: D1Database) {}

  async findById(profileId: string, id: string): Promise<ProcessingJob | null> {
    const row = await this.database.prepare(
      "SELECT record_json FROM processing_job WHERE profile_id = ? AND id = ? LIMIT 1",
    ).bind(profileId, id).first<ProcessingJobRow>();
    return row ? parseRow(row) : null;
  }

  async findByIdempotencyKey(profileId: string, key: string): Promise<ProcessingJob | null> {
    const row = await this.database.prepare(
      "SELECT record_json FROM processing_job WHERE profile_id = ? AND idempotency_key = ? LIMIT 1",
    ).bind(profileId, key).first<ProcessingJobRow>();
    return row ? parseRow(row) : null;
  }

  async listRecent(profileId: string, limit = 20): Promise<ProcessingJob[]> {
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));
    const result = await this.database.prepare(
      "SELECT record_json FROM processing_job WHERE profile_id = ? ORDER BY created_at DESC LIMIT ?",
    ).bind(profileId, safeLimit).all<ProcessingJobRow>();
    return result.results.map(parseRow);
  }

  async create(input: {
    id: string;
    profileId: string;
    idempotencyKey: string;
    jobInput: ProcessingJobInput;
    now: string;
  }): Promise<ProcessingJob> {
    const job = newJob(input);
    await this.save(job, true);
    return job;
  }

  async claim(profileId: string, id: string, now: string, staleBefore: string): Promise<ProcessingJob | null> {
    const current = await this.findById(profileId, id);
    if (!current) return null;
    const claimed = processingJobSchema.parse({
      ...current,
      status: "processing",
      attempts: current.attempts + 1,
      error: null,
      startedAt: now,
      completedAt: null,
      updatedAt: now,
    });
    const result = await this.database.prepare(`
      UPDATE processing_job
      SET status = 'processing', attempts = ?, error_code = NULL, error_message = NULL,
          started_at = ?, completed_at = NULL, updated_at = ?, record_json = ?
      WHERE profile_id = ? AND id = ?
        AND (status = 'queued' OR (status = 'processing' AND updated_at < ?))
    `).bind(
      claimed.attempts,
      claimed.startedAt,
      claimed.updatedAt,
      JSON.stringify(claimed),
      profileId,
      id,
      staleBefore,
    ).run();
    return result.meta.changes === 1 ? claimed : null;
  }

  async markQueued(job: ProcessingJob, error: ProcessingJobError | null, now: string): Promise<ProcessingJob> {
    return this.save(processingJobSchema.parse({
      ...job,
      status: "queued",
      error,
      startedAt: null,
      completedAt: null,
      updatedAt: now,
    }));
  }

  async markReady(job: ProcessingJob, itemId: string, resourceId: string | null, now: string): Promise<ProcessingJob> {
    return this.save(processingJobSchema.parse({
      ...job,
      status: "ready",
      itemId,
      resourceId,
      error: null,
      completedAt: now,
      updatedAt: now,
    }));
  }

  async markFailed(job: ProcessingJob, error: ProcessingJobError, now: string): Promise<ProcessingJob> {
    return this.save(processingJobSchema.parse({
      ...job,
      status: "failed",
      error,
      completedAt: now,
      updatedAt: now,
    }));
  }

  private async save(job: ProcessingJob, insertOnly = false): Promise<ProcessingJob> {
    const validated = processingJobSchema.parse(job);
    const statement = insertOnly ? `
      INSERT INTO processing_job (
        id, profile_id, idempotency_key, status, attempts, item_id, resource_id,
        error_code, error_message, record_json, created_at, updated_at, started_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ` : `
      UPDATE processing_job SET
        status = ?, attempts = ?, item_id = ?, resource_id = ?, error_code = ?, error_message = ?,
        record_json = ?, updated_at = ?, started_at = ?, completed_at = ?
      WHERE profile_id = ? AND id = ?
    `;
    if (insertOnly) {
      await this.database.prepare(statement).bind(
        validated.id,
        validated.profileId,
        validated.idempotencyKey,
        validated.status,
        validated.attempts,
        validated.itemId,
        validated.resourceId,
        validated.error?.code ?? null,
        validated.error?.message ?? null,
        JSON.stringify(validated),
        validated.createdAt,
        validated.updatedAt,
        validated.startedAt,
        validated.completedAt,
      ).run();
    } else {
      await this.database.prepare(statement).bind(
        validated.status,
        validated.attempts,
        validated.itemId,
        validated.resourceId,
        validated.error?.code ?? null,
        validated.error?.message ?? null,
        JSON.stringify(validated),
        validated.updatedAt,
        validated.startedAt,
        validated.completedAt,
        validated.profileId,
        validated.id,
      ).run();
    }
    return validated;
  }
}

export class MemoryProcessingJobRepository implements ProcessingJobRepository {
  private readonly jobs = new Map<string, ProcessingJob>();

  async findById(profileId: string, id: string): Promise<ProcessingJob | null> {
    const job = this.jobs.get(id);
    return job?.profileId === profileId ? job : null;
  }

  async findByIdempotencyKey(profileId: string, key: string): Promise<ProcessingJob | null> {
    return [...this.jobs.values()].find((job) => job.profileId === profileId && job.idempotencyKey === key) ?? null;
  }

  async listRecent(profileId: string, limit = 20): Promise<ProcessingJob[]> {
    return [...this.jobs.values()]
      .filter((job) => job.profileId === profileId)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, limit);
  }

  async create(input: {
    id: string;
    profileId: string;
    idempotencyKey: string;
    jobInput: ProcessingJobInput;
    now: string;
  }): Promise<ProcessingJob> {
    const duplicate = await this.findByIdempotencyKey(input.profileId, input.idempotencyKey);
    if (duplicate) throw new Error("PROCESSING_JOB_ALREADY_EXISTS");
    const job = newJob(input);
    this.jobs.set(job.id, job);
    return job;
  }

  async claim(profileId: string, id: string, now: string, staleBefore: string): Promise<ProcessingJob | null> {
    const job = await this.findById(profileId, id);
    if (!job || (job.status !== "queued" && !(job.status === "processing" && job.updatedAt < staleBefore))) return null;
    const claimed = processingJobSchema.parse({
      ...job,
      status: "processing",
      attempts: job.attempts + 1,
      error: null,
      startedAt: now,
      completedAt: null,
      updatedAt: now,
    });
    this.jobs.set(id, claimed);
    return claimed;
  }

  async markQueued(job: ProcessingJob, error: ProcessingJobError | null, now: string): Promise<ProcessingJob> {
    return this.set(processingJobSchema.parse({
      ...job,
      status: "queued",
      error,
      startedAt: null,
      completedAt: null,
      updatedAt: now,
    }));
  }

  async markReady(job: ProcessingJob, itemId: string, resourceId: string | null, now: string): Promise<ProcessingJob> {
    return this.set(processingJobSchema.parse({
      ...job,
      status: "ready",
      itemId,
      resourceId,
      error: null,
      completedAt: now,
      updatedAt: now,
    }));
  }

  async markFailed(job: ProcessingJob, error: ProcessingJobError, now: string): Promise<ProcessingJob> {
    return this.set(processingJobSchema.parse({ ...job, status: "failed", error, completedAt: now, updatedAt: now }));
  }

  private set(job: ProcessingJob): ProcessingJob {
    this.jobs.set(job.id, job);
    return job;
  }
}
