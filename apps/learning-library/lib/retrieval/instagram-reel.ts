import type { Browser, BrowserWorker, ElementHandle } from "@cloudflare/puppeteer";
import type {
  MediaTranscriber,
  PublicSourceRetrievalHints,
  PublicSourceRetrievalResult,
  PublicSourceRetriever,
  ReelFrameAnalyzer,
  SourceVisualCandidate,
} from "../ai/services";
import type { SourceMaterial } from "../domain";

export const PUBLIC_SOURCE_RETRIEVAL_VERSION = "public-source-v3-named-reel-evidence" as const;

const MAX_PUBLIC_AUDIO_BYTES = 12 * 1024 * 1024;
const MAX_REEL_DURATION_SECONDS = 20 * 60;
const MAX_REEL_FRAMES = 24;
const FRAME_INTERVAL_SECONDS = 2.5;
const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com", "instagr.am"]);

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type ReelFrame = SourceVisualCandidate;

export interface InstagramReelCaptureResult {
  sourceUrl: string;
  durationSeconds: number;
  caption: string | null;
  username: string | null;
  frames: ReelFrame[];
  mediaUrls: string[];
}

export interface InstagramReelCapture {
  capture(sourceUrl: string, discoveredMediaUrls?: string[]): Promise<InstagramReelCaptureResult>;
}

export function selectRepresentativeReelFrame(frames: ReelFrame[]): ReelFrame | null {
  if (!frames.length) return null;
  return [...frames].sort((left, right) => left.timestampSeconds - right.timestampSeconds)[0] ?? null;
}

function reelCoverTimestamp(durationSeconds: number): number {
  return Number(Math.min(1.5, Math.max(0, durationSeconds - 0.05), durationSeconds / 2).toFixed(2));
}

interface MediaEncodingMetadata {
  isAudio: boolean;
  isVideo: boolean;
  bitrate: number;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed || null;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 8_192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8_192));
  }
  return btoa(binary);
}

export function canonicalInstagramReelUrl(value: string): string | null {
  try {
    const source = new URL(value);
    if (source.protocol !== "https:" || !INSTAGRAM_HOSTS.has(source.hostname.toLowerCase())) return null;
    const match = source.pathname.match(/^\/(?:reel|reels)\/([A-Za-z0-9_-]+)/u);
    return match ? `https://www.instagram.com/reel/${match[1]}/` : null;
  } catch {
    return null;
  }
}

function isMetaMediaHost(hostname: string): boolean {
  const normalized = hostname.toLowerCase();
  return normalized === "cdninstagram.com"
    || normalized.endsWith(".cdninstagram.com")
    || normalized === "fbcdn.net"
    || normalized.endsWith(".fbcdn.net");
}

export function normalizeMetaMediaUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !isMetaMediaHost(url.hostname)) return null;
    url.searchParams.delete("bytestart");
    url.searchParams.delete("byteend");
    return url.toString();
  } catch {
    return null;
  }
}

function decodeEncodingMetadata(value: string): MediaEncodingMetadata {
  try {
    const normalized = value.replace(/-/gu, "+").replace(/_/gu, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded)) as Record<string, unknown>;
    const tag = nonEmptyString(parsed.vencode_tag)?.toLowerCase() ?? "";
    const mimeType = nonEmptyString(parsed.mime_type)?.toLowerCase() ?? "";
    const bitrateValue = typeof parsed.bitrate === "number" ? parsed.bitrate : Number(parsed.bitrate ?? 0);
    return {
      isAudio: tag.includes("audio") || mimeType.startsWith("audio/"),
      isVideo: tag.includes("video") || mimeType.startsWith("video/"),
      bitrate: Number.isFinite(bitrateValue) ? bitrateValue : 0,
    };
  } catch {
    return { isAudio: false, isVideo: false, bitrate: 0 };
  }
}

