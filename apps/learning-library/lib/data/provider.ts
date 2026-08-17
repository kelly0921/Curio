import { MemoryLearningItemRepository } from "./memory-repository";
import type { LearningItemRepository } from "./repository";
import { SupabaseLearningItemRepository } from "./supabase-repository";

const runtime = globalThis as typeof globalThis & {
  learningLibraryMemoryRepository?: MemoryLearningItemRepository;
};

const memoryRepository = runtime.learningLibraryMemoryRepository ?? new MemoryLearningItemRepository();
runtime.learningLibraryMemoryRepository = memoryRepository;

export interface PersistenceConfiguration {
  mode: "memory" | "supabase" | "invalid";
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

export function persistenceConfiguration(): PersistenceConfiguration {
  const { url, secretKey } = environment();
  if (!url && !secretKey) {
    return { mode: "memory", durable: false, message: "Using active-process memory; configure Supabase for durable cards." };
  }
  if (!url || !secretKey) {
    return { mode: "invalid", durable: false, message: "Set both SUPABASE_URL and SUPABASE_SECRET_KEY." };
  }
  return { mode: "supabase", durable: true, message: "Supabase durable persistence is configured." };
}

export function getLearningItemRepository(): LearningItemRepository {
  const config = persistenceConfiguration();
  if (config.mode === "memory") return memoryRepository;
  if (config.mode === "invalid") throw new Error(`INVALID_PERSISTENCE_CONFIGURATION: ${config.message}`);
  const { url, secretKey } = environment();
  return new SupabaseLearningItemRepository(url, secretKey);
}
