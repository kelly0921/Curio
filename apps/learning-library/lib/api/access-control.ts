import { timingSafeEqual } from "node:crypto";
import { developmentAppOrigin, isSameOriginRequest } from "./same-origin";

function configuredOrigin(request: Request): string | null {
  const submittedOrigin = request.headers.get("origin");
  if (!submittedOrigin) return null;
  const allowed = (process.env.CURIO_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  return allowed.includes(submittedOrigin) ? submittedOrigin : null;
}

export function apiResponseHeaders(request: Request): HeadersInit | undefined {
  const origin = developmentAppOrigin(request) ?? configuredOrigin(request);
  if (!origin) return undefined;
  return {
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Vary": "Origin",
  };
}

async function tokensMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(expected)),
  ]);
  return timingSafeEqual(new Uint8Array(providedHash), new Uint8Array(expectedHash));
}

export async function isApiRequestAuthorized(
  request: Request,
  environment = process.env.NODE_ENV,
): Promise<boolean> {
  const expected = process.env.CURIO_API_TOKEN?.trim();
  if (expected) {
    const authorization = request.headers.get("authorization") ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(authorization);
    return Boolean(match?.[1]) && tokensMatch(match?.[1] ?? "", expected);
  }

  return environment === "development"
    && (isSameOriginRequest(request) || Boolean(developmentAppOrigin(request, environment)));
}
