import { z } from "zod";
import { intentSchema, sourceTypeSchema, type IngestionInput } from "../domain";

export const MAX_MEDIA_BYTES = 20 * 1024 * 1024;
export const MAX_REQUEST_BYTES = MAX_MEDIA_BYTES + (512 * 1024);

const supportedMediaExtensions = new Set(["mp3", "mp4", "m4a", "mpeg", "mpga", "ogg", "wav", "webm", "mov"]);
const supportedMediaTypes = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/ogg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "video/quicktime",
  "video/webm",
  "application/octet-stream",
]);

const fieldsSchema = z.object({
  sourceType: sourceTypeSchema,
  sourceUrl: z.string().trim().max(2_000).nullable(),
  creator: z.string().trim().max(200).nullable(),
  sourceCaption: z.string().trim().max(12_000).nullable(),
  extractedVisualText: z.string().trim().max(20_000).nullable(),
  intent: intentSchema,
}).strict();

export class IngestionValidationError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 400) {
    super(message);
  }
}

function nullableText(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function assertInstagramUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IngestionValidationError("INVALID_INSTAGRAM_URL", "Enter a valid Instagram URL.");
  }
  const hostname = url.hostname.toLowerCase();
  const supportedHost = hostname === "instagram.com" || hostname === "www.instagram.com" || hostname === "instagr.am";
  const supportedPath = /^\/(?:reel|reels|p)\//i.test(url.pathname);
  if (url.protocol !== "https:" || !supportedHost || !supportedPath) {
    throw new IngestionValidationError(
      "INVALID_INSTAGRAM_URL",
      "Use an HTTPS Instagram Reel or post URL. The server will store it but will not scrape Instagram.",
    );
  }
}

function assertExternalUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new IngestionValidationError("INVALID_SOURCE_URL", "Enter a valid source URL.");
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) {
    throw new IngestionValidationError(
      "INVALID_SOURCE_URL",
      "Use a public HTTPS link without embedded credentials.",
    );
  }
}

function assertMediaFile(file: File): void {
  if (!file.name || file.size === 0) {
    throw new IngestionValidationError("EMPTY_MEDIA_FILE", "Choose a non-empty media file.");
  }
  if (file.size > MAX_MEDIA_BYTES) {
    throw new IngestionValidationError("MEDIA_TOO_LARGE", "V0.1 accepts media files up to 20 MB.", 413);
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!supportedMediaExtensions.has(extension) || !supportedMediaTypes.has(file.type || "application/octet-stream")) {
    throw new IngestionValidationError(
      "UNSUPPORTED_MEDIA_TYPE",
      "Use MP3, MP4, M4A, MPEG, OGG, WAV, WebM, or MOV media.",
      415,
    );
  }
}

export function parseIngestionForm(formData: FormData): IngestionInput {
  const parsed = fieldsSchema.safeParse({
    sourceType: nullableText(formData.get("sourceType")),
    sourceUrl: nullableText(formData.get("sourceUrl")),
    creator: nullableText(formData.get("creator")),
    sourceCaption: nullableText(formData.get("sourceCaption")),
    extractedVisualText: nullableText(formData.get("extractedVisualText")),
    intent: nullableText(formData.get("intent")) ?? "remember",
  });
  if (!parsed.success) {
    throw new IngestionValidationError("INVALID_INGESTION_FIELDS", "Check the submitted source fields and try again.");
  }

  const fileValue = formData.get("media");
  const mediaFile = fileValue instanceof File && fileValue.size > 0 ? fileValue : null;
  if (parsed.data.sourceType === "uploaded_media") {
    if (!mediaFile) throw new IngestionValidationError("MEDIA_FILE_REQUIRED", "Choose a video or audio file.");
    assertMediaFile(mediaFile);
  }
  if (parsed.data.sourceType === "instagram_url") {
    if (!parsed.data.sourceUrl) throw new IngestionValidationError("INSTAGRAM_URL_REQUIRED", "Paste an Instagram URL.");
    assertInstagramUrl(parsed.data.sourceUrl);
  }
  if (parsed.data.sourceType === "external_url") {
    if (!parsed.data.sourceUrl) throw new IngestionValidationError("SOURCE_URL_REQUIRED", "Paste a source URL.");
    assertExternalUrl(parsed.data.sourceUrl);
  }

  return { ...parsed.data, mediaFile };
}
