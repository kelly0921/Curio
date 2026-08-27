# Curio Project Portfolio Intake

Updated: August 27, 2026

Use this file as the source handoff for the Curio entry in Kelly's portfolio. It separates what is working in the invite-only beta from the longer-term product vision, and it avoids implying that Curio has an official Instagram Saved integration or a public App Store release.

## 1. Project Name

**Curio**

Public descriptor: **Turn saved content into knowledge you can use**

## 2. One-Line Summary

Curio is a mobile-first AI knowledge app that turns useful social videos and links into clear, researched, searchable resources instead of leaving them buried in saved folders.

## 3. Problem

People save educational content on Instagram, TikTok, and the web about finance, travel, AI, food, products, career opportunities, and everyday ideas. Saving is easy, but using what was saved is not.

Posts accumulate as isolated links in platform folders. They become repetitive, difficult to search by remembered idea, disconnected from related saves, and easy to forget. Even when a person returns to a post, they still have to rewatch it, identify the useful points, decide whether the claims are accurate, and work out what to do with the information.

Saving creates an archive. It does not create learning.

Curio turns each source into an input to a growing personal knowledge system. It extracts what the source actually says, preserves provenance, researches important claims, merges overlapping ideas, and resurfaces the result in a form that is easier to understand, retrieve, and use.

## 4. Target Users

- People who save learning-oriented Reels, TikToks, videos, and articles but rarely revisit them
- Curious generalists whose interests span multiple domains rather than one narrow subject
- Mobile-first users who want capture to take one action, without manually naming, tagging, or filing every save
- People who want concise answers first and optional depth when a topic deserves more research
- Early adopters who want their saved content to become a personalized reference system rather than another content feed

## 5. My Role

I served as the **founder, product designer, and founding engineer**.

I:

- identified the product opportunity from my own habit of saving useful social content and losing it in platform folders;
- defined the product thesis around zero-input capture, synthesis over accumulation, progressive depth, and provenance;
- designed the mobile information hierarchy, resource-first Library, capture flow, learning-resource view, and cross-save For You experience;
- shaped adaptive content structures for lists, travel tips, explainers, investment watchlists, recommendations, and how-to content;
- directed the architecture across Expo, the processing API, OpenAI extraction and research, Cloudflare persistence, and Supabase authentication;
- iterated on public-Reel retrieval, source viewing, deduplication, visual covers, search, personalization, and private-beta access;
- used Codex as a product and engineering collaborator to implement, test, debug, and document the system across bounded iterations;
- retained responsibility for the product direction, UX decisions, architecture, privacy boundaries, and final claims.

## 6. Core Features

### Minimal-input capture

- Accepts a pasted public link through a single primary field.
- Supports shared URLs and supported audio/video files in the Expo client.
- Infers likely save intent—such as understand, try, visit, buy, track, compare, or reference—without requiring the user to categorize the source.
- Preserves a source-only save when evidence cannot be retrieved instead of inventing a summary.

### Multi-channel source extraction

- Uses available captions, speech transcripts, public source metadata, visible Reel text, and representative frames.
- Applies a best-effort retrieval chain for public sources while keeping a receipt of what was actually analyzed.
- Preserves named items and content shape: lists remain lists, how-tos retain order, investment content keeps the named companies and rationale, and travel content keeps the exact tips.
- Keeps the exact original permalink available from every resource.

### Researched learning resources

- Turns source evidence into concise notes that lead with the actual lesson rather than generic AI framing.
- Uses cited web research to explain, validate, contextualize, or materially correct important claims.
- Applies deeper validation to consequential or time-sensitive areas such as finance and health, while keeping simple or subjective saves visually quiet.
- Separates what the creator said from what Curio added through research.
- Offers progressive depth and saved one-tap deep dives when the user wants to learn more.

### Living knowledge library

- Organizes related saves into living guides, glossaries, playbooks, and watchlists rather than creating one permanent card per source.
- Merges repeated ideas, records additional supporting evidence, and retains source-level provenance.
- Uses broad, stable domains alongside specific concepts and entities.
- Adds normalized source covers so the Library feels visual and consistent rather than text-card driven.

### Retrieval and cross-save synthesis

- Searches titles, entries, entities, research, transcripts, and visible source text by remembered meaning.
- Returns a concise answer from the strongest matching resource with supporting sources.
- Builds a For You view from evidence-backed patterns across multiple saves instead of repeating per-card summaries.
- Surfaces supported themes, a durable point to remember, meaningful resource changes, repeated evidence, and important unresolved claims.
- Uses engagement signals and inferred intent to rank what is worth revisiting without turning the experience into a quiz or practice app.

