import { MAX_MEDIA_BYTES } from "../api/ingestion";
import { stagedMediaSchema, type StagedMedia } from "./domain";

function safeFilename(name: string): string {
  const compact = name.trim().replace(/[^a-zA-Z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return (compact || "source-media").slice(-160);
}

export class R2ProcessingMediaStore {
  constructor(private readonly bucket: R2Bucket) {}

  async stage(profileId: string, jobId: string, file: File): Promise<StagedMedia> {
    if (file.size <= 0 || file.size > MAX_MEDIA_BYTES) throw new Error("INVALID_STAGED_MEDIA_SIZE");
    const media = stagedMediaSchema.parse({
      objectKey: `profiles/${profileId}/jobs/${jobId}/source/${safeFilename(file.name)}`,
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
    });
    await this.bucket.put(media.objectKey, file.stream(), {
      httpMetadata: { contentType: media.type, cacheControl: "private, no-store" },
      customMetadata: { kind: "processing-source", name: media.name, size: String(media.size) },
    });
    return media;
  }

  async load(media: StagedMedia): Promise<File> {
    const object = await this.bucket.get(media.objectKey);
    if (!object) throw new Error("STAGED_MEDIA_NOT_FOUND");
    const bytes = await object.arrayBuffer();
    if (bytes.byteLength !== media.size || bytes.byteLength > MAX_MEDIA_BYTES) {
      throw new Error("STAGED_MEDIA_SIZE_MISMATCH");
    }
    return new File([bytes], media.name, { type: media.type });
  }

  async remove(media: StagedMedia | null): Promise<void> {
    if (media) await this.bucket.delete(media.objectKey);
  }
}
