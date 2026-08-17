import type { LearningItem } from "@/lib/domain";

function titleCase(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

export function LearningCardView({ item }: { item: LearningItem }) {
  const card = item.card;
  const sourceName = item.creator || (item.sourceType === "uploaded_media"
    ? "Uploaded media"
    : item.sourceType === "demo_fixture"
      ? "Recorded sample"
      : `${titleCase(item.platform)} source`);

  if (!card) {
    return (
      <article className="learning-card source-only-card">
        <header className="card-source-row">
          <div className="source-avatar">{sourceName.slice(0, 1).toUpperCase()}</div>
          <div>
            <span>Source captured</span>
            <strong>{sourceName}</strong>
          </div>
          <span className={`status-pill status-${item.processingStatus}`}>{titleCase(item.accessLevel)}</span>
        </header>
        <div className="source-only-body">
          <span className="eyebrow">No invented summary</span>
          <h2>The link is here. Its lesson needs evidence.</h2>
          <p>{item.issues[0]?.message ?? "Add source material before generating a Learning Card."}</p>
          <div className="source-only-actions">
            {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">Open original ↗</a> : null}
            <span>Upload a recording or add a caption or transcript to continue.</span>
          </div>
        </div>
        <SourceEvidence item={item} />
      </article>
    );
  }

  return (
    <article className="learning-card">
      <header className="card-source-row">
        <div className="source-avatar">{sourceName.slice(0, 1).toUpperCase()}</div>
        <div>
          <span>{item.sourceType === "demo_fixture" ? "Recorded sample" : "Learned from"}</span>
          <strong>{sourceName}</strong>
        </div>
        <span className={`status-pill status-${item.processingStatus}`}>{titleCase(item.processingStatus)}</span>
      </header>

      <section className="card-hero">
        <div className="card-tags">
          <span>{card.primaryTopic}</span>
          <span>{titleCase(card.contentType)}</span>
          <span>{titleCase(item.intent)}</span>
        </div>
        <h2>{card.title}</h2>
        <p>{card.summary}</p>
        <div className="card-meta-line">
          <span>Added {formatDate(item.createdAt)}</span>
          <span>•</span>
          <span>{item.analysisMode === "live_openai" ? `Live AI · ${item.analysisModel}` : "Recorded demo · no model call"}</span>
        </div>
      </section>

      {card.notes.length ? (
        <section className="source-notes-panel">
          <header><span className="section-label">Notes from the source</span><h3>What was worth capturing</h3></header>
          <div className="source-notes-grid">
            {card.notes.map((note, index) => (
              <article key={`${note.type}-${note.title}-${index}`}>
                <span>{titleCase(note.type)}</span>
                <h4>{note.title}</h4>
                <p>{note.detail}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {item.accessLevel !== "full" ? (
        <section className="access-callout">
          <div className="access-icon">◐</div>
          <div>
            <strong>Partial source access</strong>
            <p>This card uses only the evidence listed below. The app did not claim to inspect missing visual, private, or platform-restricted content.</p>
          </div>
          <span>{titleCase(item.accessLevel)}</span>
        </section>
      ) : null}

      <div className="card-content-grid">
        <section className="takeaway-panel">
          <span className="section-label">Worth remembering</span>
          <ol>
            {card.keyTakeaways.map((takeaway, index) => (
              <li key={takeaway}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <p>{takeaway}</p>
              </li>
            ))}
          </ol>
        </section>
        <div className="card-side-stack">
          <section className="relevance-panel">
            <span className="section-label">Why it might matter to you</span>
            <p>{card.relevanceReason}</p>
            <small>Generated from your configured personal context—not stated by the creator.</small>
          </section>
          <section className="action-panel">
            <span className="section-label">One thing to try</span>
            <p>{card.suggestedAction}</p>
            <button type="button" disabled>Mark as applied <span>↗</span></button>
          </section>
        </div>
      </div>

      {card.researchBrief ? (
        <section className="research-panel">
          <header>
            <span className="section-label">Research and context</span>
            <h3>What holds up</h3>
            <p>{card.researchBrief.overview}</p>
          </header>
          <div className="research-findings">
            {card.researchBrief.findings.map((finding, index) => (
              <article key={`${finding.topic}-${index}`}>
                <span>{titleCase(finding.verdict)}</span>
                <h4>{finding.topic}</h4>
                <p>{finding.explanation}</p>
                {finding.correction ? <aside><strong>Correction / missing context</strong>{finding.correction}</aside> : null}
                {finding.sources.length ? (
                  <footer>
                    {finding.sources.map((source) => (
                      <a href={source.url} key={source.url} rel="noreferrer" target="_blank">{source.publisher} · {source.title} ↗</a>
                    ))}
                  </footer>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      <section className={`verification-panel ${card.claimsToVerify.length ? "has-claims" : "clear"}`}>
        <header>
          <div>
            <span className="section-label">Verification lens</span>
            <h3>{card.claimsToVerify.length ? `${card.claimsToVerify.length} claim${card.claimsToVerify.length === 1 ? "" : "s"} to check` : "No verification flags"}</h3>
          </div>
          <span className="verification-mark">{card.claimsToVerify.length ? "!" : "✓"}</span>
        </header>
        {card.claimsToVerify.map((claim) => (
          <div className="claim-row" key={`${claim.category}-${claim.claim}`}>
            <span>{titleCase(claim.category)}</span>
            <p><strong>{claim.claim}</strong>{claim.reasonToVerify}</p>
          </div>
        ))}
        {!card.claimsToVerify.length ? <p className="clear-copy">Nothing in the available source crossed the V0.1 verification threshold. This is not a guarantee that every claim is true.</p> : null}
      </section>

      <SourceEvidence item={item} />
    </article>
  );
}

function SourceEvidence({ item }: { item: LearningItem }) {
  return (
    <details className="source-evidence" open>
      <summary>
        <div>
          <span className="section-label">AI input receipt</span>
          <strong>Exactly what the analysis could access</strong>
        </div>
        <span>{item.sourceMaterials.length} source channel{item.sourceMaterials.length === 1 ? "" : "s"}</span>
      </summary>
      <div className="evidence-body">
        {item.sourceMaterials.length ? item.sourceMaterials.map((material, index) => (
          <section key={`${material.kind}-${index}`}>
            <header>
              <div>
                <span>{titleCase(material.kind)}</span>
                <strong>{material.label}</strong>
              </div>
              <small>{titleCase(material.origin)} · {titleCase(material.completeness)}</small>
            </header>
            <p>{material.text}</p>
          </section>
        )) : <p className="no-evidence">No caption, transcript, or visible text was available. The URL itself was not summarized.</p>}
        <footer>
          <span>Access: <strong>{titleCase(item.accessLevel)}</strong></span>
          {item.sourceUrl ? <a href={item.sourceUrl} target="_blank" rel="noreferrer">Open original ↗</a> : <span>{item.uploadedMediaReference ?? "No durable media reference"}</span>}
        </footer>
      </div>
    </details>
  );
}
