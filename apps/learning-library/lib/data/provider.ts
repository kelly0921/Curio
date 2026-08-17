import { getCloudflareContext } from "@opennextjs/cloudflare";
import { D1LearningItemRepository } from "./d1-repository";
import { MemoryLearningItemRepository } from "./memory-repository";
import type { LearningItemRepository } from "./repository";
import { SupabaseLearningItemRepository } from "./supabase-repository";

const runtime = globalThis as typeof globalThis & {
  learningLibraryMemoryRepository?: MemoryLearningItemRepository;
};

const memoryRepository = runtime.learningLibraryMemoryRepository ?? new MemoryLearningItemRepository();
runtime.learningLibraryMemoryRepository = memoryRepository;

export interface PersistenceConfiguration {
  mode: "memory" | "d1" | "supabase" | "invalid";
  durable: boolean;
  message: string;
}

function environment() {
  const url = process.env.SUPABASE_URL?.trim() ?? "";
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim()
    || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
    || "";
  return { url, secretKey };
}

async function cloudflareDatabase(): Promise<D1Database | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return env.CURIO_DB ?? null;
  } catch (error) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("Cloudflare D1 binding CURIO_DB is unavailable.", { cause: error });
    }
    return null;
  }
}

async function configuredRepository(): Promise<{
  configuration: PersistenceConfiguration;
  repository: LearningItemRepository;
}> {
  const { url, secretKey } = environment();
  if (url || secretKey) {
    if (!url || !secretKey) {
      return {
        configuration: { mode: "invalid", durable: false, message: "Set both SUPABASE_URL and SUPABASE_SECRET_KEY." },
        repository: memoryRepository,
      };
    }
    return {
      configuration: { mode: "supabase", durable: true, message: "Supabase durable persistence is configured." },
      repository: new SupabaseLearningItemRepository(url, secretKey),
    };
  }

  const database = await cloudflareDatabase();
  if (database) {
    return {
      configuration: { mode: "d1", durable: true, message: "Cloudflare D1 durable persistence is configured." },
      repository: new D1LearningItemRepository(database),
    };
  }

  return {
    configuration: { mode: "memory", durable: false, message: "Using active-process memory; configure D1 or Supabase for durable cards." },
    repository: memoryRepository,
  };
}

export async function persistenceConfiguration(): Promise<PersistenceConfiguration> {
  return (await configuredRepository()).configuration;
}

export async function getLearningItemRepository(): Promise<LearningItemRepository> {
  const configured = await configuredRepository();
  if (configured.configuration.mode === "invalid") {
    throw new Error(`INVALID_PERSISTENCE_CONFIGURATION: ${configured.configuration.message}`);
  }
  return configured.repository;
}
