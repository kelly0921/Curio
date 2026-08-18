import assert from 'node:assert/strict';
import test from 'node:test';

import { takeawayParts } from '../src/lib/takeaway.ts';

test('splits a named Reel subject into a heading and its reason', () => {
  assert.deepEqual(
    takeawayParts('Coherent — Optical components give it direct exposure to AI data-center buildout.'),
    {
      heading: 'Coherent',
      detail: 'Optical components give it direct exposure to AI data-center buildout.',
    },
  );
});

test('keeps ordinary takeaways as one readable sentence', () => {
  assert.deepEqual(
    takeawayParts('Compare the claim with primary sources before acting.'),
    { heading: null, detail: 'Compare the claim with primary sources before acting.' },
  );
});
