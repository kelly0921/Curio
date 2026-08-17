import type {
  MediaTranscriber,
  PublicSourceRetrievalResult,
  PublicSourceRetriever,
} from "../ai/services";
import type { SourceMaterial } from "../domain";

const MAX_EMBED_HTML_BYTES = 1_500_000;
const MAX_PUBLIC_MEDIA_BYTES = 24 * 1024 * 1024;
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "instagr.am"]);

interface InstagramEmbedMedia {
  caption: string | null;
  username: string | null;
  videoUrl: string | null;
}

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function mediaFromNode(value: Record<string, unknown>): InstagramEmbedMedia | null {
  const captionEdge = record(value.edge_media_to_caption);
  const edges = Array.isArray(captionEdge?.edges) ? captionEdge.edges : [];
  const firstEdge = record(edges[0]);
  const caption = nonEmptyString(record(firstEdge?.node)?.text);
  const username = nonEmptyString(record(value.owner)?.username);
  const videoUrl = nonEmptyString(value.video_url);
  return caption || username || videoUrl ? { caption, username, videoUrl } : null;
}

function findEmbedMedia(value: unknown, depth = 0): InstagramEmbedMedia | null {
  if (depth > 30) return null;
  const object = record(value);
  if (object) {
    if ("edge_media_to_caption" in object || "video_url" in object) {
      const media = mediaFromNode(object);
      if (media) return media;
    }
    for (const child of Object.values(object)) {
      const media = findEmbedMedia(child, depth + 1);
      if (media) return media;
    }
    return null;
  }
  if (Array.isArray(value)) {
    for (const child of value) {
      const media = findEmbedMedia(child, depth + 1);
      if (media) return media;
    }
    return null;
  }
  if (typeof value === "string" && value.includes("edge_media_to_caption") && value.length <= MAX_EMBED_HTML_BYTES) {
    try {
      return findEmbedMedia(JSON.parse(value), depth + 1);
    } catch {
      return null;
    }
  }
  return null;
}

function decodeEscapedEmbedValue(value: string | undefined): string | null {
  if (!value) return null;
  return nonEmptyString(value
    .replace(/\\+u([0-9a-f]{4})/giu, (_match, code: string) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/\\+n/gu, "\n")
    .replace(/\\+r/gu, "\r")
    .replace(/\\+t/gu, "\t")
    .replace(/\\+\//gu, "/")
    .replace(/\\+"/gu, "\"")
    .replace(/\\\\/gu, "\\"));
}

function parseEscapedEmbedPayload(html: string): InstagramEmbedMedia | null {
  const marker = html.indexOf("edge_media_to_caption");
  if (marker < 0) return null;
  const payload = html.slice(marker, Math.min(html.length, marker + 180_000));
  const caption = decodeEscapedEmbedValue(payload.match(/\\"text\\":\\"([\s\S]*?)\\"\}\}\]\}/u)?.[1]);
  const username = decodeEscapedEmbedValue(payload.match(/\\"username\\":\\"([\s\S]*?)\\"/u)?.[1]);
  const videoUrl = decodeEscapedEmbedValue(payload.match(/\\"video_url\\":\\"([\s\S]*?)\\"/u)?.[1]);
  return caption || username || videoUrl ? { caption, username, videoUrl } : null;
}

export function parseInstagramEmbedPayload(html: string): InstagramEmbedMedia | null {
  const scripts = html.matchAll(/<script\b[^>]*\btype=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/giu);
  for (const match of scripts) {
    try {
      const media = findEmbedMedia(JSON.parse(match[1]));
      if (media) return media;
    } catch {
      // Instagram can include unrelated non-JSON script blocks; continue to the next one.
    }
  }
  return parseEscapedEmbedPayload(html);
}

function embedUrlFor(sourceUrl: string): URL | null {
  const source = new URL(sourceUrl);
  if (source.protocol !== "https:" || !INSTAGRAM_HOSTS.has(source.hostname.toLowerCase())) return null;
  const match = source.pathname.match(/^\/(reel|reels|p)\/([A-Za-z0-9_-]+)/u);
  if (!match) return null;
  const kind = match[1] === "reels" ? "reel" : match[1];
  return new URL(`https://www.instagram.com/${kind}/${match[2]}/embed/captioned/`);
}

function isMetaMediaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:" && (
      hostname === "cdninstagram.com"
      || hostname.endsWith(".cdninstagram.com")
      || hostname === "fbcdn.net"
      || hostname.endsWith(".fbcdn.net")
    );
  } catch {
    return false;
  }
}

