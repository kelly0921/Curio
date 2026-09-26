import { describe, expect, it } from "vitest";
import { curioAuthConfiguration, isInvitedCurioEmail } from "@/lib/auth/server";

describe("Curio auth configuration", () => {
  it("stays disabled until every server credential is present", () => {
    expect(curioAuthConfiguration({
      BETTER_AUTH_URL: "https://curio.example",
      BETTER_AUTH_SECRET: "too-short",
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
    })).toBeNull();
  });

  it("normalizes trusted origins and the invite list", () => {
    const configuration = curioAuthConfiguration({
      BETTER_AUTH_URL: "https://curio.example/api/auth",
      BETTER_AUTH_SECRET: "a-test-secret-that-is-at-least-32-characters",
      GOOGLE_CLIENT_ID: "client-id",
      GOOGLE_CLIENT_SECRET: "client-secret",
      CURIO_ALLOWED_ORIGINS: "https://curio-app.pages.dev,not-a-url",
      CURIO_NATIVE_AUTH_ORIGINS: "exp://192.168.0.231:8081,exp://**,https://attacker.example",
      CURIO_INVITED_EMAILS: " Kelly@example.com,friend@example.com ",
      NODE_ENV: "development",
    });

    expect(configuration).not.toBeNull();
    expect(configuration?.trustedOrigins).toEqual([
      "https://curio.example",
      "https://curio-app.pages.dev",
      "exp://192.168.0.231:8081",
      "curio://",
      "curio://*",
      "exp://",
      "exp://**",
    ]);
    expect(configuration?.invitedEmails).toEqual(new Set(["kelly@example.com", "friend@example.com"]));
  });

  it("allows all users only when no invite list is configured", () => {
    expect(isInvitedCurioEmail("anyone@example.com", new Set())).toBe(true);
    expect(isInvitedCurioEmail("KELLY@example.com", new Set(["kelly@example.com"]))).toBe(true);
    expect(isInvitedCurioEmail("stranger@example.com", new Set(["kelly@example.com"]))).toBe(false);
  });
});
