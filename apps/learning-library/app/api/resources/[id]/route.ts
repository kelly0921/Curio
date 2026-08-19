import { NextResponse } from "next/server";
import { z } from "zod";
import { apiResponseHeaders, isApiRequestAuthorized } from "@/lib/api/access-control";
import { getLearningItemRepository } from "@/lib/data/provider";
import { personalProfile } from "@/lib/domain";
import { buildFollowThroughPlan } from "@/lib/knowledge/follow-through";
import { assessKnowledgeResourceFreshness } from "@/lib/knowledge/freshness";

export const dynamic = "force-dynamic";

function responseHeaders(request: Request): Headers {
  const headers = new Headers(apiResponseHeaders(request));
  headers.set("Cache-Control", "private, no-store");
  return headers;
}

function errorResponse(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: responseHeaders(request) });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!await isApiRequestAuthorized(request)) {
    return errorResponse(request, "UNAUTHORIZED", "A valid Curio personal access token is required.", 401);
  }
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return errorResponse(request, "INVALID_RESOURCE_ID", "This living resource ID is invalid.", 400);
  }
  try {
    const repository = await getLearningItemRepository();
    const resource = await repository.findResourceById(id);
    if (!resource || resource.profileId !== personalProfile.id) {
      return errorResponse(request, "RESOURCE_NOT_FOUND", "This living resource could not be found.", 404);
    }
    const [items, engagement] = await Promise.all([
      repository.list(),
      repository.findResourceEngagement(personalProfile.id, id),
    ]);
    const sources = items.filter((item) => resource.sourceItemIds.includes(item.id));
    return NextResponse.json(
      {
        ok: true,
        data: {
          resource,
          sources,
          freshness: assessKnowledgeResourceFreshness(resource),
          followThrough: buildFollowThroughPlan(resource, engagement),
        },
      },
      { headers: responseHeaders(request) },
    );
  } catch (error) {
    console.error(JSON.stringify({ event: "knowledge_resource_load_failed", errorType: error instanceof Error ? error.name : "unknown" }));
    return errorResponse(request, "RESOURCE_UNAVAILABLE", "This living resource could not be loaded.", 500);
  }
}

export function OPTIONS(request: Request) {
  const headers = apiResponseHeaders(request);
  if (!headers) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers });
}
