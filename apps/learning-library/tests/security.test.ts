import { describe, expect, it, vi } from "vitest";
import { authenticateApiRequest, isApiRequestAuthorized } from "@/lib/api/access-control";
import { developmentAppOrigin, isSameOriginRequest } from "@/lib/api/same-origin";
import { createSupabaseServerFetch } from "@/lib/data/supabase-repository";

describe("server boundaries", () => {
  it("rejects a cross-origin browser submission", () => {
    const request = new Request("https://learning.example/api/items", {
      method: "POST",
      headers: { origin: "https://attacker.example" },
    });
    expect(isSameOriginRequest(request)).toBe(false);
  });

  it("allows same-origin and non-browser server requests", () => {
    expect(isSameOriginRequest(new Request("https://learning.example/api/items", {
      method: "POST",
      headers: { origin: "https://learning.example" },
    }))).toBe(true);
    expect(isSameOriginRequest(new Request("https://learning.example/api/items", { method: "POST" }))).toBe(true);
  });

  it("treats equivalent loopback hosts as one local development origin", () => {
    const request = new Request("http://localhost:3031/api/items", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3031" },
    });
    expect(isSameOriginRequest(request)).toBe(true);

    const differentPort = new Request("http://localhost:3031/api/items", {
      method: "POST",
      headers: { origin: "http://127.0.0.1:3032" },
    });
    expect(isSameOriginRequest(differentPort)).toBe(false);
  });

  it("allows only the known Expo web preview ports during local development", () => {
    const previewRequest = new Request("http://localhost:3031/api/items", {
      headers: { origin: "http://127.0.0.1:8082" },
    });
    expect(developmentAppOrigin(previewRequest, "development")).toBe("http://127.0.0.1:8082");
    expect(developmentAppOrigin(previewRequest, "production")).toBeNull();

    const phonePreview = new Request("http://localhost:3031/api/items", {
      headers: { origin: "http://192.168.0.231:8082" },
    });
    expect(developmentAppOrigin(phonePreview, "development")).toBe("http://192.168.0.231:8082");

    const unknownPort = new Request("http://localhost:3031/api/items", {
      headers: { origin: "http://localhost:8099" },
    });
    expect(developmentAppOrigin(unknownPort, "development")).toBeNull();
  });

  it("requires the configured personal token in production", async () => {
    const previous = process.env.CURIO_API_TOKEN;
    process.env.CURIO_API_TOKEN = "a-long-personal-beta-token";
    try {
      const unauthorized = new Request("https://curio.example/api/items");
      expect(await isApiRequestAuthorized(unauthorized, "production")).toBe(false);

      const authorized = new Request("https://curio.example/api/items", {
        headers: { Authorization: "Bearer a-long-personal-beta-token" },
      });
      expect(await isApiRequestAuthorized(authorized, "production")).toBe(true);
    } finally {
      if (previous === undefined) Reflect.deleteProperty(process.env, "CURIO_API_TOKEN");
      else process.env.CURIO_API_TOKEN = previous;
    }
  });

  it("fails closed in production when no personal token is configured", async () => {
    const previous = process.env.CURIO_API_TOKEN;
    Reflect.deleteProperty(process.env, "CURIO_API_TOKEN");
    try {
      expect(await isApiRequestAuthorized(new Request("https://curio.example/api/items"), "production")).toBe(false);
    } finally {
      if (previous !== undefined) process.env.CURIO_API_TOKEN = previous;
    }
  });

  it("uses a verified Better Auth session and enforces the private-beta invite list", async () => {
    const runtimeEnvironment = process.env as Record<string, string | undefined>;
    const previous = {
      authSecret: process.env.BETTER_AUTH_SECRET,
      authUrl: process.env.BETTER_AUTH_URL,
      googleClientId: process.env.GOOGLE_CLIENT_ID,
      googleClientSecret: process.env.GOOGLE_CLIENT_SECRET,
      invitedEmails: process.env.CURIO_INVITED_EMAILS,
      allowAnyGoogleUser: process.env.CURIO_ALLOW_ANY_GOOGLE_USER,
      legacyOwnerEmail: process.env.CURIO_LEGACY_OWNER_EMAIL,
      personalToken: process.env.CURIO_API_TOKEN,
    };
    runtimeEnvironment.BETTER_AUTH_SECRET = "a-test-secret-that-is-at-least-32-characters";
    runtimeEnvironment.BETTER_AUTH_URL = "https://curio.example";
    runtimeEnvironment.GOOGLE_CLIENT_ID = "google-client-id";
    runtimeEnvironment.GOOGLE_CLIENT_SECRET = "google-client-secret";
    process.env.CURIO_INVITED_EMAILS = "invited@example.com";
    process.env.CURIO_ALLOW_ANY_GOOGLE_USER = "false";
    process.env.CURIO_API_TOKEN = "legacy-token-must-not-bypass-auth";
    const request = new Request("https://curio.example/api/items", {
      headers: { Cookie: "curio.session_token=verified-user-session" },
    });
    try {
      const viewer = await authenticateApiRequest(request, {
        environment: "production",
        verifyBetterAuthSession: async (sessionRequest) => sessionRequest.headers.has("cookie") ? {
          profileId: "10000000-0000-4000-8000-000000000001",
          email: "invited@example.com",
        } : null,
      });
      expect(viewer).toEqual({
        profileId: "10000000-0000-4000-8000-000000000001",
        userId: "10000000-0000-4000-8000-000000000001",
        email: "invited@example.com",
        authMode: "better_auth",
      });

      const notInvited = await authenticateApiRequest(request, {
        environment: "production",
        verifyBetterAuthSession: async () => ({
          profileId: "20000000-0000-4000-8000-000000000002",
          email: "stranger@example.com",
        }),
      });
      expect(notInvited).toBeNull();

      process.env.CURIO_INVITED_EMAILS = "";
      const emptyInviteList = await authenticateApiRequest(request, {
        environment: "production",
        verifyBetterAuthSession: async () => ({
          profileId: "30000000-0000-4000-8000-000000000003",
          email: "anyone@example.com",
        }),
      });
      expect(emptyInviteList).toBeNull();
      process.env.CURIO_INVITED_EMAILS = "invited@example.com";

      process.env.CURIO_LEGACY_OWNER_EMAIL = "invited@example.com";
      const legacyOwner = await authenticateApiRequest(request, {
        environment: "production",
        verifyBetterAuthSession: async () => ({
          profileId: "10000000-0000-4000-8000-000000000001",
          email: "INVITED@example.com",
        }),
      });
      expect(legacyOwner).toEqual({
        profileId: "00000000-0000-4000-8000-000000000031",
        userId: "10000000-0000-4000-8000-000000000001",
        email: "INVITED@example.com",
        authMode: "better_auth",
      });

      const bearerOnly = await authenticateApiRequest(new Request("https://curio.example/api/items", {
        headers: { Authorization: "Bearer legacy-token-must-not-bypass-auth" },
      }), {
        environment: "production",
        verifyBetterAuthSession: async () => null,
      });
      expect(bearerOnly).toBeNull();
    } finally {
      for (const [name, value] of Object.entries({
        BETTER_AUTH_SECRET: previous.authSecret,
        BETTER_AUTH_URL: previous.authUrl,
        GOOGLE_CLIENT_ID: previous.googleClientId,
        GOOGLE_CLIENT_SECRET: previous.googleClientSecret,
        CURIO_INVITED_EMAILS: previous.invitedEmails,
        CURIO_ALLOW_ANY_GOOGLE_USER: previous.allowAnyGoogleUser,
        CURIO_LEGACY_OWNER_EMAIL: previous.legacyOwnerEmail,
        CURIO_API_TOKEN: previous.personalToken,
      })) {
        if (value === undefined) Reflect.deleteProperty(process.env, name);
        else process.env[name] = value;
      }
    }
  });

  it("does not mirror a new Supabase opaque key into a Bearer header", async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      expect(headers.get("apikey")).toBe("sb_secret_example");
      expect(headers.has("Authorization")).toBe(false);
      return new Response("{}", { status: 200 });
    }) as unknown as typeof fetch;
    const serverFetch = createSupabaseServerFetch("sb_secret_example", fetchImpl);
    await serverFetch("https://example.supabase.co/rest/v1/learning_item", {
      headers: {
        apikey: "sb_secret_example",
        Authorization: "Bearer sb_secret_example",
      },
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
