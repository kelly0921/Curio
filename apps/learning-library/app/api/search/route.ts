import { NextResponse } from "next/server";
import { contextDomainSchema } from "@/lib/domain";
import { apiResponseHeaders, isApiRequestAuthorized } from "@/lib/api/access-control";
import { getLearningItemRepository } from "@/lib/data/provider";
import { searchKnowledge } from "@/lib/knowledge/retrieval";
import { synchronizeKnowledgeResources } from "@/lib/knowledge/resources";

export const dynamic = "force-dynamic";

function errorResponse(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: apiResponseHeaders(request) });
}

export async function GET(request: Request) {
  if (!await isApiRequestAuthorized(request)) {
    return errorResponse(request, "UNAUTHORIZED", "A valid Curio personal access token is required.", 401);
  }
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() ?? "";
  if (query.length < 2 || query.length > 300) {
    return errorResponse(request, "INVALID_SEARCH_QUERY", "Search with 2 to 300 characters.", 400);
  }
  const domainValue = url.searchParams.get("domain")?.trim() || null;
  const parsedDomain = domainValue ? contextDomainSchema.safeParse(domainValue) : null;
  if (parsedDomain && !parsedDomain.success) {
    return errorResponse(request, "INVALID_SEARCH_DOMAIN", "This knowledge domain is not supported.", 400);
  }

  try {
    const repository = await getLearningItemRepository();
    const items = await repository.list();
    const resources = await synchronizeKnowledgeResources(items, repository);
    const result = searchKnowledge({
      query,
      resources,
      items,
      domain: parsedDomain?.data ?? null,
    });
    return NextResponse.json(
      { ok: true, data: result },
      { headers: { ...apiResponseHeaders(request), "Cache-Control": "no-store" } },
    );
  } catch (error) {
    console.error(JSON.stringify({ event: "knowledge_search_failed", errorType: error instanceof Error ? error.name : "unknown" }));
    return errorResponse(request, "SEARCH_UNAVAILABLE", "Curio could not search your knowledge right now.", 500);
  }
}

export function OPTIONS(request: Request) {
  const headers = apiResponseHeaders(request);
  if (!headers) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers });
}
