import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const appDirectory = fileURLToPath(new URL('..', import.meta.url));
const expoCli = fileURLToPath(new URL('../node_modules/expo/bin/cli', import.meta.url));
const buildEnvironment = {
  ...process.env,
  EXPO_NO_DOTENV: '1',
  EXPO_PUBLIC_CURIO_AUTH_ENABLED: 'true',
};

// The authenticated PWA talks to its same-origin API proxy. Never let legacy
// bearer or direct database credentials become part of a static client bundle.
for (const name of [
  'EXPO_PUBLIC_CURIO_API_TOKEN',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
]) {
  delete buildEnvironment[name];
}

const child = spawn(process.execPath, [expoCli, 'export', '--platform', 'web', '--clear'], {
  cwd: appDirectory,
  env: buildEnvironment,
  stdio: 'inherit',
});

child.on('error', (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`Expo export ended after signal ${signal}.`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
