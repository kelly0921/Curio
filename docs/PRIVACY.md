# Curio private-beta privacy notice

Last updated: August 28, 2026

Curio turns links and media you choose to save into organized notes, research, and living resources. This notice describes the private beta; it should be reviewed and published at a stable public URL before a store release.

## Data Curio handles

- Your invited email address and Supabase account identifier.
- Links, captions, notes, and media you explicitly submit.
- Transcripts, sampled visible text, source covers, generated notes, research, collections, and personalization results created from those submissions.
- In-app activity needed for features such as For You, follow-through, and retry status.
- Operational metadata such as a random request or job ID, processing state, duration, attempt count, and error category.

Curio does not ask for your Instagram or TikTok password and does not connect to private Saved folders. Public-source retrieval is best effort. Restricted content remains a saved source unless Curio receives evidence it can analyze.

## How data is used

Curio uses submitted content only to preserve the source, extract useful information, validate important claims, merge repeated ideas, power private-library search, and personalize results from context you authorize. It is not sold or used for advertising.

Cloudflare hosts the API, queue, database, and media storage. OpenAI processes source evidence to transcribe, organize, and research it. Supabase provides passwordless authentication. Each provider processes data under its own terms and security controls.

## Retention and controls

Generated library data remains until you delete it. Uploaded media is staged privately for processing and removed after successful processing or a terminal failure; a recoverable failed upload may remain available for its retry. Source covers remain with the related save. Settings lets you export a JSON copy of your data or permanently delete Curio records and stored media. When server-side Supabase administration is configured, deletion also removes the authentication account; otherwise the empty sign-in identity may remain.

## Logging and security

Curio requires an authenticated private-beta session and scopes stored records to that account. Application logs intentionally omit submitted URLs, captions, transcripts, email addresses, and generated content. Logs may include opaque IDs and failure categories needed to operate the beta.

## Important limits

Curio is an independent beta and is not affiliated with Instagram, TikTok, or their parent companies. Research can be incomplete and is not financial, medical, legal, or other professional advice. Do not submit content you are not authorized to process.

Questions or deletion problems can be reported through the [Curio repository](https://github.com/kelly0921/Curio).
