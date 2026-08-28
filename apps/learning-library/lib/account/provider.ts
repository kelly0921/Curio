import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function accountStorage(): Promise<{ database: D1Database; bucket: R2Bucket } | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    if (!env.CURIO_DB || !env.CURIO_SOURCE_MEDIA) return null;
    return { database: env.CURIO_DB, bucket: env.CURIO_SOURCE_MEDIA };
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Curio account storage bindings are unavailable.", { cause: error });
    }
    return null;
  }
}
