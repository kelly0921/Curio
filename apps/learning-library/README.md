# Curio — save what sparks you

Curio turns useful media and links into provenance-first knowledge cards. Instagram remains a discovery and capture surface; Curio is the processing and organization layer:

`share, paste, or upload → inspect available evidence → transcribe/extract → structured AI analysis → topic-organized knowledge`

The product follows three capture principles:

1. **One action by default:** paste a link and save; no title, folder, or setup is required.
2. **Organize after capture:** topic collections emerge from processed content instead of interrupting the save.
3. **Enrich progressively:** a restricted link stays safely saved and can receive a caption, transcript, or note later without creating a duplicate.

The longer-term context principle is **connect once, then disappear**. Curio should automatically ingest the broad context available through each user-authorized connection instead of asking people to recreate profiles, choose folders, or repeatedly supply details. Context remains separated by domain and provenance so each learning uses only the relevant slice, even when the connected source contains finance, travel, food, work, and other personal information together.

The processor is kept separate from the Expo client so it can be deployed independently while sharing validated API contracts.

## What works

- Small direct video/audio uploads (20 MB application limit)
- OpenAI speech transcription for supported uploaded media
- Best-effort OpenAI web retrieval for exact public source URLs, with consulted-URL validation
- Experimental local Instagram public-embed resolution that can transcribe ephemeral Reel media without user input
- Strict, Zod-validated Learning Card output through the OpenAI Responses API
- Detailed source notes that preserve mechanisms, examples, claims, and named resources from the extraction
- A separate source-validated research brief that confirms, contextualizes, or corrects important claims with clickable citations
- A Personal Context API with connector-shaped records, provenance, domain, sensitivity, and freshness metadata
- Automatic mock-workspace sync across finance, travel, food, AI/work, and career for product validation
- Domain-scoped personalization that ranks saves and discloses exactly which connected signals were used
- General HTTPS link capture for Instagram, YouTube, TikTok, Vimeo, and other web sources
- One-field quick save with upload and context kept secondary
- Caption and manually supplied visible-text fallback
- Explicit processing states and access levels
- Automatic topic groups with a working knowledge-map filter
- Exact receipt of every source channel visible to the analysis model
- Verification flags for factual and potentially high-stakes claims
- SHA-256 duplicate detection for identical files and normalized URLs
- In-place enrichment when new source material is submitted for an existing link-only save
- Optional Supabase persistence; active-process memory fallback for instant local use
- Credential-free, visibly labeled recorded sample for UI and contract testing

Uploaded video is currently classified as `partial` even when transcription succeeds. V0.1 analyzes the audio transcript, not the visual track, so it never claims to have watched the complete Reel.

Instagram's public embed HTML is an undocumented integration surface. Curio enables this resolver automatically only in local development; production requires `ENABLE_EXPERIMENTAL_INSTAGRAM_EMBED=true`. It validates Instagram shortcodes and Meta CDN hosts, caps media at 24 MB, keeps the download only in memory, and records the caption/transcript provenance. The HTML shape can change, and Instagram's platform terms must be reviewed before enabling it in a shipped product. Exact-page OpenAI web search remains the non-scraping fallback.

## Architecture

```text
Next.js client
  └─ POST /api/items (multipart)
       └─ processing/pipeline.ts
            ├─ source validation + SHA-256 fingerprint
            ├─ PublicSourceRetriever (OpenAI web search, exact URL only)
            ├─ MediaTranscriber (OpenAI audio transcription)
            ├─ LearningCardAnalyzer (OpenAI structured output)
            ├─ LearningCardResearcher (OpenAI web search + consulted-URL validation)
            └─ LearningItemRepository
                 ├─ Supabase (durable, when configured)
                 └─ process memory (local fallback)

GET /api/context
  └─ ContextConnector
       └─ MockContextConnector (current validation source)
            └─ normalized ContextSnapshot
                 └─ context-router-v1 → per-card priority, why-now, use, and next step
```

Important boundaries:

- `lib/domain.ts` is the versioned runtime contract for states, evidence, claims, items, and cards.
- `lib/ai/prompt.ts` keeps `SOURCE MATERIAL`, `USER CONTEXT`, and `GENERATED INTERPRETATION` separate.
- `lib/ai/services.ts` owns OpenAI calls behind small transcription, retrieval, and analysis interfaces.
- `lib/processing/pipeline.ts` owns state transitions and can move behind a Queue without changing the UI or domain.
- `lib/context/*` keeps connector sync, normalized context, domain routing, and derived personalization separate from source extraction.
- `lib/data/*` keeps persistence replaceable; Supabase stores the validated canonical record plus searchable projections.
- `app/api/items/route.ts` only validates HTTP input, selects dependencies, and returns response envelopes.

The browser request is synchronous in V0.1. The UI presents the processing journey while the request runs. Longer media should move to direct R2 upload plus Cloudflare Queues before this is shared broadly.

## Access and status behavior

| Source available | Access level | Result |
| --- | --- | --- |
| Uploaded media with transcript | `partial` | Learning Card from transcript and any supplied caption/text |
| URL with supplied caption/text | `partial` | Learning Card from only that supplied material |
| Public URL with retrievable page text | `partial` | Learning Card from the exact page text returned by AI web retrieval |
| Public URL with no retrievable text | `link_only` | Link captured after retrieval attempt; no invented summary |
| Media with no analyzable speech or text | `unsupported` | Evidence and reason preserved; no card |
| Missing credentials or provider failure | `failed` | Available evidence preserved with a recoverable issue |
| Future audio + visual + caption coverage | `full` | Reserved for a later extractor |

