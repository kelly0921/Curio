import { describe, expect, it, vi } from "vitest";
import type { MediaTranscriber } from "@/lib/ai/services";
import {
  InstagramPublicEmbedRetriever,
  parseInstagramEmbedPayload,
} from "@/lib/retrieval/public-source";

function embedFixture(): string {
  const mediaPayload = JSON.stringify({
    media: {
      edge_media_to_caption: { edges: [{ node: { text: "A public source caption." } }] },
      owner: { username: "public_teacher" },
      video_url: "https://media.cdninstagram.com/reel.mp4",
    },
  });
  return `<html><script type="application/json">${JSON.stringify({ payload: mediaPayload })}</script></html>`;
}

describe("public Instagram retrieval", () => {
  it("parses caption, creator, and video URL from nested embed JSON", () => {
    expect(parseInstagramEmbedPayload(embedFixture())).toEqual({
      caption: "A public source caption.",
      username: "public_teacher",
      videoUrl: "https://media.cdninstagram.com/reel.mp4",
    });
  });

  it("parses Instagram's escaped embed payload fallback", () => {
    const escaped = String.raw`<script>\"edge_media_to_caption\":{\"edges\":[{\"node\":{\"text\":\"A useful public caption.\"}}]},\"owner\":{\"username\":\"public_teacher\"},\"video_url\":\"https:\\\/\\\/media.cdninstagram.com\\\/reel.mp4\"</script>`;
    expect(parseInstagramEmbedPayload(escaped)).toEqual({
      caption: "A useful public caption.",
      username: "public_teacher",
      videoUrl: "https://media.cdninstagram.com/reel.mp4",
    });
  });

  it("keeps the public caption and transcribes bounded Reel media", async () => {
    const transcriber: MediaTranscriber = {
      transcribe: vi.fn().mockResolvedValue({ text: "The spoken lesson from the Reel.", model: "test-transcriber" }),
    };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(embedFixture(), {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { "Content-Length": "3", "Content-Type": "video/mp4" },
      }));
    const retriever = new InstagramPublicEmbedRetriever(transcriber, fetcher);

    const result = await retriever.retrieve("https://www.instagram.com/reel/ABC123/?igsh=tracking");

    expect(result.creator).toBe("@public_teacher");
    expect(result.model).toBe("test-transcriber");
    expect(result.materials).toEqual([
      expect.objectContaining({ kind: "caption", origin: "instagram_public_embed_caption" }),
      expect.objectContaining({ kind: "transcript", origin: "instagram_public_embed_transcription" }),
    ]);
    expect(fetcher).toHaveBeenNthCalledWith(1, new URL("https://www.instagram.com/reel/ABC123/embed/captioned/"), expect.any(Object));
    expect(transcriber.transcribe).toHaveBeenCalledOnce();
  });

  it("does not fetch non-Instagram sources", async () => {
    const fetcher = vi.fn();
    const retriever = new InstagramPublicEmbedRetriever({ transcribe: vi.fn() }, fetcher);
    const result = await retriever.retrieve("https://example.com/video");

    expect(result.materials).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
