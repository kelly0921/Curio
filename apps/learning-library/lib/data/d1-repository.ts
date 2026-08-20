import {
  forYouFeedbackSchema,
  knowledgeResourceSchema,
  learningItemSchema,
  resourceEngagementSchema,
  type ForYouFeedback,
  type KnowledgeResource,
  type LearningItem,
  type ResourceEngagement,
} from "../domain";
import type { CurioRepository } from "./repository";

interface LearningItemRow {
  record_json: string;
}

function parseRow(row: LearningItemRow): LearningItem {
  return learningItemSchema.parse(JSON.parse(row.record_json));
}

function parseResourceRow(row: LearningItemRow): KnowledgeResource {
  return knowledgeResourceSchema.parse(JSON.parse(row.record_json));
}

function parseEngagementRow(row: LearningItemRow): ResourceEngagement {
  return resourceEngagementSchema.parse(JSON.parse(row.record_json));
}

function parseForYouFeedbackRow(row: LearningItemRow): ForYouFeedback {
  return forYouFeedbackSchema.parse(JSON.parse(row.record_json));
}

function scopedFingerprint(profileId: string, fingerprint: string): string {
  return `${profileId}:${fingerprint}`;
}

export class D1LearningItemRepository implements CurioRepository {
  constructor(private readonly database: D1Database) {}

  async list(profileId: string): Promise<LearningItem[]> {
    const result = await this.database
      .prepare("SELECT record_json FROM learning_item WHERE profile_id = ? ORDER BY created_at DESC")
      .bind(profileId)
      .all<LearningItemRow>();
    return result.results.map(parseRow);
  }

  async findById(profileId: string, id: string): Promise<LearningItem | null> {
    const row = await this.database
      .prepare("SELECT record_json FROM learning_item WHERE profile_id = ? AND id = ? LIMIT 1")
      .bind(profileId, id)
      .first<LearningItemRow>();
    return row ? parseRow(row) : null;
  }

  async findByFingerprint(profileId: string, fingerprint: string): Promise<LearningItem | null> {
    const row = await this.database
      .prepare("SELECT record_json FROM learning_item WHERE profile_id = ? AND source_fingerprint = ? LIMIT 1")
      .bind(profileId, scopedFingerprint(profileId, fingerprint))
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
      scopedFingerprint(validated.profileId, validated.sourceFingerprint),
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

  async listResources(profileId: string): Promise<KnowledgeResource[]> {
    const result = await this.database
      .prepare("SELECT record_json FROM knowledge_resource WHERE profile_id = ? ORDER BY updated_at DESC")
      .bind(profileId)
      .all<LearningItemRow>();
    return result.results.map(parseResourceRow);
  }

  async findResourceById(profileId: string, id: string): Promise<KnowledgeResource | null> {
    const row = await this.database
      .prepare("SELECT record_json FROM knowledge_resource WHERE profile_id = ? AND id = ? LIMIT 1")
      .bind(profileId, id)
      .first<LearningItemRow>();
    return row ? parseResourceRow(row) : null;
  }

  async saveResource(resource: KnowledgeResource): Promise<KnowledgeResource> {
    const validated = knowledgeResourceSchema.parse(resource);
    await this.database.prepare(`
      INSERT INTO knowledge_resource (
        id, profile_id, resource_type, domain, canonical_topic, title,
        source_count, record_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        profile_id = excluded.profile_id,
        resource_type = excluded.resource_type,
        domain = excluded.domain,
        canonical_topic = excluded.canonical_topic,
        title = excluded.title,
        source_count = excluded.source_count,
        record_json = excluded.record_json,
        updated_at = excluded.updated_at
    `).bind(
      validated.id,
      validated.profileId,
      validated.resourceType,
      validated.domain,
      validated.canonicalTopic,
      validated.title,
      validated.sourceItemIds.length,
      JSON.stringify(validated),
      validated.createdAt,
      validated.updatedAt,
    ).run();
    return validated;
  }

  async listResourceEngagement(profileId: string): Promise<ResourceEngagement[]> {
    const result = await this.database
      .prepare("SELECT record_json FROM resource_engagement WHERE profile_id = ?")
      .bind(profileId)
      .all<LearningItemRow>();
    return result.results.map(parseEngagementRow);
  }

  async findResourceEngagement(profileId: string, resourceId: string): Promise<ResourceEngagement | null> {
    const row = await this.database
      .prepare("SELECT record_json FROM resource_engagement WHERE profile_id = ? AND resource_id = ? LIMIT 1")
      .bind(profileId, resourceId)
      .first<LearningItemRow>();
    return row ? parseEngagementRow(row) : null;
  }

  async saveResourceEngagement(engagement: ResourceEngagement): Promise<ResourceEngagement> {
    const validated = resourceEngagementSchema.parse(engagement);
    await this.database.prepare(`
      INSERT INTO resource_engagement (profile_id, resource_id, record_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(profile_id, resource_id) DO UPDATE SET
        record_json = excluded.record_json,
        updated_at = excluded.updated_at
    `).bind(
      validated.profileId,
      validated.resourceId,
      JSON.stringify(validated),
      validated.updatedAt,
    ).run();
    return validated;
  }

  async listForYouFeedback(profileId: string): Promise<ForYouFeedback[]> {
    const result = await this.database
      .prepare("SELECT record_json FROM for_you_feedback WHERE profile_id = ?")
      .bind(profileId)
      .all<LearningItemRow>();
    return result.results.map(parseForYouFeedbackRow);
  }

  async saveForYouFeedback(feedback: ForYouFeedback): Promise<ForYouFeedback> {
    const validated = forYouFeedbackSchema.parse(feedback);
    await this.database.prepare(`
      INSERT INTO for_you_feedback (
        profile_id, recommendation_id, resource_id, lane, state, revisit_at, record_json, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(profile_id, recommendation_id) DO UPDATE SET
        resource_id = excluded.resource_id,
        lane = excluded.lane,
        state = excluded.state,
        revisit_at = excluded.revisit_at,
        record_json = excluded.record_json,
        updated_at = excluded.updated_at
    `).bind(
      validated.profileId,
      validated.recommendationId,
      validated.resourceId,
      validated.lane,
      validated.state,
      validated.revisitAt,
      JSON.stringify(validated),
      validated.updatedAt,
    ).run();
    return validated;
  }
}
