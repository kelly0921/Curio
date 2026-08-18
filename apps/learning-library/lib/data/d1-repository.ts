import { learningItemSchema, type LearningItem } from "../domain";
import type { LearningItemRepository } from "./repository";

interface LearningItemRow {
  record_json: string;
}

function parseRow(row: LearningItemRow): LearningItem {
  return learningItemSchema.parse(JSON.parse(row.record_json));
}

export class D1LearningItemRepository implements LearningItemRepository {
  constructor(private readonly database: D1Database) {}

  async list(): Promise<LearningItem[]> {
    const result = await this.database
      .prepare("SELECT record_json FROM learning_item ORDER BY created_at DESC")
      .all<LearningItemRow>();
    return result.results.map(parseRow);
  }

  async findById(id: string): Promise<LearningItem | null> {
    const row = await this.database
      .prepare("SELECT record_json FROM learning_item WHERE id = ? LIMIT 1")
      .bind(id)
      .first<LearningItemRow>();
    return row ? parseRow(row) : null;
  }

  async findByFingerprint(fingerprint: string): Promise<LearningItem | null> {
    const row = await this.database
      .prepare("SELECT record_json FROM learning_item WHERE source_fingerprint = ? LIMIT 1")
      .bind(fingerprint)
      .first<LearningItemRow>();
    return row ? parseRow(row) : null;
  }

  async save(item: LearningItem): Promise<LearningItem> {
    const validated = learningItemSchema.parse(item);
    await this.database.prepare(`
      INSERT INTO learning_item (
        id, profile_id, source_url, platform, source_type, source_fingerprint,
        creator, processing_status, access_level, intent, generated_title,
        primary_topic, content_type, requires_verification, record_json,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        profile_id = excluded.profile_id,
        source_url = excluded.source_url,
        platform = excluded.platform,
        source_type = excluded.source_type,
        source_fingerprint = excluded.source_fingerprint,
        creator = excluded.creator,
        processing_status = excluded.processing_status,
        access_level = excluded.access_level,
        intent = excluded.intent,
        generated_title = excluded.generated_title,
        primary_topic = excluded.primary_topic,
        content_type = excluded.content_type,
        requires_verification = excluded.requires_verification,
        record_json = excluded.record_json,
        updated_at = excluded.updated_at
    `).bind(
      validated.id,
      validated.profileId,
      validated.sourceUrl,
      validated.platform,
      validated.sourceType,
      validated.sourceFingerprint,
      validated.creator,
      validated.processingStatus,
      validated.accessLevel,
      validated.intent,
      validated.card?.title ?? null,
      validated.card?.primaryTopic ?? null,
      validated.card?.contentType ?? null,
      validated.card?.claimsToVerify.length ? 1 : 0,
      JSON.stringify(validated),
      validated.createdAt,
      validated.updatedAt,
    ).run();
    return validated;
  }
}
