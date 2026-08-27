import { NextResponse } from "next/server";
import { z } from "zod";
import { apiResponseHeaders, authenticateApiRequest } from "@/lib/api/access-control";
import { getLearningItemRepository } from "@/lib/data/provider";
import { forYouLaneSchema } from "@/lib/domain";
import { saveForYouRecommendationFeedback } from "@/lib/knowledge/engagement";

export const dynamic = "force-dynamic";

const inputSchema = z.object({
  recommendationId: z.string().min(1).max(300),
  resourceId: z.string().uuid(),
  lane: forYouLaneSchema,
  action: z.enum(["done", "later", "not_relevant"]),
}).strict();

function responseHeaders(request: Request): Headers {
  const headers = new Headers(apiResponseHeaders(request));
  headers.set("Cache-Control", "private, no-store");
  return headers;
}

function errorResponse(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: responseHeaders(request) });
}

export async function POST(request: Request) {
  const viewer = await authenticateApiRequest(request);
  if (!viewer) return errorResponse(request, "UNAUTHORIZED", "Sign in to Curio to continue.", 401);
  if (Number(request.headers.get("content-length") ?? 0) > 2_048) {
    return errorResponse(request, "INVALID_FOR_YOU_FEEDBACK", "This feedback request is too large.", 413);
  }
  let input: z.infer<typeof inputSchema>;
  try {
    input = inputSchema.parse(await request.json());
  } catch {
    return errorResponse(request, "INVALID_FOR_YOU_FEEDBACK", "Choose Done, Remind me later, or Not useful.", 400);
  }
  try {
    const repository = await getLearningItemRepository();
    const resource = await repository.findResourceById(viewer.profileId, input.resourceId);
    if (!resource) {
      return errorResponse(request, "RESOURCE_NOT_FOUND", "This living resource could not be found.", 404);
    }
    const feedback = await saveForYouRecommendationFeedback({
      ...input,
      profileId: viewer.profileId,
    }, repository);
    return NextResponse.json({ ok: true, data: { feedback } }, { headers: responseHeaders(request) });
  } catch (error) {
    console.error(JSON.stringify({
      event: "for_you_feedback_failed",
      resourceId: input.resourceId,
      lane: input.lane,
      errorType: error instanceof Error ? error.name : "unknown",
    }));
    return errorResponse(request, "FOR_YOU_FEEDBACK_FAILED", "Curio could not save that choice.", 500);
  }
}

export function OPTIONS(request: Request) {
  const headers = apiResponseHeaders(request);
  if (!headers) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers });
}
