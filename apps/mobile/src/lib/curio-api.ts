import Constants from 'expo-constants';
import { Platform } from 'react-native';

export type ProcessingStatus =
  | 'received'
  | 'retrieving_source'
  | 'transcribing'
  | 'analyzing'
  | 'researching'
  | 'ready'
  | 'partial'
  | 'unsupported'
  | 'failed';

export type AccessLevel = 'full' | 'partial' | 'link_only' | 'unsupported' | 'failed';
export type Intent = 'remember' | 'try' | 'verify' | 'reference' | 'use_for_content';
export type ContextDomain = 'finance' | 'travel' | 'food' | 'ai_work' | 'career' | 'health' | 'home' | 'relationships' | 'general';
export type ContextRecordKind = 'goal' | 'fact' | 'preference' | 'constraint' | 'plan' | 'habit' | 'resource';
export type LearningPresentationType = 'named_list' | 'ranked_list' | 'how_to' | 'explainer' | 'recommendation' | 'comparison' | 'news_update' | 'story';
export type KnowledgeResourceType = 'guide' | 'glossary' | 'playbook' | 'watchlist';
export type SaveIntent = 'understand' | 'try' | 'visit' | 'buy' | 'track' | 'compare' | 'reference';
export type ResourceEntryStatus = 'active' | 'contested' | 'superseded';
export type ResourceDeepDiveKind = 'how_it_works' | 'practical_example' | 'limits_and_risks' | 'what_to_watch';
export type ResourceEngagementSignal = 'opened' | 'expanded' | 'source_opened' | 'deep_dive';
export type FollowThroughKind = 'checklist' | 'trip_plan' | 'watchlist' | 'shortlist' | 'review';
export type ForYouLane = 'learn_next' | 'use_now' | 'worth_revisiting';
export type ResourceContributionDisposition = 'created' | 'enriched' | 'supporting' | 'updated' | 'conflict';
export type ResearchVerdict = 'confirmed' | 'supported_with_context' | 'corrected' | 'not_verified' | 'opinion';

export interface ContextConnection {
  id: string;
  profileId: string;
  provider: 'mock' | 'notion';
  displayName: string;
  status: 'connected' | 'syncing' | 'attention_required' | 'disconnected';
  scopes: string[];
  isDemo: boolean;
  lastSyncedAt: string | null;
  createdAt: string;
}

export interface ContextRecord {
  id: string;
  profileId: string;
  connectionId: string;
  domain: ContextDomain;
  kind: ContextRecordKind;
  statement: string;
  keywords: string[];
  sourceLabel: string;
  sourceReference: string | null;
  sensitivity: 'standard' | 'private' | 'sensitive';
  confidence: 'explicit' | 'imported' | 'inferred';
  observedAt: string;
  expiresAt: string | null;
}

export interface ContextSnapshot {
  profileId: string;
  connections: ContextConnection[];
  records: ContextRecord[];
  syncedAt: string;
}

export interface LearningPersonalization {
  domain: ContextDomain;
  priority: 'high' | 'medium' | 'low';
  priorityScore: number;
  recommendationTier: 'do_now' | 'useful_for_goals' | 'worth_remembering';
  evidenceStatus: 'validated' | 'mixed' | 'unresearched' | 'opinion';
  whyNow: string;
  personalizedUse: string;
  nextStep: string;
  contextUsed: {
    recordId: string;
    domain: ContextDomain;
    kind: ContextRecordKind;
    statement: string;
    sourceLabel: string;
    isDemo: boolean;
  }[];
  generatedAt: string;
  engineVersion: string;
}

export interface ClaimToVerify {
  claim: string;
  category: 'personal_opinion' | 'anecdotal_experience' | 'factual_claim' | 'high_stakes_factual_claim';
  reasonToVerify: string;
}

export interface LearningCard {
  title: string;
  primaryTopic: string;
  secondaryTopics: string[];
  domain?: ContextDomain;
  presentationType?: LearningPresentationType;
  contentType: string;
  summary: string;
  keyTakeaways: string[];
  relevanceReason: string;
  suggestedAction: string;
  claimsToVerify: ClaimToVerify[];
  notes?: {
    type: 'principle' | 'tactic' | 'claim' | 'example' | 'resource';
    title: string;
    detail: string;
  }[];
  researchBrief?: {
    mode?: 'source_validation' | 'independent_supplement';
    overview: string;
    findings: {
      topic: string;
      verdict: ResearchVerdict;
      explanation: string;
      correction: string | null;
      sources: { title: string; publisher: string; url: string }[];
    }[];
    researchedAt: string;
    model: string;
    promptVersion?: string | null;
  } | null;
  personalization?: LearningPersonalization | null;
}