### Private-beta foundations

- Uses passwordless Supabase authentication with public sign-ups disabled.
- Isolates each invited user's library, resources, context, engagement, and For You state by verified user ID.
- Stores the deployed beta's canonical data durably in Cloudflare D1.
- Keeps OpenAI and infrastructure credentials on the server; no secret key is bundled into the Expo client.

## 7. Technical Details

### Stack

**Mobile application**

- TypeScript
- Expo SDK 54 and Expo Router
- React Native 0.81 and React 19
- React Native Web for static browser previews
- Expo Secure Store for mobile sessions
- Expo Linking, Sharing, Web Browser, Image, and EAS build profiles
- Supabase JavaScript client for passwordless authentication

**Processing and API**

- Next.js 16 App Router and TypeScript
- OpenAI Responses API for structured analysis, retrieval, research, and answer generation
- OpenAI speech transcription with `gpt-4o-mini-transcribe`
- `gpt-5.4-mini` as the configured analysis and retrieval model
- Zod for versioned runtime validation

**Infrastructure and data**

- Cloudflare Workers through the OpenNext adapter
- Cloudflare D1 for durable, user-scoped library data
- Cloudflare R2 for source media and cover assets
- Cloudflare Browser Rendering for bounded public-source inspection
- Wrangler for bindings, migrations, local preview, and deployment
- Supabase Auth for passwordless private-beta identity
- Cloudflare observability for Worker logs and traces

**Quality**

- Vitest for the processing service
- Node's test runner for mobile-domain behavior
- ESLint and TypeScript type checking
- Expo static web export
- 124 automated tests currently passing: 101 processor tests and 23 mobile tests, verified August 27, 2026

### Application architecture

```text
Instagram, TikTok, or web source
  -> share or paste into the Expo app
  -> authenticated Next.js processing API on Cloudflare Workers
  -> validate and fingerprint the source
  -> retrieve available public evidence
  -> transcribe speech and inspect visible source content
  -> generate a structured learning card
  -> research consequential claims with cited sources
  -> match, create, or update a living resource
  -> persist user-scoped data in D1 and media/covers in R2
  -> return the resource, provenance, search index, and For You signals
```

### Product data model

- **Source:** the original URL, upload, transcript, caption, visible text, and provenance receipt
- **Learning card:** the source-specific extraction and researched interpretation
- **Living resource:** the canonical guide, glossary, playbook, or watchlist that can accumulate support from multiple sources
- **Resource entry:** one useful point with its own source support and research state
- **Synthesis:** an evidence-gated cross-save theme, repeated point, change, unresolved claim, or intent-matched resurfacing
- **Context:** connector-shaped, domain-scoped signals kept separate from source evidence and used only when the relevance is specific

### Important trust boundaries

- Curio does not claim to analyze information it could not retrieve.
- A restricted link remains saved as `link_only` until usable evidence is available.
- Creator claims, Curio research, and personal context remain separate in the prompt and interface.
- High-consequence research is dated and can become due for refresh.
- The exact source remains attached even after multiple saves are merged into one resource.

## 8. Product Thinking

### Zero input is the default

Curio is designed around the behavior that already exists: a person sees something useful and taps Share or pastes the link. Requiring a title, folder, tags, or a written explanation at capture time would recreate the organizational work the product is meant to remove.

### Synthesis is more valuable than another saved-items library

The key product decision was to treat a saved post as an input source, not the final unit of organization. Ten HSA Reels should strengthen one HSA guide; five Japan Reels should become one organized travel playbook. Repetition should increase confidence or disappear, not consume more screen space.

### Concise first, depth on demand

Early versions became either too generic or too compressed. Curio now leads with one dominant answer and the actual named tips, terms, steps, or recommendations. Research, caveats, provenance, and deeper explanations remain available without overwhelming the first read.

### Research should earn its space

Showing verification language on every simple definition made straightforward content feel heavier than the source. Curio now researches by consequence and freshness. Material corrections and high-stakes caveats are prominent; routine validation stays in a quieter evidence layer.

### Personalization should be specific

Generic "this may be useful" copy does not justify screen space. For You is built around cross-save patterns and observable changes. Future connected context should improve ranking and next steps, but it should never be presented as real unless the user actually authorized the connection.

### Mobile first, platform independent

Discovery happens in Instagram and TikTok, so capture belongs on the phone. The knowledge should not remain trapped there. Curio keeps the original platforms as discovery surfaces while building a searchable, portable knowledge layer above them.

