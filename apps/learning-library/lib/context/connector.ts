import type { ContextConnection, ContextRecord } from "../domain";

export interface ContextSyncResult {
  connection: ContextConnection;
  records: ContextRecord[];
}

export interface ContextConnector {
  readonly provider: ContextConnection["provider"];
  sync(input: { profileId: string; now: string }): Promise<ContextSyncResult>;
}
