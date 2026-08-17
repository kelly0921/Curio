# Curio

Curio turns useful social videos and links into organized knowledge: detailed source notes, source-validated research, and personalized priorities based on connected context.

## Repository layout

- `apps/mobile` — Expo mobile-first capture, library, source viewer, and For You experience.
- `apps/learning-library` — Next.js processing API, OpenAI extraction and research, context routing, and optional Supabase persistence.

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

See the application READMEs for LAN configuration, Expo builds, Supabase migrations, Cloudflare deployment, and current prototype limitations.

## Quality checks

```powershell
npm test
npm run lint
npm run typecheck
npm run export:web
```

Local `.env` files, API keys, dependencies, caches, and generated builds are intentionally excluded from version control.