function encodingMetadata(value: string): MediaEncodingMetadata {
  try {
    const url = new URL(value);
    const metadata = url.searchParams.get("efg");
    if (metadata) return decodeEncodingMetadata(metadata);
    return {
      isAudio: /(?:^|[_/.-])audio(?:[_/.-]|$)/iu.test(`${url.pathname}${url.search}`),
      isVideo: /\.mp4$/iu.test(url.pathname),
      bitrate: 0,
    };
  } catch {
    return { isAudio: false, isVideo: false, bitrate: 0 };
  }
}

export function selectInstagramAudioUrl(mediaUrls: string[]): string | null {
  const candidates = new Map<string, MediaEncodingMetadata>();
  for (const value of mediaUrls) {
    const normalized = normalizeMetaMediaUrl(value);
    if (!normalized) continue;
    const metadata = encodingMetadata(normalized);
    if (!metadata.isAudio) continue;
    const current = candidates.get(normalized);
    if (!current || metadata.bitrate > current.bitrate) candidates.set(normalized, metadata);
  }
  return [...candidates.entries()]
    .sort((left, right) => right[1].bitrate - left[1].bitrate)[0]?.[0] ?? null;
}

export function selectInstagramVideoUrl(mediaUrls: string[]): string | null {
  const candidates = new Map<string, MediaEncodingMetadata>();
  for (const value of mediaUrls) {
    const normalized = normalizeMetaMediaUrl(value);
    if (!normalized) continue;
    const metadata = encodingMetadata(normalized);
    if (metadata.isAudio || (!metadata.isVideo && !new URL(normalized).pathname.toLowerCase().includes(".mp4"))) continue;
    const current = candidates.get(normalized);
    if (!current || metadata.bitrate > current.bitrate) candidates.set(normalized, metadata);
  }
  return [...candidates.entries()]
    .sort((left, right) => right[1].bitrate - left[1].bitrate)[0]?.[0] ?? null;
}

export function reelFrameTimestamps(durationSeconds: number): number[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return [];
  const usableDuration = Math.min(durationSeconds, MAX_REEL_DURATION_SECONDS);
  const count = Math.min(MAX_REEL_FRAMES, Math.max(1, Math.ceil(usableDuration / FRAME_INTERVAL_SECONDS)));
  const bucketWidth = usableDuration / count;
  return Array.from({ length: count }, (_value, index) => {
    const midpoint = (index + 0.5) * bucketWidth;
    return Number(Math.min(midpoint, Math.max(0, usableDuration - 0.05)).toFixed(2));
  });
}

