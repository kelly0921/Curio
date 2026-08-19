import {
  forYouFeedbackSchema,
  knowledgeResourceSchema,
  learningItemSchema,
  resourceEngagementSchema,
  type ForYouFeedback,
  type KnowledgeResource,
  type LearningItem,
  type ResourceEngagement,
} from "../domain";
import type { CurioRepository } from "./repository";

export class MemoryLearningItemRepository implements CurioRepository {
  private readonly items = new Map<string, LearningItem>();
  private readonly resources = new Map<string, KnowledgeResource>();
  private readonly engagements = new Map<string, ResourceEngagement>();
  private readonly feedback = new Map<string, ForYouFeedback>();

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

  async listResourceEngagement(profileId: string): Promise<ResourceEngagement[]> {
    return [...this.engagements.values()]
      .filter((engagement) => engagement.profileId === profileId)
      .map((engagement) => resourceEngagementSchema.parse(engagement));
  }

  async findResourceEngagement(profileId: string, resourceId: string): Promise<ResourceEngagement | null> {
    const engagement = this.engagements.get(`${profileId}:${resourceId}`);
    return engagement ? resourceEngagementSchema.parse(engagement) : null;
  }

  async saveResourceEngagement(engagement: ResourceEngagement): Promise<ResourceEngagement> {
    const validated = resourceEngagementSchema.parse(engagement);
    this.engagements.set(`${validated.profileId}:${validated.resourceId}`, validated);
    return validated;
  }

  async listForYouFeedback(profileId: string): Promise<ForYouFeedback[]> {
    return [...this.feedback.values()]
      .filter((feedback) => feedback.profileId === profileId)
      .map((feedback) => forYouFeedbackSchema.parse(feedback));
  }

  async saveForYouFeedback(feedback: ForYouFeedback): Promise<ForYouFeedback> {
    const validated = forYouFeedbackSchema.parse(feedback);
    this.feedback.set(`${validated.profileId}:${validated.recommendationId}`, validated);
    return validated;
  }
}
