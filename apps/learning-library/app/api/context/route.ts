import { NextResponse } from "next/server";
import { developmentAppOrigin, isSameOriginRequest } from "@/lib/api/same-origin";
import { getPersonalContextSnapshot, refreshPersonalContext } from "@/lib/context/provider";

export const dynamic = "force-dynamic";

function responseHeaders(request: Request): HeadersInit | undefined {
  const origin = developmentAppOrigin(request);
  if (!origin) return undefined;
  return {
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
  };
}

function errorResponse(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: responseHeaders(request) });
}

export async function GET(request: Request) {
  try {
    const context = await getPersonalContextSnapshot();
    return NextResponse.json({ ok: true, data: { context } }, { headers: responseHeaders(request) });
  } catch (error) {
    console.error(JSON.stringify({ event: "personal_context_load_failed", errorType: error instanceof Error ? error.name : "unknown" }));
    return errorResponse(request, "CONTEXT_UNAVAILABLE", "Connected context could not be loaded.", 500);
  }
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request) && !developmentAppOrigin(request)) {
    return errorResponse(request, "CROSS_ORIGIN_REQUEST", "Cross-origin context sync is not allowed.", 403);
  }
  try {
    const context = await refreshPersonalContext();
    return NextResponse.json({ ok: true, data: { context } }, { headers: responseHeaders(request) });
  } catch (error) {
    console.error(JSON.stringify({ event: "personal_context_sync_failed", errorType: error instanceof Error ? error.name : "unknown" }));
    return errorResponse(request, "CONTEXT_SYNC_FAILED", "Connected context could not be synchronized.", 500);
  }
}

export function OPTIONS(request: Request) {
  const headers = responseHeaders(request);
  if (!headers) return new NextResponse(null, { status: 403 });
  return new NextResponse(null, { status: 204, headers });
}
