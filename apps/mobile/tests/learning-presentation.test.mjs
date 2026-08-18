import assert from 'node:assert/strict';
import test from 'node:test';

import {
  researchDisclosureLabel,
  researchRollupLabel,
  learningSectionTitle,
  learningUnits,
  researchVerdictLabel,
  shouldInlineResearch,
  shouldShowVerificationQueue,
} from '../src/lib/learning-presentation.ts';

const findings = [
  {
    topic: 'AOI',
    verdict: 'supported_with_context',
    explanation: 'AOI manufactures optical networking products, but execution and customer concentration remain material risks.',
    correction: null,
    sources: [{ title: 'Annual report', publisher: 'AOI', url: 'https://example.com/aoi' }],
  },
  {
    topic: 'Lumentum',
    verdict: 'not_verified',
    explanation: 'The product connection is visible, but the exclusive-supplier claim was not established.',
    correction: 'Treat exclusivity as unverified.',
    sources: [],
  },
];

const investmentCard = {
  title: 'Optical transceiver beneficiaries',
  primaryTopic: 'optical transceivers',
  summary: 'Three companies may benefit from a policy change.',
  domain: 'finance',
  presentationType: 'named_list',
  keyTakeaways: [
    'AOI — In-house laser fabrication is the stated production advantage.',
    'Lumentum — High-speed EML demand is the stated catalyst.',
  ],
  claimsToVerify: [{ claim: 'Supplier exclusivity' }],
  researchBrief: { mode: 'source_validation', findings },
};

test('labels a structured finance card by its useful information shape', () => {
  assert.equal(learningSectionTitle(investmentCard), '2 investment ideas');
  assert.equal(learningSectionTitle({
    ...investmentCard,
    title: 'Finance terms in plain language',
    primaryTopic: 'financial vocabulary',
    summary: 'Simple definitions for common terms.',
  }), '2 finance terms');
});

test('pairs each source lesson with its matching validation', () => {
  assert.equal(shouldInlineResearch(investmentCard), true);
  assert.deepEqual(learningUnits(investmentCard), [
    {
      heading: 'AOI',
      detail: 'In-house laser fabrication is the stated production advantage.',
      research: findings[0],
    },
    {
      heading: 'Lumentum',
      detail: 'High-speed EML demand is the stated catalyst.',
      research: findings[1],
    },
  ]);
});

test('keeps unmatched research separate and retains unresolved verification flags', () => {
  const card = {
    ...investmentCard,
    researchBrief: { mode: 'independent_supplement', findings: findings.slice(0, 1) },
  };
  assert.equal(shouldInlineResearch(card), false);
  assert.equal(shouldShowVerificationQueue(card), true);
});

test('does not repeat a verification queue after source validation', () => {
  assert.equal(shouldShowVerificationQueue(investmentCard), false);
  assert.equal(researchVerdictLabel('supported_with_context'), 'Supported with context');
  assert.equal(researchVerdictLabel('not_verified'), 'Not verified');
});

test('summarizes research once and hides generic no-source repetition', () => {
  assert.equal(researchRollupLabel(findings), '1 checked · 1 not yet verified');
  assert.equal(researchDisclosureLabel(findings[0]), 'Added context');
  assert.equal(researchDisclosureLabel({
    ...findings[1],
    explanation: 'Curio did not retain a directly supporting source for this list item, so it is not presented as validated.',
  }), null);
});
