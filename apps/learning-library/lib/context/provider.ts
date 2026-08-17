import {
  contextSnapshotSchema,
  personalProfile,
  type ContextSnapshot,
} from "../domain";
import type { ContextConnector } from "./connector";
import { MockContextConnector } from "./mock-connector";

class MemoryContextStore {
  private snapshot: ContextSnapshot | null = null;

  get(): ContextSnapshot | null {
    return this.snapshot ? contextSnapshotSchema.parse(this.snapshot) : null;
  }

  replace(snapshot: ContextSnapshot): ContextSnapshot {
    this.snapshot = contextSnapshotSchema.parse(snapshot);
    return this.snapshot;
  }
}

const runtime = globalThis as typeof globalThis & {
  curioContextStore?: MemoryContextStore;
};

const store = runtime.curioContextStore ?? new MemoryContextStore();
runtime.curioContextStore = store;

async function syncWith(connector: ContextConnector, now = new Date().toISOString()): Promise<ContextSnapshot> {
  const result = await connector.sync({ profileId: personalProfile.id, now });
  return store.replace({
    profileId: personalProfile.id,
    connections: [result.connection],
    records: result.records,
    syncedAt: now,
  });
}

export async function getPersonalContextSnapshot(): Promise<ContextSnapshot> {
  return store.get() ?? syncWith(new MockContextConnector());
}

export async function refreshPersonalContext(): Promise<ContextSnapshot> {
  return syncWith(new MockContextConnector());
}
