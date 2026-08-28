import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { apiAuthenticationMode } from "@/lib/api/access-control";
import { persistenceConfiguration } from "@/lib/data/provider";

export const dynamic = "force-dynamic";

async function processingReadiness() {
  try {
    const { env } = await getCloudflareContext({ async: true });
    await env.CURIO_DB.prepare("SELECT 1 AS ready").first();
    return {
      database: true,
      queue: Boolean(env.CURIO_PROCESSING_QUEUE),
      objectStorage: Boolean(env.CURIO_SOURCE_MEDIA),
      mode: env.CURIO_PROCESSING_QUEUE ? "durable_queue" : "synchronous",
    } as const;
  } catch {
    return { database: false, queue: false, objectStorage: false, mode: "synchronous" } as const;
  }
}

export async function GET() {
  const persistence = await persistenceConfiguration();
  const processing = await processingReadiness();
  const ready = persistence.mode !== "invalid"
    && (persistence.mode !== "d1" || (processing.database && processing.queue && processing.objectStorage));
  return NextResponse.json({
    ok: ready,
    data: {
      service: "curio-processor",
      authentication: apiAuthenticationMode(),
      openAIConfigured: Boolean(process.env.OPENAI_API_KEY?.trim()),
      persistence,
      processing,
      uploadBoundary: "r2-staged-small-file-v1",
    },
  }, {
    status: ready ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