### Notion is a connector, not the product

Notion may become a useful source of personalized context or an export destination, but asking users to maintain Curio's intelligence manually in Notion would conflict with the zero-input thesis. The primary learning, synthesis, and resurfacing experience belongs inside Curio.

## 9. Current Status

**Working invite-only private beta; deployed processor and production-shaped mobile client; not yet a public consumer release.**

The processing service is deployed at [curio-processor.kellychenmeiyi.workers.dev](https://curio-processor.kellychenmeiyi.workers.dev). It uses Cloudflare D1 persistence and Supabase passwordless authentication. Public sign-ups are disabled, unauthenticated requests and the retired shared beta token are rejected, and invited users are isolated by verified user ID.

The current product includes link and media capture, best-effort public-Reel processing, structured learning cards, cited research, living resources, exact-source provenance, resource search, visual covers, progressive deep dives, intent-aware follow-through, and cross-save For You synthesis.

The processor URL is an API endpoint, not a public product demo. The portfolio should use the product screenshots until a stable web demo, TestFlight build, or store release is available.

Important constraints remain:

- Curio does not synchronize private Instagram Saved folders because the supported platform API does not expose that capture surface.
- Public-Reel acquisition is best effort and depends on public availability and fragile third-party page behavior; restricted content may remain source-only unless the user shares media or context.
- EAS profiles exist, but native share-target behavior still needs release-by-release validation on physical iOS and Android devices.
- Long media processing is still synchronous; production scale needs signed uploads, queued jobs, retries, idempotency, and rate limits.
- A public launch still needs privacy policy, export and deletion flows, crash reporting, final store metadata, and external-user validation.
- Notion sync and other real context connectors are future work. Mock context must remain clearly labeled and should not appear in portfolio screenshots as a live integration.

## 10. What I Learned

The central lesson was that summarization is not enough. Users do not need a shorter version of every Reel; they need the useful ideas preserved in their natural structure, checked when the stakes justify it, and combined with what they have already saved.

The hardest product decisions were about information hierarchy. Too much verification language made simple content feel clinical, while overly compressed notes removed the details that made a source worth saving. The stronger pattern was concise-first, progressive-depth: show the answer and exact items immediately, then reveal research, provenance, and deeper explanation when requested.

The broader lessons were:

- The durable product unit should be a concept or resource, not a source URL.
- A low-friction capture experience shifts complexity into extraction, intent inference, and organization.
- AI output becomes more useful when it preserves content shape instead of forcing every source into one generic summary template.
- Research depth should follow consequence and freshness, not be applied uniformly.
- Provenance is essential when source extraction, external research, and personal context are combined.
- Cross-save synthesis has to be evidence-gated; a shared broad category is not automatically a meaningful pattern.
- Platform access is a product constraint as much as an engineering constraint, so the UI needs honest source-only states and robust fallbacks.
- Personalized knowledge should remain portable; connections such as Notion are useful inputs and outputs, not mandatory organizational labor.

## 11. Portfolio-Friendly Case Study

### Overview

Curio is a mobile-first AI knowledge app for people who save useful social content but rarely turn it into something they can retrieve or use. It transforms public videos and links into concise notes, researched explanations, and evolving topic resources with the original evidence attached.

### Problem

Instagram and TikTok make saving effortless but learning from saved content difficult. Useful tips, opportunities, explainers, and recommendations accumulate as disconnected posts. They are repetitive, hard to search by idea, and rarely revisited. The user still has to rewatch each source, assess its claims, and manually connect it to everything else they know.

### Approach

I designed Curio around one low-effort action: share or paste. The system inspects the available speech, captions, visible text, frames, and source metadata; preserves the exact named tips or ideas; researches material claims; and matches the result to a living guide, glossary, playbook, or watchlist.

The original source stays attached as provenance, but it does not dictate the organization. Repeated saves add support rather than duplicate cards. Search works from remembered meaning, and For You highlights evidence-backed patterns and changes across saves rather than creating another recommendation feed.

### My Role

As founder, product designer, and founding engineer, I defined the problem, zero-input product thesis, mobile UX, content hierarchy, trust boundaries, system architecture, and private-beta rollout. I used Codex to accelerate implementation and testing while retaining responsibility for product decisions, architecture, privacy, and final claims.

### Technical Highlights

- Expo and React Native mobile client with one-field capture, deep linking, secure sessions, sharing support, and static web preview
- OpenAI-powered speech transcription, structured extraction, cited research, and retrieval behind a server-only API
- Adaptive learning formats that preserve lists, ordered steps, named recommendations, investment rationales, and travel tips
- Living-resource merge engine with source-level provenance, repeated-evidence handling, freshness policies, and concise change receipts
- Meaning-oriented retrieval across resources, entries, research, transcripts, entities, and visible source text
- Evidence-gated For You synthesis using themes, repeated support, material changes, unresolved claims, and engagement signals
- Cloudflare Workers, D1, R2, Browser Rendering, and observability with Supabase passwordless user identity
- 124 passing automated tests across processor and mobile behavior

### Current Status

Curio is a working invite-only private beta. Its protected processor is deployed, durable user-scoped persistence is active, and the mobile product has production-shaped development, preview, and release profiles. It is not yet a public App Store product, and public social-source acquisition remains best effort rather than an official Saved-folder integration.

### What I Learned

The real opportunity was not better summarization; it was converting an unstructured stream of saved sources into living personal knowledge. The best experience makes capture almost invisible, preserves the details the user cared about, and lets trust and depth expand only when they are useful.

## 12. Short Card Copy

**Title:** Curio

**Description:** A mobile-first AI app that turns saved social videos and links into clear, researched, searchable knowledge instead of forgotten folders.

**Alternative description:** Curio extracts what matters from saved content, validates important claims, and merges related ideas into living personal resources.

**Tags:**

- Consumer AI
- Mobile Product
- Expo / React Native
- OpenAI
- Cloudflare

**Best CTA label:** `View Case Study`

Optional secondary CTA: `View GitHub`

Repository: [github.com/kelly0921/Curio](https://github.com/kelly0921/Curio)

Do not use the protected processor URL as a `Live Demo` CTA; it is an API, not the consumer interface.

## 13. Visual Assets

All current screenshots use synthetic demo content at a 390 × 844 mobile viewport. They do not expose production library data or credentials.

### Recommended portfolio visuals

1. **Project thumbnail and Library overview:** `assets/curio-library-mobile.png`  
   Caption: “A resource-first library that organizes related saves into visual, searchable knowledge.”  
   Alt text: “Curio mobile Library showing organized learning resources and topic collections.”

2. **Zero-input capture:** `assets/curio-capture-mobile.png`  
   Caption: “Share or paste a link; Curio handles extraction and organization after capture.”  
   Alt text: “Curio mobile capture screen with one primary field for a social video or web link.”

3. **Synthesized learning resource:** `assets/curio-resource-mobile.png`  
   Caption: “A concise learning resource with practical detail, optional depth, and attached source evidence.”  
   Alt text: “Curio mobile resource page showing a synthesized lesson and deeper researched context.”

4. **Cross-save For You:** `assets/curio-for-you-mobile.png`  
   Caption: “For You resurfaces evidence-backed themes and useful changes across multiple saves.”  
   Alt text: “Curio mobile For You screen showing personalized cross-save knowledge recommendations.”

### Preferred display format

- Project card: use the Library screenshot in a clean mobile-device crop on Curio's warm cream background
- Case-study hero: pair Library and Learning Resource screens to show organization and depth
- Product flow: Capture → Resource → For You
- Full case study: show all four screenshots with the captions above

### Asset gaps

- Copy the selected images into the portfolio repository so the public site does not depend on Curio-local paths.
- Create a short screen-recorded demo of paste/share, processing, resource creation, search, and For You.
- Capture final native screenshots after device testing and before a public launch.
- Create final App Store iconography and store-ready product art if Curio moves beyond private beta.

## 14. Missing Information

The following items are still missing or intentionally unverified:

- A stable public consumer demo, TestFlight link, or App Store / Play Store release
- End-to-end native share-target validation across current physical iOS and Android releases
- External-user usability findings, retention data, testimonials, or quantified time saved
- A supported private Instagram Saved-folder integration; none should be implied
- A platform-compliant, production-reliable full-video acquisition strategy across Instagram and TikTok
- Queued background media processing, signed upload flow, production retry policy, idempotency, and rate limiting
- Privacy policy, terms, account export, account deletion, crash reporting, and public-launch support workflows
- A real Notion or other context connector; the current connector-shaped demo context is not a live integration
- Final confirmation that the latest private-beta branch has been merged into the repository's public default branch before using GitHub as a portfolio CTA
- A public demo video and final decision about whether the portfolio CTA should prioritize the case study, source repository, or beta waitlist

These gaps do not prevent publishing an accurately scoped private-beta case study. They should remain visible and should not be converted into claims of an official social-platform integration, broad production readiness, or measured user impact.
