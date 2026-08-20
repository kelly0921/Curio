import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const appDirectory = fileURLToPath(new URL(".", import.meta.url));
const cli = fileURLToPath(new URL("./node_modules/@opennextjs/cloudflare/dist/cli/index.js", import.meta.url));
const buildEnvironment = { ...process.env };

// These values are supplied by Cloudflare at runtime. Defining them as empty
// prevents Next's local .env files from copying development secrets into the
// generated Worker bundle during a build from a developer machine.
for (const name of [
  "OPENAI_API_KEY",
  "CURIO_API_TOKEN",
  "SUPABASE_SECRET_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_AUTH_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_ANON_KEY",
  "CURIO_INVITED_EMAILS",
]) {
  buildEnvironment[name] = "";
}

const child = spawn(process.execPath, [cli, "build"], {
  cwd: appDirectory,
  env: buildEnvironment,
  stdio: "inherit",
});

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) {
    console.error(`Cloudflare build ended after signal ${signal}.`);
    process.exitCode = 1;
    return;
  }
  process.exitCode = code ?? 1;
});
