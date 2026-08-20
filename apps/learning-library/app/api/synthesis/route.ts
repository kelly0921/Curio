import { NextResponse } from "next/server";
import { apiResponseHeaders, authenticateApiRequest } from "@/lib/api/access-control";
import { getPersonalContextSnapshot } from "@/lib/context/provider";
import { getLearningItemRepository } from "@/lib/data/provider";
import { synchronizeKnowledgeResources } from "@/lib/knowledge/resources";
import { buildCrossSaveSynthesis } from "@/lib/knowledge/synthesis";

export const dynamic = "force-dynamic";

function responseHeaders(request: Request): Headers {
  const headers = new Headers(apiResponseHeaders(request));
  headers.set("Cache-Control", "private, no-store");
  return headers;
}

function errorResponse(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: responseHeaders(request) });
}

export async function GET(request: Request) {
  const viewer = await authenticateApiRequest(request);
  if (!viewer) return errorResponse(request, "UNAUTHORIZED", "Sign in to Curio to continue.", 401);
  try {
    const repository = await getLearningItemRepository();
    const [items, context, engagement, feedback] = await Promise.all([
      repository.list(viewer.profileId),
      getPersonalContextSnapshot(viewer.profileId),
      repository.listResourceEngagement(viewer.profileId),
      repository.listForYouFeedback(viewer.profileId),
    ]);
    const resources = await synchronizeKnowledgeResources(items, repository);
    const synthesis = buildCrossSaveSynthesis({ items, resources, context, engagement, feedback });
    return NextResponse.json(
      { ok: true, data: { synthesis } },
      { headers: responseHeaders(request) },
    );
  } catch (error) {
    console.error(JSON.stringify({ event: "cross_save_synthesis_failed", errorType: error instanceof Error ? error.name : "unknown" }));
    return errorResponse(request, "SYNTHESIS_UNAVAILABLE", "Your cross-save synthesis could not be loaded.", 500);
  }
}

export function OPTIONS(request: Request) {
  const headers = apiResponseHeaders(request);
  if (!headers) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers });
}
