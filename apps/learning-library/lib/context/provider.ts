import {
  contextSnapshotSchema,
  personalProfile,
  type ContextSnapshot,
} from "../domain";
import type { ContextConnector } from "./connector";
import { MockContextConnector } from "./mock-connector";

function emptySnapshot(profileId: string, now: string): ContextSnapshot {
  return contextSnapshotSchema.parse({
    profileId,
    connections: [],
    records: [],
    syncedAt: now,
  });
}

async function syncWith(
  profileId: string,
  connector: ContextConnector,
  now = new Date().toISOString(),
): Promise<ContextSnapshot> {
  const result = await connector.sync({ profileId, now });
  return contextSnapshotSchema.parse({
    profileId,
    connections: [result.connection],
    records: result.records,
    syncedAt: now,
  });
}

export async function getPersonalContextSnapshot(profileId: string): Promise<ContextSnapshot> {
  if (profileId !== personalProfile.id) return emptySnapshot(profileId, new Date().toISOString());
  return syncWith(profileId, new MockContextConnector());
}

export async function refreshPersonalContext(profileId: string): Promise<ContextSnapshot> {
  if (profileId !== personalProfile.id) return emptySnapshot(profileId, new Date().toISOString());
  return syncWith(profileId, new MockContextConnector());
}
