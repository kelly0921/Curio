import { getCloudflareContext } from "@opennextjs/cloudflare";
import type { ProcessingJobMessage } from "./domain";
import { D1ProcessingJobRepository } from "./repository";
import { R2ProcessingMediaStore } from "./media-store";

export interface ProcessingRuntime {
  jobs: D1ProcessingJobRepository;
  media: R2ProcessingMediaStore;
  queue: Queue<ProcessingJobMessage>;
}

export async function getProcessingRuntime(): Promise<ProcessingRuntime | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const runtime = env as CloudflareEnv & { CURIO_PROCESSING_QUEUE?: Queue<ProcessingJobMessage> };
    if (!runtime.CURIO_DB || !runtime.CURIO_SOURCE_MEDIA || !runtime.CURIO_PROCESSING_QUEUE) return null;
    return {
      jobs: new D1ProcessingJobRepository(runtime.CURIO_DB),
      media: new R2ProcessingMediaStore(runtime.CURIO_SOURCE_MEDIA),
      queue: runtime.CURIO_PROCESSING_QUEUE,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Cloudflare processing bindings are unavailable.", { cause: error });
    }
    return null;
  }
}
