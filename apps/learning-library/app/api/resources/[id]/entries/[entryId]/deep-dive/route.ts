import { NextResponse } from "next/server";
import { z } from "zod";
import { OpenAILearningServices } from "@/lib/ai/services";
import { apiResponseHeaders, isApiRequestAuthorized } from "@/lib/api/access-control";
import { getLearningItemRepository } from "@/lib/data/provider";
import { resourceDeepDiveKindSchema } from "@/lib/domain";
import { deepenKnowledgeResourceEntry } from "@/lib/knowledge/deep-dive";

export const dynamic = "force-dynamic";

const bodySchema = z.object({ kind: resourceDeepDiveKindSchema }).strict();

function errorResponse(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: apiResponseHeaders(request) });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; entryId: string }> },
) {
  if (!await isApiRequestAuthorized(request)) {
    return errorResponse(request, "UNAUTHORIZED", "A valid Curio personal access token is required.", 401);
  }
  const { id, entryId } = await context.params;
  if (!z.string().uuid().safeParse(id).success || !z.string().uuid().safeParse(entryId).success) {
    return errorResponse(request, "INVALID_RESOURCE_ENTRY_ID", "This living-resource entry is invalid.", 400);
  }
  const parsedBody = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) {
    return errorResponse(request, "INVALID_DEEP_DIVE", "Choose one of Curio’s available follow-up questions.", 400);
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return errorResponse(request, "RESEARCH_NOT_CONFIGURED", "Curio research is not configured on this processor.", 503);
  }

  try {
    const repository = await getLearningItemRepository();
    const result = await deepenKnowledgeResourceEntry(
      id,
      entryId,
      parsedBody.data.kind,
      repository,
      new OpenAILearningServices(),
      { refresh: new URL(request.url).searchParams.get("refresh") === "true" },
    );
    if (!result) return errorResponse(request, "RESOURCE_NOT_FOUND", "This living resource could not be found.", 404);
    return NextResponse.json(
      { ok: true, data: result },
      { status: result.generated ? 201 : 200, headers: { ...apiResponseHeaders(request), "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "RESOURCE_ENTRY_NOT_FOUND") {
      return errorResponse(request, "RESOURCE_ENTRY_NOT_FOUND", "This learning point is no longer part of the resource.", 404);
    }
    if (error instanceof Error && error.message === "RESOURCE_ENTRY_SUPERSEDED") {
      return errorResponse(request, "RESOURCE_ENTRY_SUPERSEDED", "Open the current version of this learning point instead.", 409);
    }
    if (error instanceof Error && error.message === "DEEP_DIVE_NOT_VERIFIABLE") {
      return errorResponse(request, "DEEP_DIVE_NOT_VERIFIABLE", "Curio could not find enough direct evidence for this deeper answer.", 422);
    }
    console.error(JSON.stringify({
      event: "resource_entry_deep_dive_failed",
      errorType: error instanceof Error ? error.name : "unknown",
      resourceId: id,
      entryId,
      kind: parsedBody.data.kind,
    }));
    return errorResponse(request, "DEEP_DIVE_FAILED", "Curio could not research this question right now.", 500);
  }
}

export function OPTIONS(request: Request) {
  const headers = apiResponseHeaders(request);
  if (!headers) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers });
}
