export type ResourceUseIntent = 'understand' | 'try' | 'visit' | 'buy' | 'track' | 'compare' | 'reference';

export interface ResourceUseInput {
  domain: 'finance' | 'travel' | 'food' | 'ai_work' | 'career' | 'health' | 'home' | 'relationships' | 'general';
  entries: { detail: string; heading: string | null }[];
  intent?: ResourceUseIntent;
  resourceType: 'guide' | 'glossary' | 'playbook' | 'watchlist';
}

export interface ResourceUseGuide {
  description: string;
  focus: string;
  focusLabel: string;
  title: string;
}

export interface ResearchSourceLike {
  publisher: string;
  title: string;
  url: string;
}

export interface DisplayResearchSource extends ResearchSourceLike {
  displayTitle: string;
}

function entryNames(resource: ResourceUseInput): string[] {
  return resource.entries
    .map((entry) => entry.heading?.trim() || '')
    .filter(Boolean)
    .slice(0, 5);
}

function firstUsefulPoint(resource: ResourceUseInput): string {
  const first = resource.entries[0];
  if (!first) return 'Open the resource when this topic becomes relevant.';
  const point = first.heading?.trim() || first.detail.trim();
  return point.length > 170 ? `${point.slice(0, 167).trimEnd()}…` : point;
}

function namedFocus(resource: ResourceUseInput, fallback: string): string {
  const names = entryNames(resource);
  if (names.length >= 2) return names.join(' · ');
  if (names.length === 1) return names[0];
  return fallback;
}

export function resourceUseGuide(resource: ResourceUseInput): ResourceUseGuide {
  const count = resource.entries.length;
  const intent = resource.intent ?? 'understand';

  if (intent === 'track' || resource.resourceType === 'watchlist') {
    return {
      title: 'Turn this into a watchlist',
      description: 'Treat each entry as a thesis to revisit—not a conclusion. Open the research to see the evidence, risks, and what could weaken the claim.',
      focusLabel: 'WATCHING',
      focus: namedFocus(resource, `${count} item${count === 1 ? '' : 's'} to revisit as the evidence changes`),
    };
  }

  if (intent === 'visit') {
    return {
      title: 'Use this as trip preparation',
      description: 'Review these ideas before the trip, then open each one for current logistics, restrictions, and practical context.',
      focusLabel: 'TRIP PREP',
      focus: namedFocus(resource, `${count} tip${count === 1 ? '' : 's'} ready to review before you go`),
    };
  }

  if (intent === 'try') {
    return {
      title: 'Try the smallest useful version',
      description: 'Start with one workable step. Use the deeper notes to check prerequisites, failure points, and limits before expanding it.',
      focusLabel: 'START HERE',
      focus: firstUsefulPoint(resource),
    };
  }

  if (intent === 'buy') {
    return {
      title: 'Build a shortlist before buying',
      description: 'Use the entries to compare fit and tradeoffs. Open the research before treating a creator recommendation as a decision.',
      focusLabel: 'SHORTLIST',
      focus: namedFocus(resource, `${count} option${count === 1 ? '' : 's'} to evaluate`),
    };
  }

  if (intent === 'compare') {
    return {
      title: 'Make the tradeoffs explicit',
      description: 'Compare the options against the same criteria, then read the deeper context for conditions that could change the choice.',
      focusLabel: 'COMPARE',
      focus: namedFocus(resource, `${count} decision point${count === 1 ? '' : 's'} to weigh`),
    };
  }

  if (intent === 'reference' || resource.resourceType === 'glossary') {
    return {
      title: resource.resourceType === 'glossary' ? 'Keep this as a plain-English reference' : 'Keep this as a working reference',
      description: 'Use the short definitions for recall. Open “Learn more” when you need the mechanism, exceptions, or an evidence-backed explanation.',
      focusLabel: 'REFERENCE',
      focus: namedFocus(resource, `${count} note${count === 1 ? '' : 's'} ready when you need them`),
    };
  }

  return {
    title: resource.domain === 'finance' ? 'Understand the mechanism before acting' : 'Go beyond the headline',
    description: 'Use the concise points for orientation, then open the deeper research to understand how the idea works, where it applies, and where it breaks down.',
    focusLabel: 'START WITH',
    focus: firstUsefulPoint(resource),
  };
}

export function researchDepthLabel(verdict: 'confirmed' | 'supported_with_context' | 'corrected' | 'not_verified' | 'opinion'): string {
  if (verdict === 'confirmed') return 'Verified explanation';
  if (verdict === 'supported_with_context') return 'How it works + context';
  if (verdict === 'corrected') return 'Important correction';
  if (verdict === 'not_verified') return 'Why this is uncertain';
  return 'Creator perspective';
}

export function uniqueResearchSources(sources: ResearchSourceLike[]): ResearchSourceLike[] {
  const urls = new Set<string>();
  return sources.filter((source) => {
    const key = source.url.trim().replace(/\/$/u, '').toLocaleLowerCase();
    if (urls.has(key)) return false;
    urls.add(key);
    return true;
  });
}

export function displayResearchSources(sources: ResearchSourceLike[]): DisplayResearchSource[] {
  const unique = uniqueResearchSources(sources);
  const totals = new Map<string, number>();
  for (const source of unique) {
    const key = source.title.trim().toLocaleLowerCase();
    totals.set(key, (totals.get(key) ?? 0) + 1);
  }
  const positions = new Map<string, number>();
  return unique.map((source) => {
    const key = source.title.trim().toLocaleLowerCase();
    const total = totals.get(key) ?? 1;
    const position = (positions.get(key) ?? 0) + 1;
    positions.set(key, position);
    return {
      ...source,
      displayTitle: total > 1 ? `${source.title} · ${position} of ${total}` : source.title,
    };
  });
}
