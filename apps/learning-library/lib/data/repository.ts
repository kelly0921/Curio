import type {
  ForYouFeedback,
  KnowledgeResource,
  LearningItem,
  ResourceEngagement,
} from "../domain";

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

export interface EngagementRepository {
  listResourceEngagement(profileId: string): Promise<ResourceEngagement[]>;
  findResourceEngagement(profileId: string, resourceId: string): Promise<ResourceEngagement | null>;
  saveResourceEngagement(engagement: ResourceEngagement): Promise<ResourceEngagement>;
  listForYouFeedback(profileId: string): Promise<ForYouFeedback[]>;
  saveForYouFeedback(feedback: ForYouFeedback): Promise<ForYouFeedback>;
}

export type CurioRepository = LearningItemRepository & KnowledgeResourceRepository & EngagementRepository;
