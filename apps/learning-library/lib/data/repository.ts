import type { KnowledgeResource, LearningItem } from "../domain";

export interface LearningItemRepository {
  list(): Promise<LearningItem[]>;
  findById(id: string): Promise<LearningItem | null>;
  findByFingerprint(fingerprint: string): Promise<LearningItem | null>;
  save(item: LearningItem): Promise<LearningItem>;
}

export interface KnowledgeResourceRepository {
  listResources(profileId: string): Promise<KnowledgeResource[]>;
  findResourceById(id: string): Promise<KnowledgeResource | null>;
  saveResource(resource: KnowledgeResource): Promise<KnowledgeResource>;
}

export type CurioRepository = LearningItemRepository & KnowledgeResourceRepository;
