import { NextResponse } from "next/server";
import { apiResponseHeaders, authenticateApiRequest } from "@/lib/api/access-control";
import { getPersonalContextSnapshot } from "@/lib/context/provider";
import { personalizeLearningItem } from "@/lib/context/personalization";
import { getLearningItemRepository } from "@/lib/data/provider";
import { processingJobReceipt } from "@/lib/jobs/domain";
import { getProcessingRuntime } from "@/lib/jobs/provider";

export const dynamic = "force-dynamic";

function response(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: apiResponseHeaders(request) });
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = await authenticateApiRequest(request);
  if (!viewer) return response(request, "UNAUTHORIZED", "Sign in to Curio to continue.", 401);
  const runtime = await getProcessingRuntime();
  if (!runtime) return response(request, "JOBS_UNAVAILABLE", "Background processing is not available here.", 503);
  const { id } = await context.params;
  const job = await runtime.jobs.findById(viewer.profileId, id);
  if (!job) return response(request, "JOB_NOT_FOUND", "This processing job could not be found.", 404);

  let item = null;
  let resource = null;
  if (job.status === "ready" && job.itemId) {
    const repository = await getLearningItemRepository();
    const savedItem = await repository.findById(viewer.profileId, job.itemId);
    if (savedItem) {
      const personalContext = await getPersonalContextSnapshot(viewer.profileId);
      item = personalizeLearningItem(savedItem, personalContext);
    }
    if (job.resourceId) resource = await repository.findResourceById(viewer.profileId, job.resourceId);
  }
  return NextResponse.json(
    { ok: true, data: { job: processingJobReceipt(job), item, resource } },
    { headers: apiResponseHeaders(request) },
  );
}

export function OPTIONS(request: Request) {
  const headers = apiResponseHeaders(request);
  return headers ? new NextResponse(null, { status: 204, headers }) : new NextResponse(null, { status: 403 });
}
