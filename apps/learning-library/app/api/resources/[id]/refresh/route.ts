import { NextResponse } from "next/server";
import { z } from "zod";
import { OpenAILearningServices } from "@/lib/ai/services";
import { apiResponseHeaders, authenticateApiRequest } from "@/lib/api/access-control";
import { getLearningItemRepository } from "@/lib/data/provider";
import { refreshKnowledgeResourceResearch } from "@/lib/knowledge/refresh";

export const dynamic = "force-dynamic";

function errorResponse(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: apiResponseHeaders(request) });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const viewer = await authenticateApiRequest(request);
  if (!viewer) return errorResponse(request, "UNAUTHORIZED", "Sign in to Curio to continue.", 401);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return errorResponse(request, "INVALID_RESOURCE_ID", "This living resource ID is invalid.", 400);
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    return errorResponse(request, "RESEARCH_NOT_CONFIGURED", "Curio research is not configured on this processor.", 503);
  }
  try {
    const repository = await getLearningItemRepository();
    const result = await refreshKnowledgeResourceResearch(viewer.profileId, id, repository, new OpenAILearningServices());
    if (!result) return errorResponse(request, "RESOURCE_NOT_FOUND", "This living resource could not be found.", 404);
    return NextResponse.json(
      { ok: true, data: result },
      { headers: { ...apiResponseHeaders(request), "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === "NO_RESEARCHABLE_SOURCES") {
      return errorResponse(request, "RESOURCE_NOT_RESEARCHABLE", "This resource does not yet have enough source evidence to refresh.", 422);
    }
    console.error(JSON.stringify({ event: "knowledge_resource_refresh_failed", errorType: error instanceof Error ? error.name : "unknown" }));
    return errorResponse(request, "RESOURCE_REFRESH_FAILED", "Curio could not refresh this research right now.", 500);
  }
}

export function OPTIONS(request: Request) {
  const headers = apiResponseHeaders(request);
  if (!headers) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers });
}
