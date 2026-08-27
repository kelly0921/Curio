import { NextResponse } from "next/server";
import { z } from "zod";
import { apiResponseHeaders, authenticateApiRequest } from "@/lib/api/access-control";
import { getLearningItemRepository } from "@/lib/data/provider";
import { contextDomainSchema } from "@/lib/domain";
import { searchKnowledge } from "@/lib/knowledge/retrieval";
import { synchronizeKnowledgeResources } from "@/lib/knowledge/resources";

export const dynamic = "force-dynamic";

const searchInputSchema = z.object({
  query: z.string().trim().min(2).max(300),
  domain: contextDomainSchema.nullable().optional(),
}).strict();

function responseHeaders(request: Request): Headers {
  const headers = new Headers(apiResponseHeaders(request));
  headers.set("Cache-Control", "private, no-store");
  return headers;
}

function errorResponse(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: responseHeaders(request) });
}

async function runLibrarySearch(profileId: string, input: z.infer<typeof searchInputSchema>) {
  const repository = await getLearningItemRepository();
  const [items, engagement] = await Promise.all([
    repository.list(profileId),
    repository.listResourceEngagement(profileId),
  ]);
  const resources = await synchronizeKnowledgeResources(items, repository);
  const result = searchKnowledge({
    query: input.query,
    resources,
    items,
    domain: input.domain ?? null,
  });
  return {
    ...result,
    followThroughResourceIds: engagement
      .filter((record) => record.followThrough?.state === "active" && record.followThrough.kind !== "review")
      .map((record) => record.resourceId),
  };
}

function successResponse(request: Request, data: Awaited<ReturnType<typeof runLibrarySearch>>) {
  return NextResponse.json({ ok: true, data }, { headers: responseHeaders(request) });
}

export async function GET(request: Request) {
  const viewer = await authenticateApiRequest(request);
  if (!viewer) return errorResponse(request, "UNAUTHORIZED", "Sign in to Curio to continue.", 401);
  const url = new URL(request.url);
  const parsed = searchInputSchema.safeParse({
    query: url.searchParams.get("q") ?? "",
    domain: url.searchParams.get("domain")?.trim() || null,
  });
  if (!parsed.success) {
    return errorResponse(request, "INVALID_SEARCH_QUERY", "Search with 2 to 300 characters in a supported knowledge area.", 400);
  }
  try {
    return successResponse(request, await runLibrarySearch(viewer.profileId, parsed.data));
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
