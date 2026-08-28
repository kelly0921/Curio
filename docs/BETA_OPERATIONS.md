# Curio private-beta operations

## Release gates

1. `/api/health` returns HTTP 200 with D1, Queue, and R2 readiness all `true`.
2. An invited tester can complete passwordless sign-in from the installed build.
3. Paste one public Reel, close Curio on the processing screen, reopen it, and confirm the Library resumes the job and opens the finished resource.
4. Resubmit the same URL and confirm Curio returns the same job/item instead of charging for duplicate processing.
5. Export account data, inspect the JSON, then run deletion only on a disposable test account and confirm its D1 rows and R2 prefix are gone.
6. Run the content scorecard in `docs/BETA_CONTENT_SCORECARD.csv`.

## Known dependency gate

The processor production dependency audit is clean. The Expo SDK 54 tree still reports eight high-severity findings through Metro's build-time `image-size` parser. Curio does not run that parser on user submissions; Metro uses it while bundling trusted app assets. The current `image-size` major cannot be overridden without breaking Expo export, and npm's offered fix is the breaking Expo 57 upgrade. PostCSS and UUID are pinned to fixed compatible releases. Do not run `npm audit fix --force`; upgrade Expo deliberately and repeat physical-device/Expo Go testing before a public release.

## Monitoring

Cloudflare observability is enabled in `wrangler.jsonc`. Production logs use structured events and intentionally exclude URLs, captions, transcripts, email, and generated content.

Watch these events:

- `processing_job_enqueued`
- `processing_job_started`
- `processing_job_completed`
- `processing_job_retry_scheduled`
- `processing_job_failed`
- `processing_message_rejected`
- `account_export_failed`
- `account_data_deletion_failed`

Check the `curio-processing` queue for growing backlog and the `curio-processing-dlq` queue for terminal delivery failures. During the beta, configure an external uptime probe against `/api/health` every five minutes and alert after two consecutive failures. Alert on any dead-letter message, a sustained processing failure rate above 10%, or p95 completion time above five minutes.

Never paste raw source content or credentials into an incident ticket. Use the `X-Curio-Request-Id` response header or opaque job ID to correlate Cloudflare logs.

## External tester rollout

Start with three to five people who already save learning content across different domains. Add only their email addresses to the private-beta invite list. Give them the preview build link plus the paste-first instructions; do not advertise Share to Curio until a native incoming-share extension passes physical-device testing.

For each tester, collect only:

- whether sign-in and capture succeeded;
- whether the five most recent resources were accurate, useful, and easy to scan;
- whether related saves merged correctly;
- whether they could find a saved idea later;
- the request/job ID for a failure, never the private source contents unless they choose to share it.

## Native distribution

Android internal distribution can use the existing EAS `preview` profile:

```powershell
Set-Location apps/mobile
npx eas-cli@latest build --profile preview --platform android
```

An installable iPhone build requires Apple signing. After an Apple Developer account is available, run the equivalent iOS preview build, register tester devices when prompted, and validate the Supabase `curio://auth/callback` redirect. TestFlight and App Store distribution remain gated on Apple account setup, published privacy/support URLs, store metadata, and review.
