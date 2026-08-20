import { NextResponse } from "next/server";
import { z } from "zod";
import { apiResponseHeaders, isApiRequestAuthorized } from "@/lib/api/access-control";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/api/request-body";
import { getLearningItemRepository } from "@/lib/data/provider";
import { personalProfile } from "@/lib/domain";
import { updateResourceFollowThrough } from "@/lib/knowledge/follow-through";

export const dynamic = "force-dynamic";

const inputSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("start") }).strict(),
  z.object({
    action: z.literal("toggle_entry"),
    entryId: z.string().uuid(),
    completed: z.boolean(),
  }).strict(),
  z.object({ action: z.literal("complete") }).strict(),
]);

function responseHeaders(request: Request): Headers {
  const headers = new Headers(apiResponseHeaders(request));
  headers.set("Cache-Control", "private, no-store");
  return headers;
}

function errorResponse(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: responseHeaders(request) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!await isApiRequestAuthorized(request)) {
    return errorResponse(request, "UNAUTHORIZED", "A valid Curio personal access token is required.", 401);
  }
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return errorResponse(request, "INVALID_RESOURCE_ID", "This living resource ID is invalid.", 400);
  }
  let input: z.infer<typeof inputSchema>;
  try {
    input = inputSchema.parse(await readBoundedJson(request, 2_048));
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return errorResponse(request, "INVALID_FOLLOW_THROUGH", "This follow-through request is too large.", 413);
    }
    return errorResponse(request, "INVALID_FOLLOW_THROUGH", "Choose a supported Curio follow-through action.", 400);
  }
  try {
    const repository = await getLearningItemRepository();
    const resource = await repository.findResourceById(id);
    if (!resource || resource.profileId !== personalProfile.id) {
      return errorResponse(request, "RESOURCE_NOT_FOUND", "This living resource could not be found.", 404);
    }
    if (input.action === "toggle_entry" && !resource.entries.some((entry) => entry.id === input.entryId && entry.status !== "superseded")) {
      return errorResponse(request, "ENTRY_NOT_FOUND", "This resource point is no longer available.", 404);
    }
    const { plan } = await updateResourceFollowThrough(personalProfile.id, resource, input, repository);
    return NextResponse.json({ ok: true, data: { plan } }, { headers: responseHeaders(request) });
  } catch (error) {
    if (error instanceof Error && error.message === "FOLLOW_THROUGH_NOT_ACTIONABLE") {
      return errorResponse(
        request,
        "FOLLOW_THROUGH_NOT_ACTIONABLE",
        "Only trips, checklists, shortlists, and watchlists can be added to For You.",
        400,
      );
    }
    console.error(JSON.stringify({
      event: "resource_follow_through_failed",
      resourceId: id,
      errorType: error instanceof Error ? error.name : "unknown",
    }));
    return errorResponse(request, "FOLLOW_THROUGH_FAILED", "Curio could not save that next step.", 500);
  }
}

export function OPTIONS(request: Request) {
  const headers = apiResponseHeaders(request);
  if (!headers) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers });
}
