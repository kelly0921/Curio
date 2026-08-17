import {
  contextConnectionSchema,
  contextRecordSchema,
  type ContextRecord,
} from "../domain";
import type { ContextConnector, ContextSyncResult } from "./connector";

const CONNECTION_ID = "00000000-0000-4000-8000-000000000041";

interface MockRecordInput {
  id: string;
  domain: ContextRecord["domain"];
  kind: ContextRecord["kind"];
  statement: string;
  keywords: string[];
  sourceReference: string;
  sensitivity?: ContextRecord["sensitivity"];
}

const MOCK_RECORDS: MockRecordInput[] = [
  {
    id: "00000000-0000-4000-8000-000000000051",
    domain: "finance",
    kind: "goal",
    statement: "Build strong financial foundations before taking on higher-risk investing strategies.",
    keywords: ["investing", "financial literacy", "risk", "savings"],
    sourceReference: "Finance dashboard / Current priorities",
    sensitivity: "sensitive",
  },
  {
    id: "00000000-0000-4000-8000-000000000052",
    domain: "finance",
    kind: "fact",
    statement: "Currently learning how tax-advantaged accounts such as HSAs and retirement accounts work.",
    keywords: ["hsa", "tax", "retirement", "account"],
    sourceReference: "Learning plan / Money topics",
    sensitivity: "sensitive",
  },
  {
    id: "00000000-0000-4000-8000-000000000053",
    domain: "finance",
    kind: "constraint",
    statement: "Verify eligibility, fees, liquidity needs, and tax rules before changing a financial strategy.",
    keywords: ["eligibility", "tax", "fees", "cash flow", "verify"],
    sourceReference: "Finance dashboard / Decision rules",
    sensitivity: "sensitive",
  },
  {
    id: "00000000-0000-4000-8000-000000000054",
    domain: "travel",
    kind: "plan",
    statement: "Plan one meaningful international trip during the next twelve months.",
    keywords: ["travel", "trip", "international", "itinerary"],
    sourceReference: "Travel ideas / Upcoming",
  },
  {
    id: "00000000-0000-4000-8000-000000000055",
    domain: "travel",
    kind: "preference",
    statement: "Prefer walkable neighborhoods, local food, and flexible itineraries over packed sightseeing schedules.",
    keywords: ["walkable", "food", "itinerary", "neighborhood"],
    sourceReference: "Travel ideas / Preferences",
  },
  {
    id: "00000000-0000-4000-8000-000000000056",
    domain: "food",
    kind: "preference",
    statement: "Save both quick weeknight meal ideas and restaurants worth visiting later.",
    keywords: ["recipe", "restaurant", "meal", "food"],
    sourceReference: "Food list / Saved ideas",
  },
  {
    id: "00000000-0000-4000-8000-000000000057",
    domain: "ai_work",
    kind: "goal",
    statement: "Build Curio into a mobile-first AI product that turns saved content into useful knowledge.",
    keywords: ["ai", "curio", "mobile", "knowledge", "automation"],
    sourceReference: "Projects / Curio",
  },
  {
    id: "00000000-0000-4000-8000-000000000058",
    domain: "ai_work",
    kind: "constraint",
    statement: "Favor workflows that reduce repeated input and can run automatically after one connection.",
    keywords: ["workflow", "automation", "connector", "input", "agent"],
    sourceReference: "Projects / Product principles",
  },
  {
    id: "00000000-0000-4000-8000-000000000059",
    domain: "career",
    kind: "goal",
    statement: "Turn project outcomes into stronger evidence for career growth, mentoring, and public communication.",
    keywords: ["career", "mentoring", "communication", "project", "evidence"],
    sourceReference: "Career notes / Growth goals",
  },
];

export class MockContextConnector implements ContextConnector {
  readonly provider = "mock" as const;

  async sync({ profileId, now }: { profileId: string; now: string }): Promise<ContextSyncResult> {
    const connection = contextConnectionSchema.parse({
      id: CONNECTION_ID,
      profileId,
      provider: this.provider,
      displayName: "Demo connected workspace",
      status: "connected",
      scopes: ["finance", "travel", "food", "ai_work", "career"],
      isDemo: true,
      lastSyncedAt: now,
      createdAt: now,
    });
    const records = MOCK_RECORDS.map((record) => contextRecordSchema.parse({
      ...record,
      profileId,
      connectionId: CONNECTION_ID,
      sourceLabel: "Demo connected workspace",
      sensitivity: record.sensitivity ?? "private",
      confidence: "imported",
      observedAt: now,
      expiresAt: null,
    }));
    return { connection, records };
  }
}
