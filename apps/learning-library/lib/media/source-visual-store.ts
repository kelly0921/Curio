import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { SourceVisualCandidate } from "../ai/services";
import { sourceVisualSchema, type SourceVisual } from "../domain";

const MAX_SOURCE_VISUAL_BYTES = 2 * 1024 * 1024;
export const SOURCE_VISUAL_NORMALIZATION_VERSION = "full-bleed-9x16-v1" as const;

export interface StoredSourceVisual {
  body: ReadableStream<Uint8Array>;
  contentType: string;
  cacheControl: string;
  httpEtag: string;
}

export interface SourceVisualStore {
  put(input: {
    profileId: string;
    itemId: string;
    candidate: SourceVisualCandidate;
    capturedAt: string;
  }): Promise<SourceVisual>;
  get(objectKey: string): Promise<StoredSourceVisual | null>;
}

function decodeBase64(value: string): Uint8Array {
  if (value.length > Math.ceil(MAX_SOURCE_VISUAL_BYTES * 4 / 3) + 4) {
    throw new Error("The source cover exceeds Curio's storage limit.");
  }
  const binary = atob(value);
  if (binary.length > MAX_SOURCE_VISUAL_BYTES) {
    throw new Error("The source cover exceeds Curio's storage limit.");
  }
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function visualMetadata(input: {
  profileId: string;
  itemId: string;
  candidate: SourceVisualCandidate;
  capturedAt: string;
}): SourceVisual {
  return sourceVisualSchema.parse({
    kind: "reel_frame",
    objectKey: `profiles/${input.profileId}/items/${input.itemId}/cover.jpg`,
    mimeType: input.candidate.mimeType,
    timestampSeconds: input.candidate.timestampSeconds,
    normalizationVersion: SOURCE_VISUAL_NORMALIZATION_VERSION,
    capturedAt: input.capturedAt,
  });
}

class R2SourceVisualStore implements SourceVisualStore {
  constructor(private readonly bucket: R2Bucket) {}

  async put(input: {
    profileId: string;
    itemId: string;
    candidate: SourceVisualCandidate;
    capturedAt: string;
  }): Promise<SourceVisual> {
    const visual = visualMetadata(input);
    const bytes = decodeBase64(input.candidate.base64);
    await this.bucket.put(visual.objectKey, bytes, {
      httpMetadata: {
        contentType: visual.mimeType,
        cacheControl: "private, max-age=86400",
      },
      customMetadata: {
        kind: visual.kind,
        timestampSeconds: visual.timestampSeconds.toString(),
        normalizationVersion: SOURCE_VISUAL_NORMALIZATION_VERSION,
        capturedAt: visual.capturedAt,
      },
    });
    return visual;
  }

  async get(objectKey: string): Promise<StoredSourceVisual | null> {
    const object = await this.bucket.get(objectKey);
    if (!object) return null;
    return {
      body: object.body,
      contentType: object.httpMetadata?.contentType ?? "image/jpeg",
      cacheControl: object.httpMetadata?.cacheControl ?? "private, max-age=86400",
      httpEtag: object.httpEtag,
    };
  }
}

class MemorySourceVisualStore implements SourceVisualStore {
  private readonly objects = new Map<string, { bytes: Uint8Array; contentType: string }>();

  async put(input: {
    profileId: string;
    itemId: string;
    candidate: SourceVisualCandidate;
    capturedAt: string;
  }): Promise<SourceVisual> {
    const visual = visualMetadata(input);
    this.objects.set(visual.objectKey, { bytes: decodeBase64(input.candidate.base64), contentType: visual.mimeType });
    return visual;
  }

  async get(objectKey: string): Promise<StoredSourceVisual | null> {
    const object = this.objects.get(objectKey);
    if (!object) return null;
    const bytes = object.bytes.slice();
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    const etag = `"${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}"`;
    return {
      body: new Blob([bytes], { type: object.contentType }).stream(),
      contentType: object.contentType,
      cacheControl: "private, max-age=3600",
      httpEtag: etag,
    };
  }
}

const runtime = globalThis as typeof globalThis & {
  curioMemorySourceVisualStore?: MemorySourceVisualStore;
};

const memoryStore = runtime.curioMemorySourceVisualStore ?? new MemorySourceVisualStore();
runtime.curioMemorySourceVisualStore = memoryStore;

async function cloudflareBucket(): Promise<R2Bucket | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as CloudflareEnv & { CURIO_SOURCE_MEDIA?: R2Bucket }).CURIO_SOURCE_MEDIA ?? null;
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Cloudflare R2 binding CURIO_SOURCE_MEDIA is unavailable.", { cause: error });
    }
    return null;
  }
}

export async function getSourceVisualStore(): Promise<SourceVisualStore> {
  const bucket = await cloudflareBucket();
  if (bucket) return new R2SourceVisualStore(bucket);
  if (process.env.NODE_ENV === "production") {
    throw new Error("Cloudflare R2 binding CURIO_SOURCE_MEDIA is unavailable.");
  }
  return memoryStore;
}
