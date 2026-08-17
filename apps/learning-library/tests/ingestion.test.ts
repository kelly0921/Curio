import { describe, expect, it } from "vitest";
import { IngestionValidationError, parseIngestionForm } from "@/lib/api/ingestion";

describe("ingestion validation", () => {
  it("accepts an Instagram Reel URL without pretending to retrieve it", () => {
    const form = new FormData();
    form.set("sourceType", "instagram_url");
    form.set("sourceUrl", "https://www.instagram.com/reel/ABC123/?utm_source=share");
    form.set("intent", "remember");
    const input = parseIngestionForm(form);
    expect(input.sourceType).toBe("instagram_url");
    expect(input.mediaFile).toBeNull();
  });

  it("rejects a lookalike non-Instagram host", () => {
    const form = new FormData();
    form.set("sourceType", "instagram_url");
    form.set("sourceUrl", "https://instagram.com.example.test/reel/ABC123/");
    expect(() => parseIngestionForm(form)).toThrow(IngestionValidationError);
  });

  it("accepts a general HTTPS video link for processing", () => {
    const form = new FormData();
    form.set("sourceType", "external_url");
    form.set("sourceUrl", "https://www.youtube.com/watch?v=ABC123");
    form.set("intent", "try");
    const input = parseIngestionForm(form);
    expect(input.sourceType).toBe("external_url");
    expect(input.sourceUrl).toBe("https://www.youtube.com/watch?v=ABC123");
  });

  it("rejects non-HTTPS external links", () => {
    const form = new FormData();
    form.set("sourceType", "external_url");
    form.set("sourceUrl", "http://example.com/video");
    expect(() => parseIngestionForm(form)).toThrow(IngestionValidationError);
  });

  it("accepts supported uploaded media", () => {
    const form = new FormData();
    form.set("sourceType", "uploaded_media");
    form.set("media", new File(["media"], "lesson.mp4", { type: "video/mp4" }));
    const input = parseIngestionForm(form);
    expect(input.mediaFile?.name).toBe("lesson.mp4");
  });
});
