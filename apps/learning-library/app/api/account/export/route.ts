import { NextResponse } from "next/server";
import { exportProfileData } from "@/lib/account/data";
import { accountStorage } from "@/lib/account/provider";
import { apiResponseHeaders, authenticateApiRequest } from "@/lib/api/access-control";
import { logCurioEvent, requestId, withRequestId } from "@/lib/observability";

export const dynamic = "force-dynamic";

function response(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: apiResponseHeaders(request) });
}

export async function GET(request: Request) {
  const viewer = await authenticateApiRequest(request);
  if (!viewer) return response(request, "UNAUTHORIZED", "Sign in to Curio to continue.", 401);
  const storage = await accountStorage();
  if (!storage) return response(request, "EXPORT_UNAVAILABLE", "Account export is not available here.", 503);
  try {
    const data = await exportProfileData(storage.database, viewer.profileId);
    const headers = withRequestId(apiResponseHeaders(request), requestId(request));
    headers.set("Cache-Control", "private, no-store");
    headers.set("Content-Disposition", `attachment; filename="curio-export-${new Date().toISOString().slice(0, 10)}.json"`);
    headers.set("Content-Type", "application/json; charset=utf-8");
    return new Response(JSON.stringify(data, null, 2), { headers });
  } catch {
    logCurioEvent({ event: "account_export_failed", requestId: requestId(request), errorCode: "EXPORT_FAILED" }, "error");
    return response(request, "EXPORT_FAILED", "Curio could not prepare your export.", 500);
  }
}

export function OPTIONS(request: Request) {
  const headers = apiResponseHeaders(request);
  return headers ? new NextResponse(null, { status: 204, headers }) : new NextResponse(null, { status: 403 });
}