export interface LearningItem {
  id: string;
  sourceType: 'uploaded_media' | 'instagram_url' | 'external_url' | 'demo_fixture';
  sourceUrl: string | null;
  platform: 'instagram' | 'youtube' | 'tiktok' | 'vimeo' | 'web' | 'local' | 'demo';
  creator: string | null;
  sourceCaption: string | null;
  transcript: string | null;
  extractedVisualText: string | null;
  sourceVisual?: {
    kind: 'reel_frame';
    objectKey: string;
    mimeType: 'image/jpeg';
    timestampSeconds: number;
    normalizationVersion?: string | null;
    capturedAt: string;
  } | null;
  accessLevel: AccessLevel;
  processingStatus: ProcessingStatus;
  intent: Intent;
  card: LearningCard | null;
  issues: { code: string; message: string; recoverable: boolean }[];
  resourceIds?: string[];
  inferredIntent?: SaveIntent | null;
  recommendationFeedback: {
    state: 'done' | 'later' | 'not_relevant';
    updatedAt: string;
    revisitAt: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeResourceEntry {
  id: string;
  kind: 'insight' | 'step' | 'term' | 'recommendation';
  heading: string | null;
  detail: string;
  sourceItemIds: string[];
  research: {
    topic: string;
    verdict: 'confirmed' | 'supported_with_context' | 'corrected' | 'not_verified' | 'opinion';
    explanation: string;
    correction: string | null;
    sources: { title: string; publisher: string; url: string }[];
  } | null;
  researchedAt: string | null;
  status?: ResourceEntryStatus;
  relatedEntryIds?: string[];
  deepDives?: ResourceDeepDive[];
}

export interface ResourceDeepDive {
  id: string;
  kind: ResourceDeepDiveKind;
  question: string;
  answer: string;
  sources: { title: string; publisher: string; url: string }[];
  researchedAt: string;
  model: string;
  promptVersion: string;
}

export interface ResourceContribution {
  sourceItemId: string;
  disposition: ResourceContributionDisposition;
  addedEntryIds: string[];
  supportedEntryIds: string[];
  updatedEntryIds?: string[];
  conflictingEntryIds?: string[];
  summary: string;
  decisionMode?: 'ai' | 'deterministic';
  decisionConfidence?: number;
  decisionReason?: string | null;
  mergeModel?: string | null;
  mergePromptVersion?: string | null;
  createdAt: string;
}

export interface KnowledgeResource {
  id: string;
  profileId: string;
  resourceType: KnowledgeResourceType;
  domain: ContextDomain;
  intent?: SaveIntent;
  canonicalTopic: string;
  title: string;
  summary: string;
  entities: string[];
  entries: KnowledgeResourceEntry[];
  sourceItemIds: string[];
  coverSourceItemId?: string | null;
  coverCapturedAt?: string | null;
  contributions: ResourceContribution[];
  lastResearchedAt: string | null;
  mergeModel?: string | null;
  mergePromptVersion?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceFreshness {
  status: 'current' | 'due' | 'unresearched' | 'not_required';
  checkedAt: string | null;
  nextCheckAt: string | null;
  intervalDays: number | null;
  refreshRecommended: boolean;
  reason: string;
  policyVersion: string;
}

export interface ResourceResearchReceipt {
  checkedAt: string;
  checkedSourceCount: number;
  materialChangeCount: number;
  summary: string;
  changes: {
    entryId: string;
    heading: string | null;
    previousVerdict: ResearchVerdict | null;
    verdict: ResearchVerdict;
    note: string;
  }[];
}

export interface FollowThroughPlan {
  resourceId: string;
  resourceTitle: string;
  domain: ContextDomain;
  kind: FollowThroughKind;
  state: 'active' | 'completed';
  entries: {
    id: string;
    title: string;
    detail: string;
    completed: boolean;
  }[];
  completedCount: number;
  totalCount: number;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
  attention: 'now' | 'soon' | 'on_track';
  whyNow: string;
  nextReviewAt: string | null;
}

export type FollowThroughUpdate =
  | { action: 'start' }
  | { action: 'toggle_entry'; entryId: string; completed: boolean }
  | { action: 'complete' };

export interface CrossSaveTheme {
  id: string;
  domain: ContextDomain;
  title: string;
  description: string;
  resourceIds: string[];
  resourceTitles: string[];
  resourceCount: number;
  sourceCount: number;
  contextReason: string | null;
}

export interface CrossSaveInterest {
  id: string;
  domain: ContextDomain;
  title: string;
  description: string;
  resourceIds: string[];
  resourceTitles: string[];
  subjects: string[];
  resourceCount: number;
  sourceCount: number;
}

export interface ForYouRecommendation {
  id: string;
  lane: ForYouLane;
  label: string;
  resourceId: string;
  resourceTitle: string;
  entryId: string | null;
  title: string;
  point: string;
  whyNow: string;
  actionLabel: string;
}

export interface ForYouFeedback {
  profileId: string;
  recommendationId: string;
  resourceId: string;
  lane: ForYouLane;
  state: 'done' | 'later' | 'not_relevant';
  updatedAt: string;
  revisitAt: string | null;
}

export interface CrossSaveSynthesis {
  generatedAt: string;
  engineVersion: string;
  period: {
    mode: 'this_week' | 'library';
    label: string;
    startAt: string;
    endAt: string;
  };
  overview: {
    savedSourceCount: number;
    newResourceCount: number;
    changedResourceCount: number;
    librarySourceCount: number;
    headline: string;
    detail: string;
  };
  themes: CrossSaveTheme[];
  interests: CrossSaveInterest[];
  nextUse: {
    resourceId: string;
    title: string;
    intent: Exclude<SaveIntent, 'understand' | 'reference'>;
    label: string;
    heading: string | null;
    point: string;
    reason: string;
  } | null;
  remember: {
    resourceId: string;
    title: string;
    heading: string | null;
    point: string;
    reason: string;
  } | null;
  changed: {
    resourceId: string;
    title: string;
    kind: ResourceContributionDisposition;
    label: string;
    summary: string;
    occurredAt: string;
  } | null;
  repeated: {
    resourceId: string;
    title: string;
    heading: string | null;
    point: string;
    supportCount: number;
  } | null;
  unresolved: {
    resourceId: string;
    title: string;
    heading: string | null;
    claim: string;
    reason: string;
    kind: 'contested' | 'not_verified' | 'research_due' | 'unresearched';
  } | null;
  followThrough: FollowThroughPlan[];
  recommendations: ForYouRecommendation[];
  fallbackResourceIds: string[];
}

export interface KnowledgeSearchAnswer {
  resourceId: string;
  title: string;
  summary: string;
  points: {
    resourceId: string;
    resourceTitle: string;
    entryId: string;
    heading: string | null;
    detail: string;
    status: ResourceEntryStatus;
    evidence: string;
  }[];
  sourceCount: number;
  resourceCount: number;
  mode: 'library_matches' | 'library_synthesis';
  caveat: string | null;
  model: string | null;
  promptVersion: string;
}

export interface KnowledgeSearchResult {
  query: string;
  answer: KnowledgeSearchAnswer | null;
  followThroughResourceIds: string[];
  results: {
    resource: KnowledgeResource;
    score: number;
    matchedEntryIds: string[];
    matchedOn: string[];
  }[];
}

interface ErrorEnvelope {
  ok: false;
  error: { code: string; message: string };
}

interface ItemsEnvelope {
  ok: true;
  data: { items: LearningItem[] };
}

interface ItemEnvelope {
  ok: true;
  data: {
    item: LearningItem;
    duplicate: boolean;
    resource?: KnowledgeResource | null;
    resourceUpdate?: ResourceContribution | null;
  };
}

interface ContextEnvelope {
  ok: true;
  data: { context: ContextSnapshot };
}

interface SynthesisEnvelope {
  ok: true;
  data: { synthesis: CrossSaveSynthesis };
}

interface ResourcesEnvelope {
  ok: true;
  data: { resources: KnowledgeResource[] };
}

interface ResourceEnvelope {
  ok: true;
  data: { resource: KnowledgeResource; sources: LearningItem[]; freshness: ResourceFreshness; followThrough: FollowThroughPlan | null };
}

interface ResourceRefreshEnvelope {
  ok: true;
  data: { resource: KnowledgeResource; freshness: ResourceFreshness; receipt: ResourceResearchReceipt };
}

interface ResourceDeepDiveEnvelope {
  ok: true;
  data: { resource: KnowledgeResource; deepDive: ResourceDeepDive; generated: boolean };
}

interface ResourceEngagementEnvelope {
  ok: true;
  data: { engagement: { resourceId: string; updatedAt: string } };
}

interface FollowThroughEnvelope {
  ok: true;
  data: { plan: FollowThroughPlan };
}

interface ForYouFeedbackEnvelope {
  ok: true;
  data: { feedback: ForYouFeedback };
}

interface SearchEnvelope {
  ok: true;
  data: KnowledgeSearchResult;
}

interface FeedbackEnvelope {
  ok: true;
  data: { item: LearningItem };
}

export class CurioApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

function inferredDevelopmentUrl(): string {
  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      const hostname = window.location.hostname;
      const protocol = window.location.protocol === 'https:' ? 'https:' : 'http:';
      return `${protocol}//${hostname}:3031`;
    }
    return 'http://localhost:3031';
  }

  const metroHost = Constants.expoConfig?.hostUri;
  if (metroHost) {
    try {
      const hostname = new URL(`http://${metroHost}`).hostname;
      return `http://${hostname}:3031`;
    } catch {
      // A user-provided EXPO_PUBLIC_CURIO_API_URL remains the reliable fallback.
    }
  }

  return Platform.OS === 'android' ? 'http://10.0.2.2:3031' : 'http://localhost:3031';
}

export function getCurioApiUrl(): string {
  return (process.env.EXPO_PUBLIC_CURIO_API_URL?.trim() || inferredDevelopmentUrl()).replace(/\/$/, '');
}

export function getSourceCoverImageSource(itemId: string, capturedAt?: string | null): { uri: string; headers?: Record<string, string> } {
  const personalAccessToken = process.env.EXPO_PUBLIC_CURIO_API_TOKEN?.trim();
  const version = capturedAt ? `?v=${encodeURIComponent(capturedAt)}` : '';
  return {
    uri: `${getCurioApiUrl()}/api/items/${encodeURIComponent(itemId)}/cover${version}`,
    ...(personalAccessToken ? { headers: { Authorization: `Bearer ${personalAccessToken}` } } : {}),
  };
}

let itemSnapshot: LearningItem[] = [];
let resourceSnapshot: KnowledgeResource[] = [];

function remember(item: LearningItem): LearningItem {
  itemSnapshot = [item, ...itemSnapshot.filter((entry) => entry.id !== item.id)];
  return item;
}

function normalizeFollowThroughPlan(plan: FollowThroughPlan): FollowThroughPlan {
  return {
    ...plan,
    attention: plan.attention ?? 'on_track',
    whyNow: plan.whyNow?.trim() || 'Curio will bring this plan back when it needs attention.',
    nextReviewAt: plan.nextReviewAt ?? null,
  };
}

async function readEnvelope<T>(response: Response): Promise<T> {
  let body: T | ErrorEnvelope;
  try {
    body = (await response.json()) as T | ErrorEnvelope;
  } catch {
    throw new CurioApiError('INVALID_RESPONSE', 'Curio received an unreadable response from its processor.', response.status);
  }

  if (!response.ok || ('ok' in (body as ErrorEnvelope) && (body as ErrorEnvelope).ok === false)) {
    const error = (body as ErrorEnvelope).error;
    throw new CurioApiError(error?.code ?? 'REQUEST_FAILED', error?.message ?? 'Curio could not finish this request.', response.status);
  }
  return body as T;
}

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 150_000);
  const headers = new Headers(init?.headers);
  const personalAccessToken = process.env.EXPO_PUBLIC_CURIO_API_TOKEN?.trim();
  if (personalAccessToken) headers.set('Authorization', `Bearer ${personalAccessToken}`);
  try {
    return await fetch(`${getCurioApiUrl()}${path}`, { ...init, headers, signal: controller.signal, cache: 'no-store' });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CurioApiError('REQUEST_TIMEOUT', 'Curio is still waiting on the processor. Try again in a moment.');
    }
    const apiUrl = getCurioApiUrl();
    const connectionHint = apiUrl.startsWith('http://')
      ? 'Make sure the processor is running and both devices are on the same network.'
      : 'Check your internet connection and the deployed processor status.';
    throw new CurioApiError(
      'PROCESSOR_UNREACHABLE',
      `Curio could not reach ${apiUrl}. ${connectionHint}`,
    );
  } finally {
    clearTimeout(timeout);
  }
}

