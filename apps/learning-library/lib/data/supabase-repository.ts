import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { learningItemSchema, type LearningItem } from "../domain";
import type { LearningItemRepository } from "./repository";

interface LearningItemRow {
  id: string;
  source_fingerprint: string;
  record_json: unknown;
}

export function createSupabaseServerFetch(secretKey: string, fetchImpl: typeof fetch = fetch): typeof fetch {
  const isOpaqueApiKey = secretKey.startsWith("sb_secret_") || secretKey.startsWith("sb_publishable_");
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    const authorization = headers.get("Authorization");
    if (isOpaqueApiKey && authorization && /^Bearer\s+sb_(?:secret|publishable)_/i.test(authorization)) {
      headers.delete("Authorization");
    }
    return fetchImpl(input, { ...init, headers });
  };
}

export class SupabaseLearningItemRepository implements LearningItemRepository {
  private readonly client: SupabaseClient;

  constructor(url: string, secretKey: string) {
    this.client = createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
      global: { fetch: createSupabaseServerFetch(secretKey) },
    });
  }

  async list(): Promise<LearningItem[]> {
    const result = await this.client
      .from("learning_item")
      .select("id,source_fingerprint,record_json")
      .order("created_at", { ascending: false });
    if (result.error) throw new Error(`Supabase list learning items failed: ${result.error.message}`);
    return ((result.data ?? []) as LearningItemRow[]).map((row) => learningItemSchema.parse(row.record_json));
  }

  async findByFingerprint(fingerprint: string): Promise<LearningItem | null> {
    const result = await this.client
      .from("learning_item")
      .select("id,source_fingerprint,record_json")
      .eq("source_fingerprint", fingerprint)
      .maybeSingle();
    if (result.error) throw new Error(`Supabase find duplicate failed: ${result.error.message}`);
    const row = result.data as LearningItemRow | null;
    return row ? learningItemSchema.parse(row.record_json) : null;
  }

  async save(item: LearningItem): Promise<LearningItem> {
    const validated = learningItemSchema.parse(item);
    const result = await this.client.from("learning_item").upsert({
      id: validated.id,
      profile_id: validated.profileId,
      source_url: validated.sourceUrl,
      platform: validated.platform,
      source_type: validated.sourceType,
      source_fingerprint: validated.sourceFingerprint,
      creator: validated.creator,
      processing_status: validated.processingStatus,
      access_level: validated.accessLevel,
      intent: validated.intent,
      generated_title: validated.card?.title ?? null,
      primary_topic: validated.card?.primaryTopic ?? null,
      content_type: validated.card?.contentType ?? null,
      requires_verification: (validated.card?.claimsToVerify.length ?? 0) > 0,
      record_json: validated,
      created_at: validated.createdAt,
      updated_at: validated.updatedAt,
    }, { onConflict: "id" }).select("record_json").single();
    if (result.error) throw new Error(`Supabase save learning item failed: ${result.error.message}`);
    return learningItemSchema.parse(result.data.record_json);
  }
}