async function responseBytes(response: Response, maximum: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maximum) throw new Error("Public media exceeds the retrieval limit.");
  if (!response.body) throw new Error("Public media response had no body.");

  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      throw new Error("Public media exceeds the retrieval limit.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export class InstagramPublicEmbedRetriever implements PublicSourceRetriever {
  constructor(
    private readonly transcriber: MediaTranscriber,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async retrieve(sourceUrl: string): Promise<PublicSourceRetrievalResult> {
    const embedUrl = embedUrlFor(sourceUrl);
    if (!embedUrl) {
      return { materials: [], creator: null, model: "instagram-public-embed", consultedUrls: [] };
    }

    const embedResponse = await this.fetcher(embedUrl, {
      headers: {
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Microsoft Windows 10.0.26200; en-US) PowerShell/7.6.4",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
    if (!embedResponse.ok) throw new Error(`Instagram embed returned ${embedResponse.status}.`);
    const declaredHtmlBytes = Number(embedResponse.headers.get("content-length") ?? "0");
    if (Number.isFinite(declaredHtmlBytes) && declaredHtmlBytes > MAX_EMBED_HTML_BYTES) {
      throw new Error("Instagram embed response was unexpectedly large.");
    }
    const html = await embedResponse.text();
    if (html.length > MAX_EMBED_HTML_BYTES) throw new Error("Instagram embed response was unexpectedly large.");

    const media = parseInstagramEmbedPayload(html);
    if (!media) {
      throw new Error(
        `Instagram did not expose public embed media metadata (bytes=${html.length}, captionMarker=${html.includes("edge_media_to_caption")}).`,
      );
    }

    const materials: SourceMaterial[] = [];
    if (media.caption) {
      materials.push({
        kind: "caption",
        label: "Caption exposed by Instagram's public embed",
        text: media.caption,
        origin: "instagram_public_embed_caption",
        completeness: "complete_for_channel",
      });
    }

    let model = "instagram-public-embed";
    if (media.videoUrl && isMetaMediaUrl(media.videoUrl)) {
      try {
        const mediaResponse = await this.fetcher(media.videoUrl, {
          headers: { "Accept": "video/mp4,video/*;q=0.9,*/*;q=0.8", "Referer": "https://www.instagram.com/" },
          redirect: "follow",
          signal: AbortSignal.timeout(60_000),
        });
        if (!mediaResponse.ok) throw new Error(`Instagram media returned ${mediaResponse.status}.`);
        const bytes = await responseBytes(mediaResponse, MAX_PUBLIC_MEDIA_BYTES);
        const fileBuffer = (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const transcription = await this.transcriber.transcribe(new File([fileBuffer], "public-instagram-reel.mp4", {
          type: mediaResponse.headers.get("content-type")?.split(";")[0] || "video/mp4",
        }));
        model = transcription.model;
        if (transcription.text) {
          materials.push({
            kind: "transcript",
            label: "Speech transcript from the public Instagram Reel",
            text: transcription.text,
            origin: "instagram_public_embed_transcription",
            completeness: "complete_for_channel",
          });
        }
      } catch {
        // A public caption remains usable evidence when media download or transcription is unavailable.
      }
    }

    console.info(JSON.stringify({
      event: "instagram_public_embed_retrieved",
      creatorFound: Boolean(media.username),
      materialKinds: materials.map((material) => material.kind),
      materialLengths: materials.map((material) => material.text.length),
      transcriptionModel: model,
    }));
    return {
      materials,
      creator: media.username ? `@${media.username.replace(/^@/u, "")}` : null,
      model,
      consultedUrls: [sourceUrl, embedUrl.toString()],
    };
  }
}

export class PublicSourceRetrieverChain implements PublicSourceRetriever {
  constructor(private readonly retrievers: PublicSourceRetriever[]) {}

  async retrieve(sourceUrl: string): Promise<PublicSourceRetrievalResult> {
    const consultedUrls = new Set<string>();
    let lastModel = "public-source-retrieval";
    for (const retriever of this.retrievers) {
      try {
        const result = await retriever.retrieve(sourceUrl);
        for (const url of result.consultedUrls) consultedUrls.add(url);
        lastModel = result.model;
        if (result.materials.length) return { ...result, consultedUrls: [...consultedUrls] };
      } catch (error) {
        console.warn(JSON.stringify({
          event: "public_source_strategy_failed",
          strategy: retriever.constructor.name,
          errorType: error instanceof Error ? error.name : "unknown",
          message: error instanceof Error ? error.message.slice(0, 240) : "Unknown retrieval failure",
        }));
        // Continue to the next bounded retrieval strategy.
      }
    }
    return { materials: [], creator: null, model: lastModel, consultedUrls: [...consultedUrls] };
  }
}

export function experimentalInstagramEmbedEnabled(): boolean {
  const configured = process.env.ENABLE_EXPERIMENTAL_INSTAGRAM_EMBED?.trim().toLowerCase();
  if (configured) return configured === "true" || configured === "1";
  return process.env.NODE_ENV !== "production";
}
