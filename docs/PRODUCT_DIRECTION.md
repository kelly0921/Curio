# Curio product direction

Last updated: August 19, 2026

## The problem

People save useful Instagram, TikTok, and web content about tips, opportunities, lessons, products, places, and ideas. Those saves accumulate as isolated posts in platform folders. They are difficult to search by remembered idea, repetitive, rarely revisited, and disconnected from what the person already knows.

Saving creates a source archive. It does not create learning.

## Product thesis

Curio turns casually saved content into a deduplicated, researched, searchable body of personal knowledge.

- A Reel, post, link, or recording is an input source.
- A living guide, shortlist, glossary, watchlist, playbook, or concept page is the product.
- The original source remains attached as provenance, but it does not control the organization.
- Users should only need to share or paste. Curio should infer intent, extract, organize, merge, research, and resurface automatically.

One source should not always create one permanent card. Each new source should create a resource, add a genuinely new insight, support an existing point, or correct/update existing knowledge.

## Desired user journey

1. The user saves or shares something useful with no required explanation.
2. Curio analyzes speech, on-screen text, captions, and available source metadata.
3. Curio identifies concepts, named recommendations, claims, entities, and the likely save intent.
4. Curio finds related knowledge already in the library.
5. Repetition is removed and only useful new information is added.
6. Important or time-sensitive claims are researched and dated.
7. The appropriate living resource is created or updated.
8. Curio explains the result briefly, for example: “Added two Japan tips; one was already covered; one rail rule was updated.”

## Product principles

1. **Zero-input by default.** Optional context can improve a result, but must not be required.
2. **Synthesis over accumulation.** The knowledge library should grow in usefulness, not merely in item count.
3. **One dominant answer.** Every screen should quickly answer what the user likely wanted from the source.
4. **Source facts and Curio additions stay distinct.** Research and personalization must never be presented as if the creator said them.
5. **Research by consequence.** Finance, health, legal, investment, price, rule, and current-event claims receive deeper validation. Subjective recommendations and simple definitions stay lighter.
6. **Personalization must earn its space.** Hide generic relevance and forced actions. Show them only when the connection is specific and useful.
7. **Trust details are available, not dominant.** Sources, transcripts, confidence, and receipts stay accessible in a collapsed layer.
8. **Search by remembered meaning.** Users should not need to remember the creator, exact wording, or original video.

## Adaptive resource types

| Resource type | Primary presentation |
| --- | --- |
| Glossary or definition | Term and plain-English definition |
| Travel guide | Exact tips grouped by transport, payments, places, food, packing, and timing |
| Investment watchlist | Company/ticker, creator thesis, supporting evidence, risks, and verification date |
| How-to or tool | Prerequisites, ordered steps, expected result, cost, and limitations |
| Product recommendation | What it is, why it was recommended, use case, price, and alternatives |
| Place or food list | Location, what to order/do, why, and current logistics |
| News or opportunity | What changed, when, why it matters, and what may expire |
| Opinion or story | Thesis, reasoning, and perspective with minimal verification UI |
| High-stakes explainer | Explanation, material corrections, caveats, freshness date, and sources |

## Information hierarchy

Every resource should use the minimum useful depth:

1. Title and a one-sentence answer.
2. The actual items, steps, terms, recommendations, or ideas from the source.
3. A short “Curio added” note only when research changes or materially improves understanding.
4. Personal relevance or a next action only when it is specific.
5. Collapsed sources and evidence.

## Improvements needed

### 1. Replace source-per-card organization with living resources

Create a canonical knowledge layer above saved sources. Model topics, entities, claims, recommendations, relationships, and source support. Preserve the source archive as a secondary view.

### 2. Infer save intent automatically

Classify each save as primarily: understand, try, visit, buy, track, compare, or reference. Combine that intent with content shape and domain to select the resource structure without asking the user.

### 3. Deduplicate and merge at the idea level

Detect semantic overlap, not only duplicate URLs. A new source should be able to add, support, contradict, update, or be ignored as repetition. Show a concise change receipt after processing.

### 4. Make extraction consistently content-aware