async function responseBytes(response: Response, maximum: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maximum) throw new Error("Public Reel audio exceeds the retrieval limit.");
  if (!response.body) throw new Error("Public Reel audio response had no body.");

  const chunks: Uint8Array[] = [];
  const reader = response.body.getReader();
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) {
      await reader.cancel();
      throw new Error("Public Reel audio exceeds the retrieval limit.");
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

function metadataFromDescription(description: string): { caption: string | null; username: string | null } {
  const username = description.match(/-\s+([A-Za-z0-9._]+)\s+on\s+/u)?.[1] ?? null;
  const quotedCaption = description.match(/:\s+[“"]([\s\S]*?)[”"]\s*$/u)?.[1] ?? null;
  const plainCaption = quotedCaption ?? description.match(/:\s+([^:][\s\S]+)$/u)?.[1] ?? null;
  return { caption: nonEmptyString(plainCaption), username: nonEmptyString(username) };
}

export class CloudflareInstagramReelCapture implements InstagramReelCapture {
  constructor(private readonly browserWorker: BrowserWorker) {}

  async capture(sourceUrl: string, discoveredMediaUrls: string[] = []): Promise<InstagramReelCaptureResult> {
    return this.captureWithFrameMode(sourceUrl, discoveredMediaUrls, "analysis");
  }

  async captureCover(sourceUrl: string, discoveredMediaUrls: string[] = []): Promise<InstagramReelCaptureResult> {
    return this.captureWithFrameMode(sourceUrl, discoveredMediaUrls, "cover");
  }

  private async captureWithFrameMode(
    sourceUrl: string,
    discoveredMediaUrls: string[],
    frameMode: "analysis" | "cover",
  ): Promise<InstagramReelCaptureResult> {
    const canonicalUrl = canonicalInstagramReelUrl(sourceUrl);
    if (!canonicalUrl) throw new Error("The source is not a supported public Instagram Reel URL.");

    const { default: puppeteer } = await import("@cloudflare/puppeteer");
    let browser: Browser | null = null;
    try {
      browser = await puppeteer.launch(this.browserWorker);
      const page = await browser.newPage();
      page.setDefaultTimeout(30_000);
      await page.setViewport({ width: 540, height: 960, deviceScaleFactor: 1 });
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      );
      await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

      const mediaUrls = new Set(discoveredMediaUrls.filter((candidate) => Boolean(normalizeMetaMediaUrl(candidate))));
      page.on("response", (response) => {
        const candidate = response.url();
        if (normalizeMetaMediaUrl(candidate)) mediaUrls.add(candidate);
      });

      const directVideoUrl = selectInstagramVideoUrl(discoveredMediaUrls);
      let video: ElementHandle<HTMLVideoElement> | null;
      let fallbackDescription = "";
      let fallbackPosterUrl: string | null = null;
      if (directVideoUrl) {
        console.info(JSON.stringify({ event: "instagram_reel_using_client_discovered_media" }));
        await page.goto("about:blank");
        await page.evaluate((mediaUrl) => {
          document.documentElement.style.background = "black";
          document.body.style.margin = "0";
          const element = document.createElement("video");
          element.src = mediaUrl;
          element.preload = "auto";
          element.playsInline = true;
          element.style.width = "100vw";
          element.style.height = "100vh";
          element.style.objectFit = "contain";
          document.body.appendChild(element);
        }, directVideoUrl);
        video = await page.waitForSelector("video", { timeout: 20_000 }).catch(() => null);
      } else {
        await page.goto(canonicalUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
        const canonicalMetadata = await page.evaluate(() => ({
          description: document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content
            ?? document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content
            ?? "",
          posterUrl: document.querySelector<HTMLVideoElement>("video")?.poster
            ?? document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content
            ?? null,
        }));
        fallbackDescription = canonicalMetadata.description;
        fallbackPosterUrl = canonicalMetadata.posterUrl;
        video = await page.waitForSelector("video", { timeout: 15_000 }).catch(() => null);
        if (!video) {
          const embedUrl = `${canonicalUrl}embed/captioned/`;
          console.info(JSON.stringify({ event: "instagram_reel_using_public_embed_player" }));
          await page.goto(embedUrl, { waitUntil: "domcontentloaded", timeout: 45_000 });
          video = await page.waitForSelector("video", { timeout: 20_000 }).catch(() => null);
          const embedMetadata = await page.evaluate(() => ({
            description: document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content
              ?? document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content
              ?? "",
            posterUrl: document.querySelector<HTMLVideoElement>("video")?.poster
              ?? document.querySelector<HTMLMetaElement>('meta[property="og:image"]')?.content
              ?? null,
          }));
          fallbackDescription ||= embedMetadata.description;
          fallbackPosterUrl ??= embedMetadata.posterUrl;
        }
      }
      if (!video && frameMode === "cover") {
        const posterUrl = fallbackPosterUrl ? normalizeMetaMediaUrl(fallbackPosterUrl) : null;
        if (posterUrl) {
          console.info(JSON.stringify({ event: "instagram_reel_using_public_poster_cover" }));
          await page.goto("about:blank");
          await page.evaluate((imageUrl) => {
            document.documentElement.style.background = "black";
            document.body.style.margin = "0";
            const element = document.createElement("img");
            element.src = imageUrl;
            element.alt = "";
            element.style.width = "100vw";
            element.style.height = "100vh";
            element.style.objectFit = "cover";
            document.body.appendChild(element);
          }, posterUrl);
          const image = await page.waitForSelector("img", { timeout: 20_000 });
          if (!image) throw new Error("Instagram's public Reel poster did not load.");
          await page.waitForFunction(() => {
            const element = document.querySelector("img");
            return element instanceof HTMLImageElement && element.complete && element.naturalWidth > 0;
          }, { timeout: 20_000 });
          const screenshot = await image.screenshot({ type: "jpeg", quality: 72 });
          const metadata = metadataFromDescription(fallbackDescription);
          return {
            sourceUrl: canonicalUrl,
            durationSeconds: 0,
            caption: metadata.caption,
            username: metadata.username,
            frames: [{ timestampSeconds: 0, mimeType: "image/jpeg", base64: bytesToBase64(screenshot) }],
            mediaUrls: [...mediaUrls],
          };
        }
      }
      if (!video) throw new Error("Instagram did not expose a playable Reel element.");

      await page.evaluate(async () => {
        const element = document.querySelector("video");
        if (!(element instanceof HTMLVideoElement)) throw new Error("The Reel video element is unavailable.");
        element.volume = 0;
        element.muted = false;
        try {
          await element.play();
        } catch {
          element.muted = true;
          await element.play();
        }
        await new Promise((resolve) => setTimeout(resolve, 1_200));
        element.pause();
      });

      await page.waitForFunction(() => {
        const element = document.querySelector("video");
        return element instanceof HTMLVideoElement
          && Number.isFinite(element.duration)
          && element.duration > 0
          && element.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA;
      }, { timeout: 30_000 });

      const pageMetadata = await page.evaluate((storedDescription) => {
        const description = document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.content
          ?? document.querySelector<HTMLMetaElement>('meta[name="description"]')?.content
          ?? "";
        const duration = document.querySelector("video")?.duration ?? 0;
        return { description: description || storedDescription, duration };
      }, fallbackDescription);
      if (!Number.isFinite(pageMetadata.duration) || pageMetadata.duration <= 0) {
        throw new Error("Instagram did not expose a finite Reel duration.");
      }
      if (pageMetadata.duration > MAX_REEL_DURATION_SECONDS) {
        throw new Error("This Reel is longer than the current full-audio retrieval limit.");
      }

      const frames: ReelFrame[] = [];
      const frameTimestamps = frameMode === "cover"
        ? [reelCoverTimestamp(pageMetadata.duration)]
        : reelFrameTimestamps(pageMetadata.duration);
      for (const timestampSeconds of frameTimestamps) {
        try {
          await page.evaluate(async (targetTime) => {
            const element = document.querySelector("video");
            if (!(element instanceof HTMLVideoElement)) throw new Error("The Reel video element is unavailable.");
            element.pause();
            await new Promise<void>((resolve) => {
              let settled = false;
              const finish = () => {
                if (settled) return;
                settled = true;
                element.removeEventListener("seeked", finish);
                resolve();
              };
              element.addEventListener("seeked", finish, { once: true });
              element.currentTime = Math.min(targetTime, Math.max(0, element.duration - 0.05));
              setTimeout(finish, 2_500);
            });
            await new Promise((resolve) => setTimeout(resolve, 120));
          }, timestampSeconds);
          const image = await video.screenshot({ type: "jpeg", quality: 62 });
          frames.push({ timestampSeconds, mimeType: "image/jpeg", base64: bytesToBase64(image) });
        } catch (error) {
          console.warn(JSON.stringify({
            event: "instagram_reel_frame_capture_failed",
            timestampSeconds,
            errorType: error instanceof Error ? error.name : "unknown",
          }));
        }
      }

      const performanceUrls = await page.evaluate(() => performance.getEntriesByType("resource").map((entry) => entry.name));
      for (const candidate of performanceUrls) {
        if (normalizeMetaMediaUrl(candidate)) mediaUrls.add(candidate);
      }
      const metadata = metadataFromDescription(pageMetadata.description);

      return {
        sourceUrl: canonicalUrl,
        durationSeconds: pageMetadata.duration,
        caption: metadata.caption,
        username: metadata.username,
        frames,
        mediaUrls: [...mediaUrls],
      };
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (error) {
          console.warn(JSON.stringify({
            event: "instagram_reel_browser_close_failed",
            errorType: error instanceof Error ? error.name : "unknown",
          }));
        }
      }
    }
  }
}

