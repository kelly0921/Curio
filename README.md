# Curio

Curio turns useful social videos and links into organized knowledge: detailed source notes, source-validated research, and personalized priorities based on connected context.

The long-term product direction is to treat saved posts as input sources and turn them into deduplicated living resources rather than accumulating one card per source. See [Curio product direction](docs/PRODUCT_DIRECTION.md).

## Repository layout

- `apps/mobile` — Expo mobile-first capture, library, source viewer, and For You experience.
- `apps/learning-library` — Next.js processing API, OpenAI extraction and research, context routing, and durable Cloudflare D1 persistence.

## Live personal beta

The protected processor is deployed at [https://curio-processor.kellychenmeiyi.workers.dev](https://curio-processor.kellychenmeiyi.workers.dev). Its health endpoint reports the OpenAI and D1 configuration without exposing secrets. Expo development, preview, and production environments point to this URL.

The mobile app and Worker share a generated personal-beta access token stored only in Git-ignored local files, encrypted Worker secrets, and EAS environment variables. This gate prevents anonymous use during personal testing; replace it with real user authentication before distributing the app.

## Local development

Install each application once:

```powershell
npm --prefix apps/learning-library install
npm --prefix apps/mobile install
```

Copy the processor environment template and add your server-side OpenAI key:

```powershell
Copy-Item apps/learning-library/.env.example apps/learning-library/.env.local
```

Run the processor in one terminal:

```powershell
npm run dev:processor
```

Run Expo in another terminal:

```powershell
npm run dev:mobile
```

For a static phone-browser preview:

```powershell
npm run export:web
npm --prefix apps/mobile run preview:web
```

See the application READMEs for LAN configuration, Expo builds, D1 migrations, Cloudflare deployment, optional Supabase support, and current prototype limitations.

## Quality checks

```powershell
npm test
npm run lint
npm run typecheck
npm run export:web
```

Local `.env` files, API keys, dependencies, caches, and generated builds are intentionally excluded from version control.
