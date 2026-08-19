import { describe, expect, it } from "vitest";
import { readBoundedJson, RequestBodyTooLargeError } from "@/lib/api/request-body";

describe("bounded API request bodies", () => {
  it("parses a small JSON body", async () => {
    const request = new Request("https://curio.example/api", {
      method: "POST",
      body: JSON.stringify({ action: "start" }),
    });

    await expect(readBoundedJson(request, 128)).resolves.toEqual({ action: "start" });
  });

  it("stops reading once an undeclared body exceeds the limit", async () => {
    const request = new Request("https://curio.example/api", {
      method: "POST",
      body: JSON.stringify({ value: "x".repeat(256) }),
    });
    request.headers.delete("content-length");

    await expect(readBoundedJson(request, 64)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
  });
});
