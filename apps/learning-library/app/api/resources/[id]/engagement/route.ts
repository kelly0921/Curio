import { NextResponse } from "next/server";
import { z } from "zod";
import { apiResponseHeaders, authenticateApiRequest } from "@/lib/api/access-control";
import { getLearningItemRepository } from "@/lib/data/provider";
import { resourceEngagementSignalSchema } from "@/lib/domain";
import { recordResourceEngagement } from "@/lib/knowledge/engagement";

export const dynamic = "force-dynamic";

const inputSchema = z.object({ signal: resourceEngagementSignalSchema }).strict();

function responseHeaders(request: Request): Headers {
  const headers = new Headers(apiResponseHeaders(request));
  headers.set("Cache-Control", "private, no-store");
  return headers;
}

function errorResponse(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: responseHeaders(request) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = await authenticateApiRequest(request);
  if (!viewer) return errorResponse(request, "UNAUTHORIZED", "Sign in to Curio to continue.", 401);
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return errorResponse(request, "INVALID_RESOURCE_ID", "This resource ID is invalid.", 400);
  }
  if (Number(request.headers.get("content-length") ?? 0) > 1_024) {
    return errorResponse(request, "INVALID_ENGAGEMENT", "This engagement request is too large.", 413);
  }
  let input: z.infer<typeof inputSchema>;
  try {
    input = inputSchema.parse(await request.json());
  } catch {
    return errorResponse(request, "INVALID_ENGAGEMENT", "Choose a supported Curio engagement signal.", 400);
  }
  try {
    const repository = await getLearningItemRepository();
    const resource = await repository.findResourceById(viewer.profileId, id);
    if (!resource) {
      return errorResponse(request, "RESOURCE_NOT_FOUND", "This living resource could not be found.", 404);
    }
    const engagement = await recordResourceEngagement(viewer.profileId, id, input.signal, repository);
    return NextResponse.json({ ok: true, data: { engagement } }, { headers: responseHeaders(request) });
  } catch (error) {
    console.error(JSON.stringify({
      event: "resource_engagement_failed",
      resourceId: id,
      errorType: error instanceof Error ? error.name : "unknown",
    }));
    return errorResponse(request, "ENGAGEMENT_FAILED", "Curio could not remember that interaction.", 500);
  }
}

export function OPTIONS(request: Request) {
  const headers = apiResponseHeaders(request);
  if (!headers) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers });
}
