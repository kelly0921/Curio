import { NextResponse } from "next/server";
import { z } from "zod";
import { apiResponseHeaders, isApiRequestAuthorized } from "@/lib/api/access-control";
import { getPersonalContextSnapshot } from "@/lib/context/provider";
import { personalizeLearningItem } from "@/lib/context/personalization";
import { getLearningItemRepository } from "@/lib/data/provider";
import { learningItemSchema } from "@/lib/domain";

export const dynamic = "force-dynamic";

const feedbackSchema = z.object({
  action: z.enum(["done", "later", "not_relevant"]),
}).strict();

function errorResponse(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: apiResponseHeaders(request) });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  if (!await isApiRequestAuthorized(request)) {
    return errorResponse(request, "UNAUTHORIZED", "A valid Curio personal access token is required.", 401);
  }

  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return errorResponse(request, "INVALID_ITEM_ID", "This learning item ID is invalid.", 400);
  }

  let input: z.infer<typeof feedbackSchema>;
  try {
    input = feedbackSchema.parse(await request.json());
  } catch {
    return errorResponse(request, "INVALID_FEEDBACK", "Choose Done, Later, or Not relevant.", 400);
  }

  try {
    const repository = await getLearningItemRepository();
    const existing = await repository.findById(id);
    if (!existing) return errorResponse(request, "ITEM_NOT_FOUND", "This learning item could not be found.", 404);

    const now = new Date();
    const revisitAt = input.action === "later"
      ? new Date(now.getTime() + 7 * 86_400_000).toISOString()
      : null;
    const saved = await repository.save(learningItemSchema.parse({
      ...existing,
      recommendationFeedback: {
        state: input.action,
        updatedAt: now.toISOString(),
        revisitAt,
      },
      updatedAt: now.toISOString(),
    }));
    const snapshot = await getPersonalContextSnapshot();
    return NextResponse.json({
      ok: true,
      data: { item: personalizeLearningItem(saved, snapshot, now.toISOString()) },
    }, { headers: apiResponseHeaders(request) });
  } catch (error) {
    console.error(JSON.stringify({ event: "recommendation_feedback_failed", errorType: error instanceof Error ? error.name : "unknown" }));
    return errorResponse(request, "FEEDBACK_FAILED", "Curio could not save that feedback.", 500);
  }
}

export function OPTIONS(request: Request) {
  const headers = apiResponseHeaders(request);
  if (!headers) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers });
}
