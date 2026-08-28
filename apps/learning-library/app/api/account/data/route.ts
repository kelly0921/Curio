import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteProfileData, deleteProfileObjects, deleteSupabaseUser } from "@/lib/account/data";
import { accountStorage } from "@/lib/account/provider";
import { apiResponseHeaders, authenticateApiRequest } from "@/lib/api/access-control";
import { readBoundedJson } from "@/lib/api/request-body";
import { logCurioEvent, requestId } from "@/lib/observability";

export const dynamic = "force-dynamic";

const confirmationSchema = z.object({ confirmation: z.literal("DELETE") }).strict();

function response(request: Request, code: string, message: string, status: number) {
  return NextResponse.json({ ok: false, error: { code, message } }, { status, headers: apiResponseHeaders(request) });
}

export async function DELETE(request: Request) {
  const viewer = await authenticateApiRequest(request);
  if (!viewer) return response(request, "UNAUTHORIZED", "Sign in to Curio to continue.", 401);
  const confirmation = confirmationSchema.safeParse(await readBoundedJson(request, 1_024).catch(() => null));
  if (!confirmation.success) {
    return response(request, "DELETION_NOT_CONFIRMED", "Confirm deletion before removing your Curio data.", 400);
  }
  const storage = await accountStorage();
  if (!storage) return response(request, "DELETION_UNAVAILABLE", "Account deletion is not available here.", 503);
  const traceId = requestId(request);
  try {
    const [deletedRecords, deletedObjects] = await Promise.all([
      deleteProfileData(storage.database, viewer.profileId),
      deleteProfileObjects(storage.bucket, viewer.profileId),
    ]);
    let authAccountDeleted = false;
    try {
      authAccountDeleted = await deleteSupabaseUser(viewer.userId);
    } catch {
      logCurioEvent({ event: "auth_account_deletion_failed", requestId: traceId, errorCode: "AUTH_ACCOUNT_DELETION_FAILED" }, "error");
    }
    logCurioEvent({ event: "account_data_deleted", requestId: traceId, status: "complete" });
    return NextResponse.json({
      ok: true,
      data: { deletedRecords, deletedObjects, authAccountDeleted },
    }, { headers: apiResponseHeaders(request) });
  } catch {
    logCurioEvent({ event: "account_data_deletion_failed", requestId: traceId, errorCode: "DELETION_FAILED" }, "error");
    return response(request, "DELETION_FAILED", "Curio could not finish deleting your data.", 500);
  }
}

export function OPTIONS(request: Request) {
  const headers = apiResponseHeaders(request);
  return headers ? new NextResponse(null, { status: 204, headers }) : new NextResponse(null, { status: 403 });
}