export class InstagramFullReelRetriever implements PublicSourceRetriever {
  constructor(
    private readonly capture: InstagramReelCapture,
    private readonly transcriber: MediaTranscriber,
    private readonly frameAnalyzer: ReelFrameAnalyzer,
    private readonly fetcher: Fetcher = fetch,
  ) {}

  async retrieve(sourceUrl: string, hints?: PublicSourceRetrievalHints): Promise<PublicSourceRetrievalResult> {
    if (!canonicalInstagramReelUrl(sourceUrl)) {
      return { materials: [], creator: null, model: "instagram-full-reel", consultedUrls: [] };
    }

    const captured = await this.capture.capture(sourceUrl, hints?.publicMediaUrls ?? []);
    const materials: SourceMaterial[] = [];
    const models: string[] = [];
    let transcriptionModel: string | null = null;
    const audioUrl = selectInstagramAudioUrl(captured.mediaUrls);

    if (audioUrl) {
      try {
        const response = await this.fetcher(audioUrl, {
          headers: {
            "Accept": "audio/mp4,audio/*;q=0.9,video/mp4;q=0.8,*/*;q=0.5",
            "Referer": "https://www.instagram.com/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
          },
          redirect: "follow",
          signal: AbortSignal.timeout(60_000),
        });
        if (!response.ok) throw new Error(`Instagram Reel audio returned ${response.status}.`);
        const bytes = await responseBytes(response, MAX_PUBLIC_AUDIO_BYTES);
        const fileBuffer = (bytes.buffer as ArrayBuffer).slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
        const result = await this.transcriber.transcribe(new File([fileBuffer], "public-instagram-reel-audio.mp4", {
          type: response.headers.get("content-type")?.split(";")[0] || "audio/mp4",
        }));
        transcriptionModel = result.model;
        models.push(result.model);
        if (result.text) {
          materials.push({
            kind: "transcript",
            label: "Full speech transcript from the public Instagram Reel",
            text: result.text,
            origin: "instagram_browser_transcription",
            completeness: "complete_for_channel",
          });
        }
      } catch (error) {
        console.warn(JSON.stringify({
          event: "instagram_reel_audio_processing_failed",
          errorType: error instanceof Error ? error.name : "unknown",
          message: error instanceof Error ? error.message.slice(0, 240) : "Unknown Reel audio failure",
        }));
      }
    }

    if (captured.frames.length) {
      try {
        const result = await this.frameAnalyzer.analyzeReelFrames(captured.frames);
        models.push(result.model);
        if (result.text) {
          materials.push({
            kind: "visible_text",
            label: `Timestamped visual evidence sampled across the full ${Math.round(captured.durationSeconds)}-second Reel`,
            text: result.text,
            origin: "instagram_browser_visual_analysis",
            completeness: "partial",
          });
        }
      } catch (error) {
        console.warn(JSON.stringify({
          event: "instagram_reel_visual_analysis_failed",
          errorType: error instanceof Error ? error.name : "unknown",
          message: error instanceof Error ? error.message.slice(0, 240) : "Unknown Reel visual failure",
        }));
      }
    }

    if (captured.caption) {
      materials.push({
        kind: "caption",
        label: "Caption exposed by the public Instagram Reel page",
        text: captured.caption,
        origin: "instagram_browser_caption",
        completeness: "complete_for_channel",
      });
    }

    console.info(JSON.stringify({
      event: "instagram_full_reel_retrieved",
      durationSeconds: captured.durationSeconds,
      frameCount: captured.frames.length,
      audioFound: Boolean(audioUrl),
      materialKinds: materials.map((material) => material.kind),
    }));
    return {
      materials,
      creator: captured.username ? `@${captured.username.replace(/^@/u, "")}` : null,
      model: models.join("+") || "instagram-full-reel",
      transcriptionModel,
      consultedUrls: [captured.sourceUrl],
      sourceVisual: selectRepresentativeReelFrame(captured.frames),
    };
  }
}
