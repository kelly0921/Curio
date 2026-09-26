import { apiResponseHeaders } from "@/lib/api/access-control";
import { curioAuthConfiguration, getCurioAuth } from "@/lib/auth/server";

export const dynamic = "force-dynamic";

function withApiHeaders(request: Request, response: Response): Response {
  const headers = new Headers(response.headers);
  new Headers(apiResponseHeaders(request)).forEach((headerValue, name) => headers.set(name, headerValue));
  return new Response(response.body, { headers, status: response.status, statusText: response.statusText });
}

async function handle(request: Request): Promise<Response> {
  if (!curioAuthConfiguration()) {
    return withApiHeaders(request, Response.json({
      ok: false,
      error: { code: "AUTH_NOT_CONFIGURED", message: "Curio sign-in is not configured yet." },
    }, { status: 503 }));
  }
  const auth = await getCurioAuth();
  return withApiHeaders(request, await auth.handler(request));
}

export const GET = handle;
export const POST = handle;

export function OPTIONS(request: Request): Response {
  const headers = apiResponseHeaders(request);
  return headers ? new Response(null, { headers, status: 204 }) : new Response(null, { status: 403 });
}
