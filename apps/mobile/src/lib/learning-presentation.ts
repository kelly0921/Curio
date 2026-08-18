export type LearningDomain =
  | 'finance'
  | 'travel'
  | 'food'
  | 'ai_work'
  | 'career'
  | 'health'
  | 'home'
  | 'relationships'
  | 'general';

export type LearningPresentationType =
  | 'named_list'
  | 'ranked_list'
  | 'how_to'
  | 'explainer'
  | 'recommendation'
  | 'comparison'
  | 'news_update'
  | 'story';

export type ResearchVerdict =
  | 'confirmed'
  | 'supported_with_context'
  | 'corrected'
  | 'not_verified'
  | 'opinion';

export interface ResearchFindingLike {
  topic: string;
  verdict: ResearchVerdict;
  explanation: string;
  correction: string | null;
  sources: { title: string; publisher: string; url: string }[];
}

export interface LearningCardPresentationInput {
  domain?: LearningDomain;
  presentationType?: LearningPresentationType;
  keyTakeaways: string[];
  claimsToVerify: unknown[];
  researchBrief?: {
    mode?: 'source_validation' | 'independent_supplement';
    findings: ResearchFindingLike[];
  } | null;
}

export interface LearningUnit {
  detail: string;
  heading: string | null;
  research: ResearchFindingLike | null;
}

const INLINE_PRESENTATIONS = new Set<LearningPresentationType>([
  'named_list',
  'ranked_list',
  'how_to',
  'recommendation',
  'comparison',
]);

function splitTakeaway(value: string): { detail: string; heading: string | null } {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.{2,120}?)\s+—\s+(.+)$/u);
  if (!match) return { detail: trimmed, heading: null };
  return { heading: match[1].trim(), detail: match[2].trim() };
}

export function shouldInlineResearch(card: LearningCardPresentationInput): boolean {
  const research = card.researchBrief;
  if (!research || research.mode === 'independent_supplement') return false;
  if (research.findings.length !== card.keyTakeaways.length) return false;
  const explicitlyStructured = card.presentationType
    ? INLINE_PRESENTATIONS.has(card.presentationType)
    : false;
  const legacyNamedSet = card.keyTakeaways.length >= 2
    && card.keyTakeaways.every((takeaway) => splitTakeaway(takeaway).heading !== null);
  return explicitlyStructured || legacyNamedSet;
}

export function learningUnits(card: LearningCardPresentationInput): LearningUnit[] {
  const inlineResearch = shouldInlineResearch(card);
  return card.keyTakeaways.map((takeaway, index) => ({
    ...splitTakeaway(takeaway),
    research: inlineResearch ? card.researchBrief?.findings[index] ?? null : null,
  }));
}

export function learningSectionTitle(card: LearningCardPresentationInput): string {
  const count = card.keyTakeaways.length;
  const counted = (singular: string, plural: string) => `${count} ${count === 1 ? singular : plural}`;
  if (card.domain === 'finance' && ['named_list', 'ranked_list', 'recommendation'].includes(card.presentationType ?? '')) {
    return counted('investment idea', 'investment ideas');
  }
  if (card.domain === 'travel' && ['named_list', 'ranked_list', 'recommendation'].includes(card.presentationType ?? '')) {
    return counted('trip tip', 'trip tips');
  }
  if (card.domain === 'food' && ['named_list', 'ranked_list', 'recommendation'].includes(card.presentationType ?? '')) {
    return counted('food find', 'food finds');
  }
  if (card.presentationType === 'how_to') return counted('step', 'steps');
  if (card.presentationType === 'comparison') return 'What to compare';
  if (card.presentationType === 'recommendation') return 'Recommendations';
  if (card.presentationType === 'news_update') return 'What changed';
  if (card.presentationType === 'story') return 'What to remember';
  if (card.presentationType === 'named_list' || card.presentationType === 'ranked_list') {
    return counted('key point', 'key points');
  }
  return 'What to know';
}

export function learningFormatLabel(presentationType?: LearningPresentationType): string {
  if (presentationType === 'named_list') return 'Curated list';
  if (presentationType === 'ranked_list') return 'Ranked list';
  if (presentationType === 'how_to') return 'How-to';
  if (presentationType === 'news_update') return 'Current update';
  if (!presentationType) return '';
  return presentationType.replaceAll('_', ' ').replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

export function researchVerdictLabel(verdict: ResearchVerdict): string {
  if (verdict === 'supported_with_context') return 'Supported with context';
  if (verdict === 'not_verified') return 'Not verified';
  return verdict.replace(/\b\w/gu, (letter) => letter.toUpperCase());
}

export function researchVerdictTone(verdict: ResearchVerdict): 'positive' | 'context' | 'warning' | 'neutral' {
  if (verdict === 'confirmed') return 'positive';
  if (verdict === 'supported_with_context') return 'context';
  if (verdict === 'corrected' || verdict === 'not_verified') return 'warning';
  return 'neutral';
}

export function shouldShowVerificationQueue(card: LearningCardPresentationInput): boolean {
  if (!card.claimsToVerify.length) return false;
  return !card.researchBrief || card.researchBrief.mode === 'independent_supplement';
}
