import { NextResponse } from "next/server";
import { z } from "zod";
import { apiResponseHeaders, isApiRequestAuthorized } from "@/lib/api/access-control";
import { getLearningItemRepository } from "@/lib/data/provider";

export const dynamic = "force-dynamic";

function errorResponse(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: apiResponseHeaders(request) });
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
    if (!resource) return errorResponse(request, "RESOURCE_NOT_FOUND", "This living resource could not be found.", 404);
    const items = await repository.list();
    const sources = items.filter((item) => resource.sourceItemIds.includes(item.id));
    return NextResponse.json(
      { ok: true, data: { resource, sources } },
      { headers: apiResponseHeaders(request) },
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
