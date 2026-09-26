import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const appConfig = JSON.parse(await readFile(new URL('../app.json', import.meta.url), 'utf8'));
const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const nativeIntent = await readFile(new URL('../src/app/+native-intent.ts', import.meta.url), 'utf8');
const shareHandler = await readFile(new URL('../src/app/handle-share.tsx', import.meta.url), 'utf8');

function sharingPluginOptions() {
  const plugin = appConfig.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === 'expo-sharing');
  assert.ok(plugin, 'expo-sharing must be configured as a native plugin');
  return plugin[1];
}

test('uses an Expo release with incoming sharing support', () => {
  assert.match(packageJson.dependencies.expo, /(?:\^|~)57\./u);
  assert.match(packageJson.dependencies['expo-sharing'], /(?:\^|~)57\./u);
});

test('registers Curio for low-friction mobile link and media sharing', () => {
  const options = sharingPluginOptions();

  assert.equal(options.ios.enabled, true);
  assert.equal(options.ios.activationRule.supportsText, true);
  assert.equal(options.ios.activationRule.supportsWebUrlWithMaxCount, 1);
  assert.equal(options.ios.activationRule.supportsMovieWithMaxCount, 1);
  assert.equal(options.android.enabled, true);
  assert.ok(options.android.singleShareMimeTypes.includes('text/plain'));
  assert.ok(options.android.singleShareMimeTypes.includes('video/*'));
});

test('routes native share intents into the automatic Curio capture screen', () => {
  assert.match(nativeIntent, /hostname === 'expo-sharing'/u);
  assert.match(nativeIntent, /return '\/handle-share'/u);
  assert.match(shareHandler, /useIncomingShare/u);
  assert.match(shareHandler, /No folders to choose and no form to fill out/u);
});
