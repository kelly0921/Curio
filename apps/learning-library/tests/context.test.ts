import { describe, expect, it } from "vitest";
import { MockContextConnector } from "@/lib/context/mock-connector";
import { detectContextDomain, personalizeLearningItem } from "@/lib/context/personalization";
import { contextSnapshotSchema, learningItemSchema, personalProfile } from "@/lib/domain";

const NOW = "2026-08-17T12:00:00.000Z";

async function mockSnapshot() {
  const result = await new MockContextConnector().sync({ profileId: personalProfile.id, now: NOW });
  return contextSnapshotSchema.parse({
    profileId: personalProfile.id,
    connections: [result.connection],
    records: result.records,
    syncedAt: NOW,
  });
}

function hsaItem() {
  return learningItemSchema.parse({
    id: "00000000-0000-4000-8000-000000000061",
    profileId: personalProfile.id,
    sourceType: "external_url",
    sourceUrl: "https://example.com/hsa",
    platform: "web",
    creator: null,
    sourceCaption: "HSAs can provide tax advantages.",
    transcript: null,
    extractedVisualText: null,
    uploadedMediaReference: null,
    sourceFingerprint: "context-test-hsa",
    accessLevel: "partial",
    processingStatus: "partial",
    intent: "verify",
    sourceMaterials: [{
      kind: "caption",
      label: "Test caption",
      text: "HSAs can provide tax advantages.",
      origin: "user_supplied",
      completeness: "unknown",
    }],
    card: {
      title: "Understand how HSAs work",
      primaryTopic: "financial literacy",
      secondaryTopics: ["tax", "retirement"],
      contentType: "factual_information",
      summary: "HSAs combine medical spending with tax advantages and eligibility rules.",
      keyTakeaways: ["Eligibility depends on qualifying health coverage."],
      relevanceReason: "Useful when comparing tax-advantaged accounts.",
      suggestedAction: "Confirm whether your health plan is HSA-eligible.",
      claimsToVerify: [],
      notes: [{ type: "claim", title: "HSA eligibility", detail: "Eligibility and contribution rules matter." }],
      researchBrief: null,
      personalization: null,
    },
    analysisMode: "live_openai",
    analysisModel: "test",
    analysisPromptVersion: "test",
    transcriptionModel: null,
    issues: [],
    createdAt: NOW,
    updatedAt: NOW,
  });
}

describe("connected-context personalization", () => {
  it("syncs a broad, explicitly labeled mock workspace", async () => {
    const snapshot = await mockSnapshot();
    expect(snapshot.connections[0]).toEqual(expect.objectContaining({ provider: "mock", isDemo: true, status: "connected" }));
    expect(new Set(snapshot.records.map((record) => record.domain))).toEqual(
      new Set(["finance", "travel", "food", "ai_work", "career"]),
    );
  });

  it("routes an HSA learning to finance and excludes unrelated connected context", async () => {
    const snapshot = await mockSnapshot();
    const item = hsaItem();
    const personalized = personalizeLearningItem(item, snapshot);

    expect(detectContextDomain(item)).toBe("finance");
    expect(personalized.card?.personalization).toEqual(expect.objectContaining({
      domain: "finance",
      priority: "high",
      engineVersion: "context-router-v1",
    }));
    expect(personalized.card?.personalization?.contextUsed.length).toBeGreaterThan(0);
    expect(personalized.card?.personalization?.contextUsed.every((entry) => entry.domain === "finance")).toBe(true);
    expect(personalized.card?.personalization?.contextUsed.some((entry) => entry.statement.includes("tax-advantaged"))).toBe(true);
    expect(personalized.card?.personalization?.whyNow).not.toContain("international trip");
    expect(personalized.card?.personalization?.whyNow).not.toContain("weeknight meal");
  });
});