export async function listLearningItems(): Promise<LearningItem[]> {
  const body = await readEnvelope<ItemsEnvelope>(await apiFetch('/api/items', { headers: { Accept: 'application/json' } }));
  itemSnapshot = body.data.items;
  return body.data.items;
}

export async function listKnowledgeResources(): Promise<KnowledgeResource[]> {
  const body = await readEnvelope<ResourcesEnvelope>(await apiFetch('/api/resources', { headers: { Accept: 'application/json' } }));
  resourceSnapshot = body.data.resources;
  return body.data.resources;
}

export async function getKnowledgeResource(id: string): Promise<{ resource: KnowledgeResource; sources: LearningItem[]; freshness: ResourceFreshness; followThrough: FollowThroughPlan | null } | null> {
  const cached = resourceSnapshot.find((resource) => resource.id === id);
  const body = await readEnvelope<ResourceEnvelope>(await apiFetch(`/api/resources/${encodeURIComponent(id)}`, { headers: { Accept: 'application/json' } }));
  resourceSnapshot = [body.data.resource, ...resourceSnapshot.filter((resource) => resource.id !== id)];
  return {
    resource: cached ? { ...cached, ...body.data.resource } : body.data.resource,
    sources: body.data.sources,
    freshness: body.data.freshness,
    followThrough: body.data.followThrough ? normalizeFollowThroughPlan(body.data.followThrough) : null,
  };
}

