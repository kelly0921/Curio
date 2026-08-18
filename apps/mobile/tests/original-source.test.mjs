import assert from 'node:assert/strict';
import test from 'node:test';

import { originalSourceLink } from '../src/lib/original-source.ts';

test('keeps the exact Instagram Reel permalink and removes tracking', () => {
  assert.deepEqual(
    originalSourceLink('https://instagram.com/reel/ABC_123/?igsh=tracking#fragment', 'instagram'),
    {
      href: 'https://www.instagram.com/reel/ABC_123/',
      label: 'Open original Reel',
      target: '_blank',
    },
  );
});

test('normalizes the plural Reels path without sending users to the generic feed', () => {
  assert.equal(
    originalSourceLink('https://www.instagram.com/reels/ABC-123/', 'instagram').href,
    'https://www.instagram.com/reel/ABC-123/',
  );
});

test('keeps Instagram post permalinks exact', () => {
  assert.deepEqual(
    originalSourceLink('https://www.instagram.com/p/POST123/?utm_source=share', 'instagram'),
    {
      href: 'https://www.instagram.com/p/POST123/',
      label: 'Open original post',
      target: '_blank',
    },
  );
});

test('does not rewrite non-Instagram sources', () => {
  assert.equal(
    originalSourceLink('https://example.com/lesson?part=2', 'web').href,
    'https://example.com/lesson?part=2',
  );
});
