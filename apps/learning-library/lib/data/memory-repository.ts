import { learningItemSchema, type LearningItem } from "../domain";
import type { LearningItemRepository } from "./repository";

export class MemoryLearningItemRepository implements LearningItemRepository {
  private readonly items = new Map<string, LearningItem>();

  async list(): Promise<LearningItem[]> {
    return [...this.items.values()]
      .map((item) => learningItemSchema.parse(item))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findByFingerprint(fingerprint: string): Promise<LearningItem | null> {
    const item = [...this.items.values()].find((candidate) => candidate.sourceFingerprint === fingerprint);
    return item ? learningItemSchema.parse(item) : null;
  }

  async save(item: LearningItem): Promise<LearningItem> {
    const validated = learningItemSchema.parse(item);
    this.items.set(validated.id, validated);
    return validated;
  }
}
