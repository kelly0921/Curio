import assert from 'node:assert/strict';
import test from 'node:test';

import { displayResearchSources, followThroughPresentation, researchDepthLabel, resourceDeepDiveOptions, resourceFollowThroughKind, resourceUseGuide, uniqueResearchSources } from '../src/lib/resource-presentation.ts';

const resource = (patch = {}) => ({
  domain: 'finance',
  entries: [
    { heading: 'AOI', detail: 'Vertically integrated production is the stated advantage.' },
    { heading: 'Lumentum', detail: 'High-speed laser demand is the stated catalyst.' },
    { heading: 'Viavi Solutions', detail: 'Testing demand is the stated opportunity.' },
  ],
  intent: 'track',
  resourceType: 'watchlist',
  ...patch,
});

test('turns an investment resource into a concrete watchlist use case', () => {
  assert.deepEqual(resourceUseGuide(resource()), {
    title: 'Turn this into a watchlist',
    description: 'Treat each entry as a thesis to revisit—not a conclusion. Open the research to see the evidence, risks, and what could weaken the claim.',
    focusLabel: 'WATCHING',
    focus: 'AOI · Lumentum · Viavi Solutions',
  });
  assert.deepEqual(resourceDeepDiveOptions(resource()), [
    { kind: 'what_to_watch', label: 'What should I watch?' },
    { kind: 'how_it_works', label: 'How does this connect?' },
    { kind: 'limits_and_risks', label: 'What could invalidate it?' },
  ]);
  assert.equal(resourceFollowThroughKind(resource()), 'watchlist');
  assert.equal(followThroughPresentation('watchlist').startLabel, 'Follow this watchlist');
});

test('gives a glossary a reference purpose without making the top level verbose', () => {
  const guide = resourceUseGuide(resource({
    entries: [
      { heading: 'Stock split', detail: 'One share becomes multiple cheaper shares.' },
      { heading: 'Liquidity premium', detail: 'Compensation for lower liquidity.' },
    ],
    intent: 'understand',
    resourceType: 'glossary',
  }));

  assert.equal(guide.title, 'Keep this as a plain-English reference');
  assert.equal(guide.focus, 'Stock split · Liquidity premium');
});

test('uses the first practical step when a playbook is ready to try', () => {
  const guide = resourceUseGuide(resource({
    domain: 'ai_work',
    entries: [{ heading: null, detail: 'Open one page and identify the repeated content pattern before automating anything.' }],
    intent: 'try',
    resourceType: 'playbook',
  }));

  assert.equal(guide.title, 'Try the smallest useful version');
  assert.equal(guide.focusLabel, 'START HERE');
  assert.equal(guide.focus, 'Open one page and identify the repeated content pattern before automating anything.');
  assert.equal(resourceFollowThroughKind(resource({ intent: 'try', resourceType: 'playbook' })), 'checklist');
  assert.equal(followThroughPresentation('checklist').progressNoun, 'steps done');
  assert.deepEqual(resourceDeepDiveOptions(resource({ intent: 'try', resourceType: 'playbook' })).map((option) => option.kind), [
    'how_it_works',
    'practical_example',
    'limits_and_risks',
  ]);
});

test('maps travel, comparison, and reference resources to low-input follow-through formats', () => {
  assert.equal(resourceFollowThroughKind(resource({ intent: 'visit', resourceType: 'guide' })), 'trip_plan');
  assert.equal(resourceFollowThroughKind(resource({ intent: 'compare', resourceType: 'guide' })), 'shortlist');
  assert.equal(resourceFollowThroughKind(resource({ intent: 'reference', resourceType: 'glossary' })), 'review');
  assert.equal(followThroughPresentation('trip_plan').activeLabel, 'In your trip prep');
});

test('labels every research state by the depth it offers', () => {
  assert.equal(researchDepthLabel('confirmed'), 'Verified explanation');
  assert.equal(researchDepthLabel('supported_with_context'), 'How it works + context');
  assert.equal(researchDepthLabel('corrected'), 'Important correction');
  assert.equal(researchDepthLabel('not_verified'), 'Why this is uncertain');
  assert.equal(researchDepthLabel('opinion'), 'Creator perspective');
});

test('deduplicates repeated research links while preserving source order', () => {
  assert.deepEqual(uniqueResearchSources([
    { title: 'First label', publisher: 'SEC', url: 'https://example.com/filing/' },
    { title: 'Repeated label', publisher: 'SEC', url: 'https://example.com/filing' },
    { title: 'Second source', publisher: 'FINRA', url: 'https://example.com/guide' },
  ]), [
    { title: 'First label', publisher: 'SEC', url: 'https://example.com/filing/' },
    { title: 'Second source', publisher: 'FINRA', url: 'https://example.com/guide' },
  ]);
});

test('distinguishes different sources that retain the same title', () => {
  const sources = displayResearchSources([
    { title: '8-K disclosure', publisher: 'SEC', url: 'https://example.com/filing-a' },
    { title: '8-K disclosure', publisher: 'SEC', url: 'https://example.com/filing-b' },
    { title: 'Investor guide', publisher: 'FINRA', url: 'https://example.com/guide' },
  ]);

  assert.deepEqual(sources.map((source) => source.displayTitle), [
    '8-K disclosure · 1 of 2',
    '8-K disclosure · 2 of 2',
    'Investor guide',
  ]);
});