## Local setup

Requirements: Node.js 20+ and pnpm 11.9.0.

Install from the app directory. An app-local lockfile keeps this prototype isolated from unrelated workspaces in the larger repository:

```powershell
Set-Location apps/learning-library
npm install
Copy-Item .env.example .env.local
npm run dev
```

Open [http://localhost:3031](http://localhost:3031).

The recorded sample works without credentials and is clearly labeled as `deterministic_demo`. For a real upload, set `OPENAI_API_KEY` only in `apps/learning-library/.env.local` or the process environment. Do not paste keys into chat, source code, command arguments, screenshots, or committed files.

### Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `OPENAI_API_KEY` | Real media/card path | Server-only OpenAI credential |
| `OPENAI_TRANSCRIPTION_MODEL` | No | Defaults to `gpt-4o-mini-transcribe` |
| `OPENAI_ANALYSIS_MODEL` | No | Defaults to `gpt-5.4-mini` |
| `OPENAI_RETRIEVAL_MODEL` | No | Defaults to `gpt-5.4-mini`; uses the Responses API web-search tool |
| `ENABLE_EXPERIMENTAL_INSTAGRAM_EMBED` | No | Local default: on. Production default: off; enables bounded public Reel caption/media retrieval |
| `SUPABASE_URL` | Durable storage | Supabase project URL; set with the secret key |
| `SUPABASE_SECRET_KEY` | Durable storage | Preferred `sb_secret_...` server key; never expose in `NEXT_PUBLIC_` |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy fallback | Accepted only when a newer secret key is unavailable |

The personal relevance profile is intentionally configured in `lib/domain.ts`; V0.1 has no auth or onboarding.

## Supabase setup

1. Create or select a Supabase project.
2. Open **SQL Editor**.
3. Run the migrations in order: `0001_learning_library.sql`, `0002_external_sources.sql`, then `0003_personal_context.sql`.
4. Copy the project URL and a backend secret key from **Settings → API Keys**.
5. Set `SUPABASE_URL` and `SUPABASE_SECRET_KEY` in `.env.local`.
6. Open `/api/health` and confirm `persistence.mode` is `supabase` and `durable` is `true`.

The migration enables RLS, grants only the elevated server role, and gives browser roles no table privileges. There is deliberately no browser-side Supabase client.

## Quality commands

From `apps/learning-library`:

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run build:cloudflare
npm run cf:dry-run
```

## Cloudflare Workers deployment

The app uses the OpenNext Cloudflare adapter because it needs server route handlers and server-only credentials.

1. Authenticate Wrangler locally or connect the repository through Workers Builds.
2. From `apps/learning-library`, add encrypted runtime secrets:

   ```powershell
   npx wrangler secret put OPENAI_API_KEY
   npx wrangler secret put SUPABASE_SECRET_KEY
   npx wrangler secret put SUPABASE_URL
   ```

3. Generate binding types and run the production-runtime preview:

   ```powershell
   npm run cf:typegen
   npm run preview:cloudflare
   ```

4. Deploy:

   ```powershell
   npm run deploy:cloudflare
   ```

5. Verify `/api/health`, submit the recorded sample, then test one short upload that fits the request limit of the selected Workers plan.

For Workers Builds, set the root directory to `apps/learning-library`, the build command to `npm ci && npm run build:cloudflare`, and the deploy command to `npx wrangler deploy --keep-vars`.

This personal prototype has no application auth. Before making a deployment public, place it behind Cloudflare Access or add authentication. Direct media uploads should move to presigned R2 URLs before inviting testers; do not raise the in-memory route limit as a substitute.

## Important prototype limitations

- No private Instagram Saved-folder synchronization; Meta's supported API does not currently expose that capture surface
- No Instagram or third-party scraping; links are captured and only supplied captions/transcripts are analyzed
- Share-to-Curio now has an Expo SDK 57 client in `apps/mobile`; incoming sharing is experimental and requires a native development build
- No automated video-frame OCR yet
- Uploaded media itself is not durably stored; the transcript and an ephemeral filename reference are retained
- No retry endpoint yet; resubmit after correcting a recoverable failure
- No auth; one configured personal profile
- The active context connector is labeled mock data; Notion OAuth and durable context synchronization are not connected yet
- No semantic search, pgvector, weekly recap generation, R2, or Queues yet
- Research provides cited context and corrections, but it is not personalized professional advice

## Next milestones

1. Test 10 representative real links/uploads and record access level, usefulness, and failure mode.
2. Validate the Expo Share-to-Curio target on physical iOS and Android devices, with pasted links retained as the universal fallback.
3. Add R2 direct uploads and a Queue consumer while retaining `processLearningItem` as the domain orchestrator.
4. Extract representative frames/OCR and allow `full` only when the required channels are actually covered.
5. Replace the mock connector with user-authorized Notion sync while keeping the same normalized context contract.
6. Add keyword and semantic search, related-idea clustering, and weekly cross-item synthesis.

Current implementation choices were checked against the official [Cloudflare Next.js/OpenNext guide](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/), [Cloudflare Workers best practices](https://developers.cloudflare.com/workers/best-practices/workers-best-practices/), [Supabase API-key guidance](https://supabase.com/docs/guides/getting-started/api-keys), [Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security), [OpenAI transcription API reference](https://developers.openai.com/api/reference/resources/audio/subresources/transcriptions/methods/create), and [OpenAI Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs).
