import assert from 'node:assert/strict';
import test from 'node:test';

import { parseAuthCallback } from '../src/lib/auth-callback.ts';

test('accepts a PKCE code on the Curio callback route', () => {
  assert.deepEqual(parseAuthCallback('curio://auth/callback?code=pkce-code'), {
    kind: 'code',
    code: 'pkce-code',
  });
});

test('accepts implicit mobile session tokens from the URL fragment', () => {
  assert.deepEqual(
    parseAuthCallback('exp://192.168.0.231:8081/--/auth/callback#access_token=access&refresh_token=refresh'),
    { kind: 'session', accessToken: 'access', refreshToken: 'refresh' },
  );
});

test('surfaces callback errors without accepting partial credentials', () => {
  assert.deepEqual(
    parseAuthCallback('curio://auth/callback#error=access_denied&error_description=Invite%20expired'),
    { kind: 'error', message: 'Invite expired' },
  );
  assert.deepEqual(
    parseAuthCallback('curio://auth/callback#access_token=access'),
    { kind: 'none' },
  );
});

test('ignores authentication parameters on unrelated Curio links', () => {
  assert.deepEqual(parseAuthCallback('curio://capture?code=untrusted'), { kind: 'none' });
  assert.deepEqual(parseAuthCallback('not a url'), { kind: 'none' });
});
