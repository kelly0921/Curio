import { timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { personalProfile } from "../domain";
import { developmentAppOrigin, isSameOriginRequest } from "./same-origin";

export interface ApiViewer {
  profileId: string;
  userId: string | null;
  email: string | null;
  authMode: "supabase" | "personal_beta" | "development";
}

interface VerifiedSupabaseIdentity {
  profileId: string;
  email: string | null;
}

interface AuthenticationOptions {
  environment?: string;
  verifySupabaseToken?: (token: string) => Promise<VerifiedSupabaseIdentity | null>;
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

function supabaseAuthConfiguration(): { url: string; publishableKey: string } | null {
  const url = process.env.SUPABASE_AUTH_URL?.trim() || process.env.SUPABASE_URL?.trim() || "";
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim()
    || process.env.SUPABASE_ANON_KEY?.trim()
    || "";
  return url && publishableKey ? { url, publishableKey } : null;
}

export function apiAuthenticationMode(): "supabase" | "personal_beta" | "development_only" {
  if (supabaseAuthConfiguration()) return "supabase";
  if (process.env.CURIO_API_TOKEN?.trim()) return "personal_beta";
  return "development_only";
}

function invitedEmail(email: string | null): boolean {
  const invited = (process.env.CURIO_INVITED_EMAILS ?? "")
    .split(",")
    .map((entry) => entry.trim().toLocaleLowerCase())
    .filter(Boolean);
  if (!invited.length) return true;
  return Boolean(email && invited.includes(email.toLocaleLowerCase()));
}

function profileIdForIdentity(identity: VerifiedSupabaseIdentity): string {
  const legacyOwnerEmail = process.env.CURIO_LEGACY_OWNER_EMAIL?.trim().toLocaleLowerCase();
  if (legacyOwnerEmail && identity.email?.toLocaleLowerCase() === legacyOwnerEmail) {
    return personalProfile.id;
  }
  return identity.profileId;
}

async function verifySupabaseToken(token: string): Promise<VerifiedSupabaseIdentity | null> {
  const configuration = supabaseAuthConfiguration();
  if (!configuration) return null;
  const client = createClient(configuration.url, configuration.publishableKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  return { profileId: data.user.id, email: data.user.email ?? null };
}

export async function authenticateApiRequest(
  request: Request,
  options: AuthenticationOptions = {},
): Promise<ApiViewer | null> {
  const environment = options.environment ?? process.env.NODE_ENV;
  const authConfiguration = supabaseAuthConfiguration();
  const token = bearerToken(request);
  if (authConfiguration) {
    if (!token) return null;
    const identity = await (options.verifySupabaseToken ?? verifySupabaseToken)(token);
    if (!identity || !invitedEmail(identity.email)) return null;
    return {
      profileId: profileIdForIdentity(identity),
      userId: identity.profileId,
      email: identity.email,
      authMode: "supabase",
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
