import { describe, expect, it, vi } from "vitest";
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