Lists must preserve every named item. How-tos must preserve order. Investment content must retain the companies and the reason each was mentioned. Travel content must retain the exact tips. Reprocess legacy cards whose domain or presentation type is still generic.

### 5. Make research selective and freshness-aware

Validate consequential claims, clearly show material corrections, and store when research was performed. Avoid adding verification language to every simple or subjective save.

### 6. Replace free-text collections with a stable knowledge taxonomy

Use controlled broad collections such as Finance, Travel, AI, Food, Career, Health, and Home. Preserve specific entities and concepts as tags and allow automatic smart clusters such as “Japan trip,” “HSA,” or “optical transceivers.”

### 7. Add semantic retrieval

Index takeaways, transcripts, claims, entities, research, and living resources. Search should answer questions such as “What did I save about investing an HSA?” and return a synthesized answer with supporting sources.

### 8. Evolve For You into synthesis

The primary personalized experience should identify cross-save patterns rather than repeat per-card personalization. It should surface weekly themes, one concept worth remembering, one resource that changed, one repeated recommendation, and one important unresolved claim.

### 9. Improve visual recognition

Use an extracted cover frame or source thumbnail where available instead of generic platform glyph tiles. Keep the mobile grid calm and visual, with knowledge type and status as secondary metadata.

### 10. Improve ingestion reliability without weakening provenance

Continue the automatic fallback chain for public links and shared media. When Curio cannot access evidence, keep the source-only state rather than guessing. Full-content acquisition remains a key reliability constraint.

## Recommended build order

1. Canonical living-resource schema and source-to-resource relationships.
2. Automatic intent classification and adaptive resource templates.
3. Semantic deduplication, merge decisions, and change receipts.
4. Stable domains/entities plus reprocessing of existing cards.
5. Risk- and freshness-aware research policy.
6. Semantic search and related-resource retrieval.
7. Cross-save weekly synthesis in For You.
8. Source thumbnails and final visual polish.

## Implementation checkpoint — August 19, 2026

The first Living Resources slice is implemented:

- Durable guides, glossaries, playbooks, and watchlists are stored separately from source cards.
- Existing processed cards are backfilled into resources without deleting or rewriting source evidence.
- New processed sources create or update a resource and retain provenance at the individual entry level.
- Repeated entries become supporting evidence rather than duplicate notes.
- The mobile Library is resource-first, with broad domain collections and search across entries and entities.
- Original saves remain available in a secondary source archive and from each resource's provenance section.
- Processing now opens the living resource when one was created or updated.
- Natural-language retrieval searches resources, research, transcripts, and visible Reel text, then returns one concise answer from the strongest matching resource.
- Research freshness is consequence-aware: watchlists and tracked resources expire fastest, finance and health resources use shorter review windows, and evergreen or subjective knowledge stays visually quiet.
- A due resource can rerun source-grounded web research and receives a concise receipt that highlights corrections, added context, unresolved points, or no material change.
- For You now synthesizes the week across saves instead of repeating per-card relevance: it shows supported themes, one durable point to remember, actual resource changes, repeated evidence, and important unresolved claims.
- Synthesis modules are evidence-gated. Themes require at least two sources, repeated points require multi-source provenance, and change cards exclude brand-new resources.
- Sparse libraries fall back to a few existing recommendations, while empty synthesis categories stay hidden rather than filling the screen with generic status text.
- Demo context may influence ranking but is not presented as a real connected workspace; visible context claims are reserved for an actual connection.

The initial merge, retrieval, and weekly synthesis engines deliberately use high-confidence deterministic matching. Semantic embeddings, narrower concept-level theme clustering, automatic intent classification, scheduled background refreshes, and AI-written cross-source explanations remain later phases.

## North-star behavior

Ten similar HSA Reels should produce one evolving HSA guide, not ten summaries. Five Japan Reels should become one organized Japan playbook. Multiple investment Reels should update a dated watchlist with agreements, disagreements, and risks.

The north-star experience is:

> “This week you saved eight things. Three strengthened your HSA guide, two added Japan travel advice, and one investment claim conflicted with an earlier source.”

Curio succeeds when a saved folder stops being a graveyard and becomes knowledge the user can understand, trust, retrieve, and use.
