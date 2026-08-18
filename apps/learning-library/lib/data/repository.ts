import type { LearningItem } from "../domain";

export interface LearningItemRepository {
  list(): Promise<LearningItem[]>;
  findById(id: string): Promise<LearningItem | null>;
  findByFingerprint(fingerprint: string): Promise<LearningItem | null>;
  save(item: LearningItem): Promise<LearningItem>;
}
