import { getCloudflareContext } from "@opennextjs/cloudflare";
import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";

interface CurioAuthEnvironment {
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  CURIO_ALLOWED_ORIGINS?: string;
  CURIO_ALLOW_ANY_GOOGLE_USER?: string;
  CURIO_INVITED_EMAILS?: string;
  CURIO_NATIVE_AUTH_ORIGINS?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  NODE_ENV?: string;
}

export interface CurioAuthConfiguration {
  allowAnyGoogleUser: boolean;
  baseURL: string;
  googleClientId: string;
  googleClientSecret: string;
  invitedEmails: ReadonlySet<string>;
  secret: string;
  trustedOrigins: string[];
}

function value(environment: CurioAuthEnvironment, name: keyof CurioAuthEnvironment): string {
  return environment[name]?.trim() ?? "";
}

function validHttpOrigin(candidate: string): string | null {
  try {
    const url = new URL(candidate);
    return (url.protocol === "http:" || url.protocol === "https:") ? url.origin : null;
  } catch {
    return null;
  }
}

function commaSeparated(valueToSplit: string): string[] {
  return valueToSplit.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function validNativeAuthOrigin(candidate: string): string | null {
  if (!candidate.startsWith("exp://") || candidate.includes("*") || /[?#]/u.test(candidate)) return null;
  try {
    const url = new URL(candidate);
    if (!url.hostname || url.username || url.password) return null;
    return candidate.replace(/\/+$/u, "");
  } catch {
    return null;
  }
}

export function curioAuthConfiguration(
  environment: CurioAuthEnvironment = process.env,
): CurioAuthConfiguration | null {
  const baseURL = value(environment, "BETTER_AUTH_URL");
  const secret = value(environment, "BETTER_AUTH_SECRET");
  const googleClientId = value(environment, "GOOGLE_CLIENT_ID");
  const googleClientSecret = value(environment, "GOOGLE_CLIENT_SECRET");
  const baseOrigin = validHttpOrigin(baseURL);
  if (!baseOrigin || secret.length < 32 || !googleClientId || !googleClientSecret) return null;

  const configuredOrigins = commaSeparated(value(environment, "CURIO_ALLOWED_ORIGINS"))
    .map(validHttpOrigin)
    .filter((origin): origin is string => Boolean(origin));
  const nativeAuthOrigins = commaSeparated(value(environment, "CURIO_NATIVE_AUTH_ORIGINS"))
    .map(validNativeAuthOrigin)
    .filter((origin): origin is string => Boolean(origin));
  const trustedOrigins = [...new Set([
    baseOrigin,
    ...configuredOrigins,
    ...nativeAuthOrigins,
    "curio://",
    "curio://*",
    ...(environment.NODE_ENV === "development" ? ["exp://", "exp://**"] : []),
  ])];
  const invitedEmails = new Set(
    commaSeparated(value(environment, "CURIO_INVITED_EMAILS"))
      .map((email) => email.toLocaleLowerCase()),
  );
  const allowAnyGoogleUser = value(environment, "CURIO_ALLOW_ANY_GOOGLE_USER") === "true"
    || environment.NODE_ENV === "development";

  return { allowAnyGoogleUser, baseURL, googleClientId, googleClientSecret, invitedEmails, secret, trustedOrigins };
}

export function isInvitedCurioEmail(
  email: string | null | undefined,
  invitedEmails: ReadonlySet<string>,
  allowAnyGoogleUser = false,
): boolean {
  if (!invitedEmails.size) return allowAnyGoogleUser;
  return Boolean(email && invitedEmails.has(email.toLocaleLowerCase()));
}

export function createCurioAuth(database: D1Database, configuration: CurioAuthConfiguration) {
  return betterAuth({
    appName: "Curio",
    baseURL: configuration.baseURL,
    secret: configuration.secret,
    database,
    account: {
      encryptOAuthTokens: true,
    },
    advanced: {
      cookiePrefix: "curio",
      database: {
        generateId: "uuid",
        joins: true,
      },
      ipAddress: {
        ipAddressHeaders: ["cf-connecting-ip"],
      },
      useSecureCookies: configuration.baseURL.startsWith("https://"),
    },
    socialProviders: {
      google: {
        clientId: configuration.googleClientId,
        clientSecret: configuration.googleClientSecret,
        prompt: "select_account",
      },
    },
    trustedOrigins: configuration.trustedOrigins,
    user: {
      validateUserInfo: ({ user }) => {
        if (isInvitedCurioEmail(
          typeof user.email === "string" ? user.email : null,
          configuration.invitedEmails,
          configuration.allowAnyGoogleUser,
        )) {
          return;
        }
        return {
          error: "invite_required",
          errorDescription: "This Google account is not on the Curio beta invite list.",
        };
      },
      deleteUser: { enabled: true },
    },
    plugins: [expo()],
    telemetry: { enabled: false },
  });
}

export async function getCurioAuth() {
  const configuration = curioAuthConfiguration();
  if (!configuration) throw new Error("CURIO_AUTH_NOT_CONFIGURED");
  const { env } = await getCloudflareContext({ async: true });
  if (!env.CURIO_DB) throw new Error("CURIO_AUTH_DATABASE_UNAVAILABLE");
  return createCurioAuth(env.CURIO_DB, configuration);
}

export async function deleteCurioAuthUser(request: Request): Promise<boolean> {
  if (!curioAuthConfiguration()) return false;
  const auth = await getCurioAuth();
  const result = await auth.api.deleteUser({ body: {}, headers: request.headers });
  return result.success;
}
