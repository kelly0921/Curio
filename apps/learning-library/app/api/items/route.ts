import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { BrowserWorker } from "@cloudflare/puppeteer";
import { ZodError } from "zod";
import { OpenAILearningServices } from "@/lib/ai/services";
import { apiResponseHeaders, isApiRequestAuthorized } from "@/lib/api/access-control";
import { IngestionValidationError, MAX_REQUEST_BYTES, parseIngestionForm } from "@/lib/api/ingestion";
import { getLearningItemRepository } from "@/lib/data/provider";
import { getPersonalContextSnapshot } from "@/lib/context/provider";
import { personalizeLearningItem, personalizeLearningItems } from "@/lib/context/personalization";
import { processLearningItem } from "@/lib/processing/pipeline";
import {
  experimentalInstagramEmbedEnabled,
  InstagramPublicEmbedRetriever,
  PublicSourceRetrieverChain,
} from "@/lib/retrieval/public-source";
import {
  CloudflareInstagramReelCapture,
  InstagramFullReelRetriever,
} from "@/lib/retrieval/instagram-reel";

export const dynamic = "force-dynamic";

function errorResponse(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: apiResponseHeaders(request) });
}

function openAIServices(): OpenAILearningServices | null {
  if (!process.env.OPENAI_API_KEY?.trim()) return null;
  return new OpenAILearningServices();
}

async function cloudflareBrowserWorker(): Promise<BrowserWorker | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as CloudflareEnv & { BROWSER?: BrowserWorker }).BROWSER ?? null;
  } catch {
    // Local Next.js development does not have a Browser Rendering binding.
    return null;
  }
}

export async function GET(request: Request) {
  if (!await isApiRequestAuthorized(request)) {
    return errorResponse(request, "UNAUTHORIZED", "A valid Curio personal access token is required.", 401);
  }
  try {
    const repository = await getLearningItemRepository();
    const items = await repository.list();
    const context = await getPersonalContextSnapshot();
    return NextResponse.json(
      { ok: true, data: { items: personalizeLearningItems(items, context) } },
      { headers: apiResponseHeaders(request) },
    );
  } catch (error) {
    console.error(JSON.stringify({ event: "learning_items_list_failed", errorType: error instanceof Error ? error.name : "unknown" }));
    return errorResponse(request, "ITEMS_UNAVAILABLE", "Learning items could not be loaded.", 500);
  }
}

export function OPTIONS(request: Request) {
  const headers = apiResponseHeaders(request);
  if (!headers) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(request: Request) {
  if (!await isApiRequestAuthorized(request)) {
    return errorResponse(request, "UNAUTHORIZED", "A valid Curio personal access token is required.", 401);
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return errorResponse(request, "REQUEST_TOO_LARGE", "V0.1 accepts requests up to about 20 MB.", 413);
  }

  try {
    const input = parseIngestionForm(await request.formData());
    const repository = await getLearningItemRepository();
    const services = openAIServices();
    const browserWorker = services ? await cloudflareBrowserWorker() : null;
    const retriever = services
      ? new PublicSourceRetrieverChain([
        ...(browserWorker ? [new InstagramFullReelRetriever(
          new CloudflareInstagramReelCapture(browserWorker),
          services,
          services,
        )] : []),
        ...(experimentalInstagramEmbedEnabled() ? [new InstagramPublicEmbedRetriever(services)] : []),
        services,
      ])
      : null;
    const result = await processLearningItem(input, {
      repository,
      transcriber: services,
      retriever,
      analyzer: services,
      researcher: services,
    });
    const context = await getPersonalContextSnapshot();
    return NextResponse.json(
      { ok: true, data: { ...result, item: personalizeLearningItem(result.item, context) } },
      { status: result.duplicate ? 200 : 201, headers: apiResponseHeaders(request) },
    );
  } catch (error) {
    if (error instanceof IngestionValidationError) {
      return errorResponse(request, error.code, error.message, error.status);
    }
    console.error(JSON.stringify({
      event: "learning_item_processing_failed",
      errorType: error instanceof Error ? error.name : "unknown",
      errorMessage: error instanceof Error ? error.message : "Unknown processing error",
      validationIssues: error instanceof ZodError
        ? error.issues.map((entry) => ({ path: entry.path.join("."), code: entry.code, message: entry.message }))
        : undefined,
    }));
    return errorResponse(request, "PROCESSING_FAILED", "The item could not be processed. No unsupported claims were generated.", 500);
  }
}
