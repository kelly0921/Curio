# Curio Private Beta Readiness

Updated: August 27, 2026

## Beta objective

Prove that a person other than the founder can sign in, capture useful content on a phone without help, receive an accurate resource, and retrieve it later.

This milestone is about reliability and evidence. It does not add quizzes, more resource types, broad connectors, or social features.

## Current verified baseline

- The complete Curio history is merged into `main`.
- `main` requires pull requests, resolved conversations, and blocks force-pushes and deletion.
- The deployed processor health endpoint reports Supabase authentication, OpenAI configuration, and durable Cloudflare D1 persistence.
- An unauthenticated library request returns `401`.
- 101 processor tests and 27 mobile tests pass after the beta-recovery changes.
- The current Expo SDK 54 client supports the reliable **Copy link → open Curio → paste** flow.
- Direct incoming Share-to-Curio is not enabled in the current SDK 54 build. The route, payload parser, and retry experience are preparation, not a shipped capability.

## One journey to validate

```text
Receive invite
  -> open passwordless email link on the same phone
  -> copy a public Instagram, TikTok, or web link
  -> paste once into Curio
  -> keep Curio open while processing finishes
  -> read the exact named lessons or recommendations
  -> open the original source
  -> return later and search by a remembered idea
```

Any failure in this sequence is more important than a new feature.

## Physical-device checklist

### Authentication

- [ ] Fresh install shows the private-beta sign-in screen.
- [ ] An invited email receives a link without revealing whether an uninvited account exists.
- [ ] The link returns to Curio and creates a durable session.
- [ ] Reopening the app preserves the session.
- [ ] Signing out removes access to the previous library.
- [ ] A second invited account cannot see the first account's sources, resources, search results, context, engagement, or For You state.

### Capture and recovery

- [ ] A valid public HTTPS link is accepted from the phone clipboard.
- [ ] The layout remains usable with the keyboard open and on a small phone.
- [ ] The processing message remains accurate when a request takes longer than a few seconds.
- [ ] A failed request leaves the link in place and succeeds when Save is tapped again.
- [ ] Repeating the same URL does not create a duplicate resource.
- [ ] A restricted link becomes an honest source-only save instead of an invented summary.
- [ ] Losing connectivity produces a recoverable message rather than an indefinite spinner.

### Result quality

- [ ] Named lists preserve every explicit item available in the evidence.
- [ ] Ordered workflows preserve sequence.
- [ ] Investment resources retain each named company or ticker and why it was mentioned.
- [ ] Travel resources retain the exact tips rather than replacing them with generic advice.
- [ ] Creator statements and Curio-added research are visibly distinct.
- [ ] Material corrections are clear; routine verification does not overwhelm the page.
- [ ] Related saves merge only when the topic overlap is genuinely specific.
- [ ] Contradictory saves remain visible as contested evidence.

### Retrieval and use

- [ ] The exact original permalink opens from the first attempt.
- [ ] Library search works from a remembered idea rather than exact title text.
- [ ] The strongest matching resource appears before loosely related material.
- [ ] For You only claims a theme when at least two sources support the connection.
- [ ] Generic or empty synthesis modules remain hidden.

## Representative content matrix

Use the companion `BETA_CONTENT_SCORECARD.csv` for at least 24 cases:

| Domain | Required shapes |
| --- | --- |
| Travel | named tips, logistics/rules, place or food list |
| Finance | glossary, HSA/high-stakes explainer, investment watchlist, dated correction |
| AI / work | ordered how-to, tools list, current opportunity |
| Food / products | recipe or steps, recommendation list, comparison |
| Career / general | advice, workflow, opinion/story |
| Reliability | restricted source, duplicate URL, related save, contradictory save, small media |

For each source, compare Curio with the entire accessible source—not only its caption.

## Scoring rules

- **Named-point completeness:** captured explicit named points ÷ explicit named points available in evidence
- **Unsupported additions:** count any statement presented as source-derived that the evidence did not contain
- **Research value:** `0` none, `1` repetitive, `2` useful context, `3` material validation or correction
- **Merge outcome:** `created`, `enriched`, `supporting`, `updated`, `conflict`, or `incorrect`
- **Usefulness:** `1` unusable through `5` immediately useful

### Private-beta exit criteria

- Authentication and account isolation: no unresolved failures
- Exact-source opening: 100% for supported stored permalinks
- Unsupported source-derived claims: zero
- Named-point completeness: at least 90% across sources with usable evidence
- Capture completion: at least 90% across supported public sources, with honest source-only handling counted separately
- Correct merge decision: at least 90% on related, duplicate, and contradictory cases
- Retrieval: the intended resource appears in the first three results for at least 80% of prepared remembered-idea queries
- Median usefulness: at least 4 out of 5 from founder review before external invitations

These are beta thresholds, not public performance claims.

## External beta loop

Start with three to five invited users for two weeks. Ask them to save naturally rather than follow a scripted content list. Review aggregate product failures without reading private source content unless a tester explicitly shares it for debugging.

Track:

- successful saves and honest source-only saves;
- time from paste to readable result;
- retry and failure rate by platform;
- first-pass usefulness feedback;
- incorrect merges or missed related saves;
- search success and resource revisits;
- the source types users expected Curio to handle but it could not access.

Do not claim retention, time saved, or user impact until this loop produces real evidence.

## Infrastructure after the evidence pass

Once representative testing confirms the synchronous pipeline is worth scaling:

1. Use signed R2 uploads for media.
2. Move processing into a Cloudflare Queue or Workflow with durable job states.
3. Add idempotent job submission, bounded retries, and a manual retry endpoint.
4. Add per-user rate limits and abuse controls.
5. Add crash/error monitoring without logging private transcripts or access tokens.
6. Add data export, library deletion, account deletion, privacy policy, and support contact.
7. Choose and implement the native incoming-share target, then validate it on physical iOS and Android builds.

Notion and other context connectors remain later work. They should follow observed user demand, not block the private beta.
