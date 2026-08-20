import type { BrowserWorker } from "@cloudflare/puppeteer";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiResponseHeaders, authenticateApiRequest } from "@/lib/api/access-control";
import { getLearningItemRepository } from "@/lib/data/provider";
import { learningItemSchema } from "@/lib/domain";
import { synchronizeKnowledgeResources } from "@/lib/knowledge/resources";
import { getSourceVisualStore } from "@/lib/media/source-visual-store";
import {
  canonicalInstagramReelUrl,
  CloudflareInstagramReelCapture,
  selectRepresentativeReelFrame,
} from "@/lib/retrieval/instagram-reel";

export const dynamic = "force-dynamic";

function errorResponse(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: apiResponseHeaders(request) });
}

async function browserWorker(): Promise<BrowserWorker | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as CloudflareEnv & { BROWSER?: BrowserWorker }).BROWSER ?? null;
  } catch {
    return null;
  }
}

async function authorizedItem(request: Request, id: string) {
  const viewer = await authenticateApiRequest(request);
  if (!viewer) return { response: errorResponse(request, "UNAUTHORIZED", "Sign in to Curio to continue.", 401) } as const;
  if (!z.string().uuid().safeParse(id).success) {
    return { response: errorResponse(request, "INVALID_ITEM_ID", "This source ID is invalid.", 400) } as const;
  }
  const repository = await getLearningItemRepository();
  const item = await repository.findById(viewer.profileId, id);
  if (!item) {
    return { response: errorResponse(request, "ITEM_NOT_FOUND", "This source could not be found.", 404) } as const;
  }
  return { item, repository, viewer } as const;
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const result = await authorizedItem(request, id);
    if ("response" in result) return result.response;
    if (!result.item.sourceVisual) {
      return errorResponse(request, "SOURCE_COVER_NOT_FOUND", "This source does not have a captured cover yet.", 404);
    }
    const stored = await (await getSourceVisualStore()).get(result.item.sourceVisual.objectKey);
    if (!stored) return errorResponse(request, "SOURCE_COVER_NOT_FOUND", "This source cover is unavailable.", 404);
    if (request.headers.get("if-none-match") === stored.httpEtag) {
      return new NextResponse(null, { status: 304, headers: apiResponseHeaders(request) });
    }
    const headers = new Headers(apiResponseHeaders(request));
    headers.set("Cache-Control", stored.cacheControl);
    headers.set("Content-Type", stored.contentType);
    headers.set("ETag", stored.httpEtag);
    return new Response(stored.body, { status: 200, headers });
  } catch (error) {
    console.error(JSON.stringify({ event: "source_cover_load_failed", itemId: id, errorType: error instanceof Error ? error.name : "unknown" }));
    return errorResponse(request, "SOURCE_COVER_UNAVAILABLE", "This source cover could not be loaded.", 500);
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    const result = await authorizedItem(request, id);
    if ("response" in result) return result.response;
    const refresh = new URL(request.url).searchParams.get("refresh") === "true";
    if (result.item.sourceVisual && !refresh) {
      return NextResponse.json({ ok: true, data: { sourceVisual: result.item.sourceVisual, captured: false } }, { headers: apiResponseHeaders(request) });
    }
    if (!result.item.sourceUrl || !canonicalInstagramReelUrl(result.item.sourceUrl)) {
      return errorResponse(request, "SOURCE_COVER_UNSUPPORTED", "Automatic cover capture currently supports public Instagram Reels.", 422);
    }
    const worker = await browserWorker();
    if (!worker) return errorResponse(request, "SOURCE_COVER_CAPTURE_UNAVAILABLE", "Reel cover capture is not available in this environment.", 503);

    const captured = await new CloudflareInstagramReelCapture(worker).captureCover(result.item.sourceUrl);
    const candidate = selectRepresentativeReelFrame(captured.frames);
    if (!candidate) return errorResponse(request, "SOURCE_COVER_NOT_FOUND", "Instagram did not expose a usable Reel frame.", 422);

    const visual = await (await getSourceVisualStore()).put({
      profileId: result.item.profileId,
      itemId: result.item.id,
      candidate,
      capturedAt: new Date().toISOString(),
    });
    await result.repository.save(learningItemSchema.parse({ ...result.item, sourceVisual: visual }));
    await synchronizeKnowledgeResources(await result.repository.list(result.viewer.profileId), result.repository);
    return NextResponse.json(
      { ok: true, data: { sourceVisual: visual, captured: true, refreshed: Boolean(result.item.sourceVisual) } },
      { status: result.item.sourceVisual ? 200 : 201, headers: apiResponseHeaders(request) },
    );
  } catch (error) {
    console.error(JSON.stringify({
      event: "source_cover_capture_failed",
      itemId: id,
      errorType: error instanceof Error ? error.name : "unknown",
      message: error instanceof Error ? error.message.slice(0, 240) : "Unknown cover capture failure",
    }));
    return errorResponse(request, "SOURCE_COVER_CAPTURE_FAILED", "Curio could not capture this Reel cover yet.", 500);
  }
}

export function OPTIONS(request: Request) {
  const headers = apiResponseHeaders(request);
  if (!headers) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers });
}