export async function refreshKnowledgeResource(id: string): Promise<{ resource: KnowledgeResource; freshness: ResourceFreshness; receipt: ResourceResearchReceipt }> {
  const body = await readEnvelope<ResourceRefreshEnvelope>(await apiFetch(`/api/resources/${encodeURIComponent(id)}/refresh`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  }));
  resourceSnapshot = [body.data.resource, ...resourceSnapshot.filter((resource) => resource.id !== id)];
  return body.data;
}

export async function deepenKnowledgeResourceEntry(
  resourceId: string,
  entryId: string,
  kind: ResourceDeepDiveKind,
): Promise<{ resource: KnowledgeResource; deepDive: ResourceDeepDive; generated: boolean }> {
  const body = await readEnvelope<ResourceDeepDiveEnvelope>(await apiFetch(
    `/api/resources/${encodeURIComponent(resourceId)}/entries/${encodeURIComponent(entryId)}/deep-dive`,
    {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind }),
    },
  ));
  resourceSnapshot = [body.data.resource, ...resourceSnapshot.filter((resource) => resource.id !== resourceId)];
  return body.data;
}

export async function searchKnowledgeLibrary(query: string, domain?: ContextDomain | null): Promise<KnowledgeSearchResult> {
  const params = new URLSearchParams({ q: query.trim() });
  if (domain) params.set('domain', domain);
  const body = await readEnvelope<SearchEnvelope>(await apiFetch(`/api/search?${params.toString()}`, { headers: { Accept: 'application/json' } }));
  body.data.results.forEach(({ resource }) => {
    resourceSnapshot = [resource, ...resourceSnapshot.filter((entry) => entry.id !== resource.id)];
  });
  return body.data;
}

