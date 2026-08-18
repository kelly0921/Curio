import { describe, expect, it, vi } from "vitest";
import type { MediaTranscriber, ReelFrameAnalyzer } from "@/lib/ai/services";
import {
  InstagramPublicEmbedRetriever,
  parseInstagramEmbedPayload,
  PublicSourceRetrieverChain,
} from "@/lib/retrieval/public-source";
import {
  InstagramFullReelRetriever,
  normalizeMetaMediaUrl,
  reelFrameTimestamps,
  selectInstagramAudioUrl,
  selectInstagramVideoUrl,
  type InstagramReelCapture,
} from "@/lib/retrieval/instagram-reel";

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

  it("normalizes ranged Meta CDN media and selects the audio encoding", () => {
    const audioMetadata = btoa(JSON.stringify({ vencode_tag: "dash_baseline_audio", bitrate: 128000 }));
    const videoMetadata = btoa(JSON.stringify({ vencode_tag: "dash_baseline_1080p", bitrate: 3500000 }));
    const audioUrl = `https://media.cdninstagram.com/reel.mp4?efg=${encodeURIComponent(audioMetadata)}&bytestart=0&byteend=999`;
    const videoUrl = `https://media.cdninstagram.com/reel.mp4?efg=${encodeURIComponent(videoMetadata)}&bytestart=0&byteend=999`;

    expect(normalizeMetaMediaUrl(audioUrl)).not.toContain("bytestart");
    expect(normalizeMetaMediaUrl(audioUrl)).not.toContain("byteend");
    expect(selectInstagramAudioUrl([videoUrl, audioUrl])).toBe(normalizeMetaMediaUrl(audioUrl));
    expect(selectInstagramVideoUrl([audioUrl, videoUrl])).toBe(normalizeMetaMediaUrl(videoUrl));
    expect(normalizeMetaMediaUrl("https://example.com/reel.mp4")).toBeNull();
  });

  it("samples the complete Reel timeline with a bounded number of frames", () => {
    const timestamps = reelFrameTimestamps(55.33);

    expect(timestamps).toHaveLength(23);
    expect(timestamps[0]).toBeGreaterThan(0);
    expect(timestamps.at(-1)).toBeGreaterThan(53);
    expect(reelFrameTimestamps(600)).toHaveLength(24);
  });

  it("uses full audio and timestamped frames before the caption", async () => {
    const audioMetadata = btoa(JSON.stringify({ vencode_tag: "dash_baseline_audio", bitrate: 128000 }));
    const capture: InstagramReelCapture = {
      capture: vi.fn().mockResolvedValue({
        sourceUrl: "https://www.instagram.com/reel/ABC123/",
        durationSeconds: 55.33,
        caption: "Five Japan trip tips.",
        username: "public_teacher",
        frames: [{ timestampSeconds: 2.5, mimeType: "image/jpeg", base64: "aW1hZ2U=" }],
        mediaUrls: [`https://media.cdninstagram.com/reel.mp4?efg=${encodeURIComponent(audioMetadata)}&bytestart=0&byteend=3`],
      }),
    };
    const transcriber: MediaTranscriber = {
      transcribe: vi.fn().mockResolvedValue({ text: "Tip one. Tip two. Tip three. Tip four. Tip five.", model: "test-transcriber" }),
    };
    const frameAnalyzer: ReelFrameAnalyzer = {
      analyzeReelFrames: vi.fn().mockResolvedValue({ text: "[00:02] On-screen text: Tip 1", model: "test-vision" }),
    };
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200,
      headers: { "Content-Length": "3", "Content-Type": "audio/mp4" },
    }));
    const mediaHint = `https://media.cdninstagram.com/reel.mp4?efg=${encodeURIComponent(audioMetadata)}&bytestart=0&byteend=3`;
    const result = await new InstagramFullReelRetriever(capture, transcriber, frameAnalyzer, fetcher)
      .retrieve("https://www.instagram.com/reel/ABC123/?igsh=tracking", { publicMediaUrls: [mediaHint] });

    expect(result.creator).toBe("@public_teacher");
    expect(result.transcriptionModel).toBe("test-transcriber");
    expect(result.materials.map((material) => material.origin)).toEqual([
      "instagram_browser_transcription",
      "instagram_browser_visual_analysis",
      "instagram_browser_caption",
    ]);
    expect(fetcher).toHaveBeenCalledWith(expect.not.stringContaining("bytestart"), expect.any(Object));
    expect(transcriber.transcribe).toHaveBeenCalledOnce();
    expect(frameAnalyzer.analyzeReelFrames).toHaveBeenCalledOnce();
    expect(capture.capture).toHaveBeenCalledWith(
      "https://www.instagram.com/reel/ABC123/?igsh=tracking",
      [mediaHint],
    );
  });

  it("falls through to text retrieval when full-Reel browser capture fails", async () => {
    const fullReel = new InstagramFullReelRetriever(
      { capture: vi.fn().mockRejectedValue(new Error("Browser blocked")) },
      { transcribe: vi.fn() },
      { analyzeReelFrames: vi.fn() },
    );
    const textFallback = {
      retrieve: vi.fn().mockResolvedValue({
        materials: [{
          kind: "caption" as const,
          label: "Fallback caption",
          text: "Five Japan trip tips.",
          origin: "openai_web_search" as const,
          completeness: "partial" as const,
        }],
        creator: "@public_teacher",
        model: "fallback",
        consultedUrls: ["https://www.instagram.com/reel/ABC123/"],
      }),
    };

    const result = await new PublicSourceRetrieverChain([fullReel, textFallback])
      .retrieve("https://www.instagram.com/reel/ABC123/");

    expect(result.materials[0]?.origin).toBe("openai_web_search");
    expect(textFallback.retrieve).toHaveBeenCalledOnce();
  });
});
