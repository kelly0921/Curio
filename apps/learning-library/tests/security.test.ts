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

  it("uses a verified Supabase identity and enforces the private-beta invite list", async () => {
    const previous = {
      authUrl: process.env.SUPABASE_AUTH_URL,
      publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY,
      invitedEmails: process.env.CURIO_INVITED_EMAILS,
      legacyOwnerEmail: process.env.CURIO_LEGACY_OWNER_EMAIL,
      personalToken: process.env.CURIO_API_TOKEN,
    };
    process.env.SUPABASE_AUTH_URL = "https://curio-auth.example";
    process.env.SUPABASE_PUBLISHABLE_KEY = "sb_publishable_example";
    process.env.CURIO_INVITED_EMAILS = "invited@example.com";
    process.env.CURIO_API_TOKEN = "legacy-token-must-not-bypass-auth";
    const request = new Request("https://curio.example/api/items", {
      headers: { Authorization: "Bearer verified-user-token" },
    });
    try {
      const viewer = await authenticateApiRequest(request, {
        environment: "production",
        verifySupabaseToken: async (token) => token === "verified-user-token" ? {
          profileId: "10000000-0000-4000-8000-000000000001",
          email: "invited@example.com",
        } : null,
      });
      expect(viewer).toEqual({
        profileId: "10000000-0000-4000-8000-000000000001",
        email: "invited@example.com",
        authMode: "supabase",
      });

      const notInvited = await authenticateApiRequest(request, {
        environment: "production",
        verifySupabaseToken: async () => ({
          profileId: "20000000-0000-4000-8000-000000000002",
          email: "stranger@example.com",
        }),
      });
      expect(notInvited).toBeNull();

      process.env.CURIO_LEGACY_OWNER_EMAIL = "invited@example.com";
      const legacyOwner = await authenticateApiRequest(request, {
        environment: "production",
        verifySupabaseToken: async () => ({
          profileId: "10000000-0000-4000-8000-000000000001",
          email: "INVITED@example.com",
        }),
      });
      expect(legacyOwner).toEqual({
        profileId: "00000000-0000-4000-8000-000000000031",
        email: "INVITED@example.com",
        authMode: "supabase",
      });
    } finally {
      for (const [name, value] of Object.entries({
        SUPABASE_AUTH_URL: previous.authUrl,
        SUPABASE_PUBLISHABLE_KEY: previous.publishableKey,
        CURIO_INVITED_EMAILS: previous.invitedEmails,
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
