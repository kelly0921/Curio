import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(path, import.meta.url), 'utf8');

test('web manifest describes an installable standalone Curio app', async () => {
  const manifest = JSON.parse(await read('../public/manifest.webmanifest'));
  assert.equal(manifest.name, 'Curio — Keep what sparks you');
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.scope, '/');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.icons.some((icon) => icon.sizes === '192x192'));
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512'));
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
});

test('service worker caches only the app shell and static same-origin assets', async () => {
  const worker = await read('../public/sw.js');
  assert.match(worker, /url\.origin !== self\.location\.origin/);
  assert.match(worker, /url\.pathname\.startsWith\('\/api\/'\)/);
  assert.match(worker, /cacheKeyWithoutQuery/);
  assert.match(worker, /SKIP_WAITING/);
});

test('Pages Function proxies API paths to the processor without exposing its origin', async () => {
  const { onRequest } = await import('../functions/api/[[path]].js');
  const originalFetch = globalThis.fetch;
  let forwardedRequest;
  globalThis.fetch = async (request) => {
    forwardedRequest = request;
    return Response.json({ ok: true });
  };
  try {
    const response = await onRequest({
      env: { CURIO_PROCESSOR_ORIGIN: 'https://processor.example' },
      request: new Request('https://curio-app.pages.dev/api/items?limit=5', {
        headers: { cookie: 'curio.session_token=test-session' },
      }),
    });
    assert.equal(response.status, 200);
    assert.equal(forwardedRequest.url, 'https://processor.example/api/items?limit=5');
    assert.equal(forwardedRequest.headers.get('cookie'), 'curio.session_token=test-session');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('authenticated web builds keep auth and API traffic on the Pages origin', async () => {
  const apiClient = await read('../src/lib/curio-api.ts');
  assert.match(apiClient, /Platform\.OS === 'web' && authenticatedBuild/);
  assert.match(apiClient, /globalThis\.location\?\.origin/);
  assert.match(apiClient, /authenticatedBuild \|\| authenticatedSessionEnabled/);
});

test('static HTML exposes install metadata and an offline fallback', async () => {
  const [html, offline, headers] = await Promise.all([
    read('../src/app/+html.tsx'),
    read('../public/offline.html'),
    read('../public/_headers'),
  ]);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /apple-touch-icon/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(offline, /You’re offline for a moment\./);
  assert.match(headers, /Service-Worker-Allowed: \//);
  assert.match(headers, /\/sw\.js[\s\S]*no-cache, no-store/);
});
