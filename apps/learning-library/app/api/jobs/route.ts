import { NextResponse } from "next/server";
import { apiResponseHeaders, authenticateApiRequest } from "@/lib/api/access-control";
import { processingJobReceipt } from "@/lib/jobs/domain";
import { getProcessingRuntime } from "@/lib/jobs/provider";

export const dynamic = "force-dynamic";

function response(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: apiResponseHeaders(request) });
}

export async function GET(request: Request) {
  const viewer = await authenticateApiRequest(request);
  if (!viewer) return response(request, "UNAUTHORIZED", "Sign in to Curio to continue.", 401);
  const runtime = await getProcessingRuntime();
  if (!runtime) return NextResponse.json({ ok: true, data: { jobs: [] } }, { headers: apiResponseHeaders(request) });
  const jobs = await runtime.jobs.listRecent(viewer.profileId);
  return NextResponse.json(
    { ok: true, data: { jobs: jobs.map(processingJobReceipt) } },
    { headers: apiResponseHeaders(request) },
  );
}

export function OPTIONS(request: Request) {
  const headers = apiResponseHeaders(request);
  return headers ? new NextResponse(null, { status: 204, headers }) : new NextResponse(null, { status: 403 });
}
