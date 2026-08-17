import type { LearningItem } from "../domain";

export interface LearningItemRepository {
  list(): Promise<LearningItem[]>;
  findByFingerprint(fingerprint: string): Promise<LearningItem | null>;
  save(item: LearningItem): Promise<LearningItem>;
}
