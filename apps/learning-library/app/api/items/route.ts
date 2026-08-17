import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { OpenAILearningServices } from "@/lib/ai/services";
import { IngestionValidationError, MAX_REQUEST_BYTES, parseIngestionForm } from "@/lib/api/ingestion";
import { developmentAppOrigin, isSameOriginRequest } from "@/lib/api/same-origin";
import { getLearningItemRepository } from "@/lib/data/provider";
import { getPersonalContextSnapshot } from "@/lib/context/provider";
import { personalizeLearningItem, personalizeLearningItems } from "@/lib/context/personalization";
import { processLearningItem } from "@/lib/processing/pipeline";
import {
  experimentalInstagramEmbedEnabled,
  InstagramPublicEmbedRetriever,
  PublicSourceRetrieverChain,
} from "@/lib/retrieval/public-source";

export const dynamic = "force-dynamic";

function responseHeaders(request: Request): HeadersInit | undefined {
  const origin = developmentAppOrigin(request);
  if (!origin) return undefined;
  return {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
  };
}

function errorResponse(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: responseHeaders(request) });
}

function openAIServices(): OpenAILearningServices | null {
  if (!process.env.OPENAI_API_KEY?.trim()) return null;
  return new OpenAILearningServices();
}

export async function GET(request: Request) {
  try {
    const items = await getLearningItemRepository().list();
    const context = await getPersonalContextSnapshot();
    return NextResponse.json(
      { ok: true, data: { items: personalizeLearningItems(items, context) } },
      { headers: responseHeaders(request) },
    );
  } catch (error) {
    console.error(JSON.stringify({ event: "learning_items_list_failed", errorType: error instanceof Error ? error.name : "unknown" }));
    return errorResponse(request, "ITEMS_UNAVAILABLE", "Learning items could not be loaded.", 500);
  }
}

export function OPTIONS(request: Request) {
  const headers = responseHeaders(request);
  if (!headers) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers });
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request) && !developmentAppOrigin(request)) {
    return errorResponse(request, "CROSS_ORIGIN_REQUEST", "Cross-origin submissions are not allowed.", 403);
  }
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return errorResponse(request, "REQUEST_TOO_LARGE", "V0.1 accepts requests up to about 20 MB.", 413);
  }

  try {
    const input = parseIngestionForm(await request.formData());
    const services = openAIServices();
    const retriever = services
      ? new PublicSourceRetrieverChain([
        ...(experimentalInstagramEmbedEnabled() ? [new InstagramPublicEmbedRetriever(services)] : []),
        services,
      ])
      : null;
    const result = await processLearningItem(input, {
      repository: getLearningItemRepository(),
      transcriber: services,
      retriever,
      analyzer: services,
      researcher: services,
    });
    const context = await getPersonalContextSnapshot();
    return NextResponse.json(
      { ok: true, data: { ...result, item: personalizeLearningItem(result.item, context) } },
      { status: result.duplicate ? 200 : 201, headers: responseHeaders(request) },
    );
  } catch (error) {
    if (error instanceof IngestionValidationError) {
      return errorResponse(request, error.code, error.message, error.status);
    }
    console.error(JSON.stringify({
      event: "learning_item_processing_failed",
      errorType: error instanceof Error ? error.name : "unknown",
      validationIssues: error instanceof ZodError
        ? error.issues.map((entry) => ({ path: entry.path.join("."), code: entry.code, message: entry.message }))
        : undefined,
    }));
    return errorResponse(request, "PROCESSING_FAILED", "The item could not be processed. No unsupported claims were generated.", 500);
  }
}