export async function getPersonalContext(): Promise<ContextSnapshot> {
  const body = await readEnvelope<ContextEnvelope>(await apiFetch('/api/context', { headers: { Accept: 'application/json' } }));
  return body.data.context;
}

export async function getCrossSaveSynthesis(): Promise<CrossSaveSynthesis> {
  const body = await readEnvelope<SynthesisEnvelope>(await apiFetch('/api/synthesis', { headers: { Accept: 'application/json' } }));
  return {
    ...body.data.synthesis,
    interests: body.data.synthesis.interests ?? [],
    nextUse: body.data.synthesis.nextUse ?? null,
    followThrough: (body.data.synthesis.followThrough ?? []).map(normalizeFollowThroughPlan),
    recommendations: body.data.synthesis.recommendations ?? [],
  };
}

export async function updateResourceFollowThrough(
  resourceId: string,
  update: FollowThroughUpdate,
): Promise<FollowThroughPlan> {
  const body = await readEnvelope<FollowThroughEnvelope>(await apiFetch(`/api/resources/${encodeURIComponent(resourceId)}/follow-through`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  }));
  return normalizeFollowThroughPlan(body.data.plan);
}

export async function recordResourceEngagement(
  resourceId: string,
  signal: ResourceEngagementSignal,
): Promise<void> {
  await readEnvelope<ResourceEngagementEnvelope>(await apiFetch(`/api/resources/${encodeURIComponent(resourceId)}/engagement`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ signal }),
  }));
}

