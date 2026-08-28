import { createClient } from "@supabase/supabase-js";

interface JsonRow {
  record_json: string;
}

async function records(database: D1Database, table: string, profileId: string): Promise<unknown[]> {
  const allowedTables = new Set([
    "learning_item",
    "knowledge_resource",
    "resource_engagement",
    "for_you_feedback",
    "processing_job",
  ]);
  if (!allowedTables.has(table)) throw new Error("INVALID_EXPORT_TABLE");
  const result = await database.prepare(
    `SELECT record_json FROM ${table} WHERE profile_id = ? ORDER BY updated_at DESC`,
  ).bind(profileId).all<JsonRow>();
  return result.results.map((row) => JSON.parse(row.record_json) as unknown);
}

export async function exportProfileData(database: D1Database, profileId: string) {
  const [items, resources, engagement, feedback, jobs] = await Promise.all([
    records(database, "learning_item", profileId),
    records(database, "knowledge_resource", profileId),
    records(database, "resource_engagement", profileId),
    records(database, "for_you_feedback", profileId),
    records(database, "processing_job", profileId),
  ]);
  return {
    format: "curio-account-export",
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { items, resources, engagement, feedback, processingJobs: jobs },
  };
}

export async function deleteProfileData(database: D1Database, profileId: string): Promise<number> {
  const results = await database.batch([
    database.prepare("DELETE FROM processing_job WHERE profile_id = ?").bind(profileId),
    database.prepare("DELETE FROM for_you_feedback WHERE profile_id = ?").bind(profileId),
    database.prepare("DELETE FROM resource_engagement WHERE profile_id = ?").bind(profileId),
    database.prepare("DELETE FROM knowledge_resource WHERE profile_id = ?").bind(profileId),
    database.prepare("DELETE FROM learning_item WHERE profile_id = ?").bind(profileId),
  ]);
  return results.reduce((total, result) => total + (result.meta.changes ?? 0), 0);
}

export async function deleteProfileObjects(bucket: R2Bucket, profileId: string): Promise<number> {
  const prefix = `profiles/${profileId}/`;
  let cursor: string | undefined;
  let deleted = 0;
  do {
    const listed = await bucket.list({ prefix, cursor, limit: 1_000 });
    const keys = listed.objects.map((object) => object.key).filter((key) => key.startsWith(prefix));
    if (keys.length) {
      await bucket.delete(keys);
      deleted += keys.length;
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);
  return deleted;
}

export async function deleteSupabaseUser(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const url = process.env.SUPABASE_AUTH_URL?.trim() || process.env.SUPABASE_URL?.trim() || "";
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || "";
  if (!url || !secretKey) return false;
  const client = createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) throw new Error("AUTH_ACCOUNT_DELETION_FAILED");
  return true;
}
