import assert from 'node:assert/strict';
import test from 'node:test';

import { parseIncomingShare } from '../src/lib/incoming-share.ts';

test('extracts a shared URL and keeps useful text from the same payload', () => {
  assert.deepEqual(
    parseIncomingShare([{ value: 'Five Japan rail tips https://www.instagram.com/reel/ABC123/?utm_source=share' }]),
    {
      url: 'https://www.instagram.com/reel/ABC123/?utm_source=share',
      context: 'Five Japan rail tips',
      media: null,
    },
  );
});

test('keeps context delivered separately from the shared URL', () => {
  assert.deepEqual(
    parseIncomingShare([
      { value: 'https://www.tiktok.com/@curious/video/123' },
      { value: 'A practical breakdown of how an HSA can be invested.' },
    ]),
    {
      url: 'https://www.tiktok.com/@curious/video/123',
      context: 'A practical breakdown of how an HSA can be invested.',
      media: null,
    },
  );
});

test('deduplicates shared context and ignores file references', () => {
  assert.deepEqual(
    parseIncomingShare([
      { value: 'https://example.com/guide' },
      { value: 'This is the useful source description.' },
      { value: 'This is the useful source description.' },
      { value: 'content://media/external/video/42', contentType: 'text' },
    ]),
    {
      url: 'https://example.com/guide',
      context: 'This is the useful source description.',
      media: null,
    },
  );
});

test('preserves supported shared media without treating its URI as context', () => {
  assert.deepEqual(
    parseIncomingShare([{
      value: 'file:///recordings/reel.mp4',
      shareType: 'video',
      contentUri: 'file:///recordings/reel.mp4',
      contentMimeType: 'video/mp4',
      originalName: 'reel.mp4',
    }]),
    {
      url: null,
      context: null,
      media: {
        uri: 'file:///recordings/reel.mp4',
        name: 'reel.mp4',
        mimeType: 'video/mp4',
      },
    },
  );
});
