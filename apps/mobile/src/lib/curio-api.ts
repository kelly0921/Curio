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
    overview: string;
    findings: {
      topic: string;
      verdict: 'confirmed' | 'supported_with_context' | 'corrected' | 'not_verified' | 'opinion';
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
  accessLevel: AccessLevel;
  processingStatus: ProcessingStatus;
  intent: Intent;
  card: LearningCard | null;
  issues: { code: string; message: string; recoverable: boolean }[];
  createdAt: string;
  updatedAt: string;
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
  data: { item: LearningItem; duplicate: boolean };
}

interface ContextEnvelope {
  ok: true;
  data: { context: ContextSnapshot };
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

let itemSnapshot: LearningItem[] = [];

function remember(item: LearningItem): LearningItem {
  itemSnapshot = [item, ...itemSnapshot.filter((entry) => entry.id !== item.id)];
  return item;
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
  try {
    return await fetch(`${getCurioApiUrl()}${path}`, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new CurioApiError('REQUEST_TIMEOUT', 'Curio is still waiting on the processor. Try again in a moment.');
    }
    throw new CurioApiError(
      'PROCESSOR_UNREACHABLE',
      `Curio could not reach ${getCurioApiUrl()}. Make sure the web processor is running and both devices are on the same network.`,
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

export async function getPersonalContext(): Promise<ContextSnapshot> {
  const body = await readEnvelope<ContextEnvelope>(await apiFetch('/api/context', { headers: { Accept: 'application/json' } }));
  return body.data.context;
}

export async function syncPersonalContext(): Promise<ContextSnapshot> {
  const body = await readEnvelope<ContextEnvelope>(await apiFetch('/api/context', { method: 'POST' }));
  return body.data.context;
}

async function submitForm(form: FormData): Promise<{ item: LearningItem; duplicate: boolean }> {
  const body = await readEnvelope<ItemEnvelope>(await apiFetch('/api/items', { method: 'POST', body: form }));
  return { item: remember(body.data.item), duplicate: body.data.duplicate };
}

export async function saveLink(
  sourceUrl: string,
  options: { context?: string | null; intent?: Intent } = {},
): Promise<{ item: LearningItem; duplicate: boolean }> {
  const form = new FormData();
  form.append('sourceType', 'external_url');
  form.append('sourceUrl', sourceUrl.trim());
  form.append('intent', options.intent ?? 'remember');
  if (options.context?.trim()) form.append('sourceCaption', options.context.trim());
  return submitForm(form);
}

export async function saveSharedMedia(media: {
  uri: string;
  name?: string | null;
  mimeType?: string | null;
}): Promise<{ item: LearningItem; duplicate: boolean }> {
  const name = media.name || media.uri.split('/').pop() || 'shared-video.mp4';
  const file = { uri: media.uri, name, type: media.mimeType || 'video/mp4' };
  const form = new FormData();
  form.append('sourceType', 'uploaded_media');
  form.append('intent', 'remember');
  form.append('media', file as unknown as Blob);
  return submitForm(form);
}

export async function saveDemo(): Promise<{ item: LearningItem; duplicate: boolean }> {
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
