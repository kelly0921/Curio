import { NextResponse } from "next/server";
import { apiResponseHeaders, authenticateApiRequest } from "@/lib/api/access-control";
import { processingJobReceipt } from "@/lib/jobs/domain";
import { getProcessingRuntime } from "@/lib/jobs/provider";
import { logCurioEvent, requestId } from "@/lib/observability";

export const dynamic = "force-dynamic";

function response(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: apiResponseHeaders(request) });
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const viewer = await authenticateApiRequest(request);
  if (!viewer) return response(request, "UNAUTHORIZED", "Sign in to Curio to continue.", 401);
  const runtime = await getProcessingRuntime();
  if (!runtime) return response(request, "JOBS_UNAVAILABLE", "Background processing is not available here.", 503);
  const { id } = await context.params;
  const current = await runtime.jobs.findById(viewer.profileId, id);
  if (!current) return response(request, "JOB_NOT_FOUND", "This processing job could not be found.", 404);
  if (current.status !== "failed" || !current.error?.recoverable) {
    return response(request, "JOB_NOT_RETRYABLE", "This job cannot be retried.", 409);
  }
  const job = await runtime.jobs.markQueued(current, null, new Date().toISOString());
  try {
    await runtime.queue.send({ jobId: job.id, profileId: viewer.profileId }, { contentType: "json" });
    logCurioEvent({ event: "processing_job_retried", requestId: requestId(request), jobId: job.id, attempt: job.attempts });
  } catch {
    const failed = await runtime.jobs.markFailed(job, {
      code: "QUEUE_UNAVAILABLE",
      message: "Curio could not restart processing. Try again shortly.",
      recoverable: true,
    }, new Date().toISOString());
    return NextResponse.json(
      { ok: true, data: { job: processingJobReceipt(failed) } },
      { status: 202, headers: apiResponseHeaders(request) },
    );
  }
  return NextResponse.json(
    { ok: true, data: { job: processingJobReceipt(job) } },
    { status: 202, headers: apiResponseHeaders(request) },
  );
}

export function OPTIONS(request: Request) {
  const headers = apiResponseHeaders(request);
  return headers ? new NextResponse(null, { status: 204, headers }) : new NextResponse(null, { status: 403 });
}
