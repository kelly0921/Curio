import {
  knowledgeResourceSchema,
  learningItemSchema,
  type KnowledgeResource,
  type LearningItem,
} from "../domain";
import type { CurioRepository } from "./repository";

export class MemoryLearningItemRepository implements CurioRepository {
  private readonly items = new Map<string, LearningItem>();
  private readonly resources = new Map<string, KnowledgeResource>();

  async list(): Promise<LearningItem[]> {
    return [...this.items.values()]
      .map((item) => learningItemSchema.parse(item))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async findById(id: string): Promise<LearningItem | null> {
    const item = this.items.get(id);
    return item ? learningItemSchema.parse(item) : null;
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

  async listResources(profileId: string): Promise<KnowledgeResource[]> {
    return [...this.resources.values()]
      .filter((resource) => resource.profileId === profileId)
      .map((resource) => knowledgeResourceSchema.parse(resource))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async findResourceById(id: string): Promise<KnowledgeResource | null> {
    const resource = this.resources.get(id);
    return resource ? knowledgeResourceSchema.parse(resource) : null;
  }

  async saveResource(resource: KnowledgeResource): Promise<KnowledgeResource> {
    const validated = knowledgeResourceSchema.parse(resource);
    this.resources.set(validated.id, validated);
    return validated;
  }
}
