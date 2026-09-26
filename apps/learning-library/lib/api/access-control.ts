import { timingSafeEqual } from "node:crypto";
import { personalProfile } from "../domain";
import { curioAuthConfiguration, getCurioAuth, isInvitedCurioEmail } from "../auth/server";
import { developmentAppOrigin, isSameOriginRequest } from "./same-origin";

export interface ApiViewer {
  profileId: string;
  userId: string | null;
  email: string | null;
  authMode: "better_auth" | "personal_beta" | "development";
}

interface VerifiedIdentity {
  profileId: string;
  email: string | null;
}

interface AuthenticationOptions {
  environment?: string;
  verifyBetterAuthSession?: (request: Request) => Promise<VerifiedIdentity | null>;
}

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
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
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

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("authorization") ?? "";
  return /^Bearer\s+(.+)$/i.exec(authorization)?.[1]?.trim() || null;
}

export function apiAuthenticationMode(): "better_auth" | "personal_beta" | "development_only" {
  if (curioAuthConfiguration()) return "better_auth";
  if (process.env.CURIO_API_TOKEN?.trim()) return "personal_beta";
  return "development_only";
}

function invitedEmail(email: string | null): boolean {
  const invited = new Set((process.env.CURIO_INVITED_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLocaleLowerCase())
    .filter(Boolean));
  return isInvitedCurioEmail(email, invited);
}

function profileIdForIdentity(identity: VerifiedIdentity): string {
  const legacyOwnerEmail = process.env.CURIO_LEGACY_OWNER_EMAIL?.trim().toLocaleLowerCase();
  if (legacyOwnerEmail && identity.email?.toLocaleLowerCase() === legacyOwnerEmail) {
    return personalProfile.id;
  }
  return identity.profileId;
}

async function verifyBetterAuthSession(request: Request): Promise<VerifiedIdentity | null> {
  const auth = await getCurioAuth();
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) return null;
  return { profileId: session.user.id, email: session.user.email };
}

export async function authenticateApiRequest(
  request: Request,
  options: AuthenticationOptions = {},
): Promise<ApiViewer | null> {
  const environment = options.environment ?? process.env.NODE_ENV;
  const authConfiguration = curioAuthConfiguration();
  const token = bearerToken(request);
  if (authConfiguration) {
    const identity = await (options.verifyBetterAuthSession ?? verifyBetterAuthSession)(request);
    if (!identity || !invitedEmail(identity.email)) return null;
    return {
      profileId: profileIdForIdentity(identity),
      userId: identity.profileId,
      email: identity.email,
      authMode: "better_auth",
    };
  }

  const expected = process.env.CURIO_API_TOKEN?.trim();
  if (expected) {
    if (!token || !await tokensMatch(token, expected)) return null;
    return { profileId: personalProfile.id, userId: null, email: null, authMode: "personal_beta" };
  }

  if (environment === "development"
    && (isSameOriginRequest(request) || Boolean(developmentAppOrigin(request, environment)))) {
    return { profileId: personalProfile.id, userId: null, email: null, authMode: "development" };
  }
  return null;
}

export async function isApiRequestAuthorized(
  request: Request,
  environment = process.env.NODE_ENV,
): Promise<boolean> {
  return Boolean(await authenticateApiRequest(request, { environment }));
}
