import { NextResponse } from "next/server";
import { apiResponseHeaders, isApiRequestAuthorized } from "@/lib/api/access-control";
import { getPersonalContextSnapshot, refreshPersonalContext } from "@/lib/context/provider";

export const dynamic = "force-dynamic";

function errorResponse(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: apiResponseHeaders(request) });
}

export async function GET(request: Request) {
  if (!await isApiRequestAuthorized(request)) {
    return errorResponse(request, "UNAUTHORIZED", "A valid Curio personal access token is required.", 401);
  }
  try {
    const context = await getPersonalContextSnapshot();
    return NextResponse.json({ ok: true, data: { context } }, { headers: apiResponseHeaders(request) });
  } catch (error) {
    console.error(JSON.stringify({ event: "personal_context_load_failed", errorType: error instanceof Error ? error.name : "unknown" }));
    return errorResponse(request, "CONTEXT_UNAVAILABLE", "Connected context could not be loaded.", 500);
  }
}

export async function POST(request: Request) {
  if (!await isApiRequestAuthorized(request)) {
    return errorResponse(request, "UNAUTHORIZED", "A valid Curio personal access token is required.", 401);
  }
  try {
    const context = await refreshPersonalContext();
    return NextResponse.json({ ok: true, data: { context } }, { headers: apiResponseHeaders(request) });
  } catch (error) {
    console.error(JSON.stringify({ event: "personal_context_sync_failed", errorType: error instanceof Error ? error.name : "unknown" }));
    return errorResponse(request, "CONTEXT_SYNC_FAILED", "Connected context could not be synchronized.", 500);
  }
}

export function OPTIONS(request: Request) {
  const headers = apiResponseHeaders(request);
  if (!headers) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers });
}
