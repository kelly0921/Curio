import { NextResponse } from "next/server";
import { apiResponseHeaders, isApiRequestAuthorized } from "@/lib/api/access-control";
import { getLearningItemRepository } from "@/lib/data/provider";
import { synchronizeKnowledgeResources } from "@/lib/knowledge/resources";

export const dynamic = "force-dynamic";

function errorResponse(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: apiResponseHeaders(request) });
}

export async function GET(request: Request) {
  if (!await isApiRequestAuthorized(request)) {
    return errorResponse(request, "UNAUTHORIZED", "A valid Curio personal access token is required.", 401);
  }
  try {
    const repository = await getLearningItemRepository();
    const items = await repository.list();
    const resources = await synchronizeKnowledgeResources(items, repository);
    return NextResponse.json(
      { ok: true, data: { resources } },
      { headers: apiResponseHeaders(request) },
    );
  } catch (error) {
    console.error(JSON.stringify({ event: "knowledge_resources_list_failed", errorType: error instanceof Error ? error.name : "unknown" }));
    return errorResponse(request, "RESOURCES_UNAVAILABLE", "Living resources could not be loaded.", 500);
  }
}

export function OPTIONS(request: Request) {
  const headers = apiResponseHeaders(request);
  if (!headers) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers });
}