export async function updateForYouFeedback(
  recommendation: ForYouRecommendation,
  action: ForYouFeedback['state'],
): Promise<ForYouFeedback> {
  const body = await readEnvelope<ForYouFeedbackEnvelope>(await apiFetch('/api/synthesis/feedback', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      recommendationId: recommendation.id,
      resourceId: recommendation.resourceId,
      lane: recommendation.lane,
      action,
    }),
  }));
  return body.data.feedback;
}

export async function syncPersonalContext(): Promise<ContextSnapshot> {
  const body = await readEnvelope<ContextEnvelope>(await apiFetch('/api/context', { method: 'POST' }));
  return body.data.context;
}

export async function updateRecommendationFeedback(
  id: string,
  action: 'done' | 'later' | 'not_relevant',
): Promise<LearningItem> {
  const body = await readEnvelope<FeedbackEnvelope>(await apiFetch(`/api/items/${encodeURIComponent(id)}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action }),
  }));
  return remember(body.data.item);
}

export interface CaptureResult {
  item: LearningItem;
  duplicate: boolean;
  resource: KnowledgeResource | null;
  resourceUpdate: ResourceContribution | null;
}

async function submitForm(form: FormData): Promise<CaptureResult> {
  const body = await readEnvelope<ItemEnvelope>(await apiFetch('/api/items', { method: 'POST', body: form }));
  if (body.data.resource) {
    resourceSnapshot = [body.data.resource, ...resourceSnapshot.filter((resource) => resource.id !== body.data.resource?.id)];
  }
  return {
    item: remember(body.data.item),
    duplicate: body.data.duplicate,
    resource: body.data.resource ?? null,
    resourceUpdate: body.data.resourceUpdate ?? null,
  };
}

export async function saveLink(
  sourceUrl: string,
  options: { context?: string | null; intent?: Intent; publicMediaUrls?: string[] } = {},
): Promise<CaptureResult> {
  const form = new FormData();
  form.append('sourceType', 'external_url');
  form.append('sourceUrl', sourceUrl.trim());
  form.append('intent', options.intent ?? 'remember');
  if (options.context?.trim()) form.append('sourceCaption', options.context.trim());
  if (options.publicMediaUrls?.length) {
    form.append('publicMediaUrls', JSON.stringify([...new Set(options.publicMediaUrls)].slice(0, 30)));
  }
  return submitForm(form);
}

export async function saveSharedMedia(media: {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
}): Promise<CaptureResult> {
  const name = media.name || media.uri.split('/').pop() || 'shared-video.mp4';
  const file = { uri: media.uri, name, type: media.mimeType || 'video/mp4' };
  const form = new FormData();
  form.append('sourceType', 'uploaded_media');
  form.append('intent', 'remember');
  form.append('media', file as unknown as Blob);
  return submitForm(form);
}

export async function saveDemo(): Promise<CaptureResult> {
  const form = new FormData();
  form.append('sourceType', 'demo_fixture');
  form.append('intent', 'remember');
  return submitForm(form);
}

export async function getLearningItem(id: string): Promise<LearningItem | null> {
  const cached = itemSnapshot.find((item) => item.id === id);
  if (cached) return cached;
  return (await listLearningItems()).find((item) => item.id === id) ?? null;
}
