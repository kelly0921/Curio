"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LearningItem, ProcessingStatus } from "@/lib/domain";
import { LearningCardView } from "./learning-card";

interface ApiError { code: string; message: string }
interface ItemsResponse { ok: true; data: { items: LearningItem[] } }
interface ItemResponse { ok: true; data: { item: LearningItem; duplicate: boolean } }

const progressCopy: Partial<Record<ProcessingStatus, { label: string; detail: string }>> = {
  received: { label: "Saving", detail: "Adding it to your inbox" },
  retrieving_source: { label: "Reading", detail: "Checking the available source" },
  transcribing: { label: "Listening", detail: "Turning speech into text" },
  analyzing: { label: "Organizing", detail: "Finding the useful lesson" },
};

function groupKey(item: LearningItem): string {
  if (item.card?.primaryTopic) return item.card.primaryTopic.trim().toLocaleLowerCase();
  return item.processingStatus === "failed" || item.processingStatus === "unsupported"
    ? "Needs attention"
    : "Needs source";
}

function displayLabel(value: string): string {
  return value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function itemTitle(item: LearningItem): string {
  if (item.card?.title) return item.card.title;
  if (item.creator) return item.creator;
  if (item.sourceType === "uploaded_media") return "Uploaded media";
  if (item.sourceType === "demo_fixture") return "A better way to make your work visible";
  try {
    return item.sourceUrl ? new URL(item.sourceUrl).hostname.replace(/^www\./, "") : "Saved link";
  } catch {
    return "Saved link";
  }
}

function tileIcon(item: LearningItem): string {
  if (item.platform === "instagram") return "◎";
  if (item.platform === "youtube") return "▶";
  if (item.platform === "tiktok") return "♪";
  if (item.platform === "local") return "↑";
  if (item.platform === "demo") return "✦";
  return "↗";
}

export function LearningInbox() {
  const [items, setItems] = useState<LearningItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [captureMode, setCaptureMode] = useState<"url" | "upload">("url");
  const [captureOpen, setCaptureOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [sourceUrl, setSourceUrl] = useState("");
  const [query, setQuery] = useState("");
  const [collectionFilter, setCollectionFilter] = useState("all");
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState<ProcessingStatus | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const collections = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) counts.set(groupKey(item), (counts.get(groupKey(item)) ?? 0) + 1);
    return [...counts.entries()]
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  }, [items]);
  const filteredItems = useMemo(() => {
    const collectionItems = collectionFilter === "all" ? items : items.filter((item) => groupKey(item) === collectionFilter);
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return collectionItems;
    return collectionItems.filter((item) => [itemTitle(item), item.creator, item.platform, groupKey(item)]
      .filter(Boolean)
      .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)));
  }, [collectionFilter, items, query]);
  const selected = useMemo(
    () => filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? null,
    [filteredItems, selectedId],
  );
  const processedCount = items.filter((item) => Boolean(item.card)).length;

  useEffect(() => {
    void fetch("/api/items", { cache: "no-store" }).then(async (response) => {
      const body = await response.json() as ItemsResponse | { ok: false; error: ApiError };
      if (body.ok) {
        setItems(body.data.items);
        setSelectedId(body.data.items[0]?.id ?? null);
      }
    }).catch(() => setError({ code: "APP_UNAVAILABLE", message: "Curio could not reach its local services." }));
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  function startProgress(kind: "url" | "upload" | "demo") {
    const stages: ProcessingStatus[] = kind === "upload"
      ? ["received", "retrieving_source", "transcribing", "analyzing"]
      : ["received", "retrieving_source", "analyzing"];
    let index = 0;
    setProgress(stages[0] ?? "received");
    timerRef.current = setInterval(() => {
      index = Math.min(index + 1, stages.length - 1);
      setProgress(stages[index] ?? "analyzing");
    }, 1_250);
  }

  function stopProgress() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setProgress(null);
  }

  async function send(formData: FormData, kind: "url" | "upload" | "demo"): Promise<LearningItem | null> {
    setSubmitting(true);
    setError(null);
    setNotice(null);
    startProgress(kind);
    try {
      const response = await fetch("/api/items", { method: "POST", body: formData });
      const body = await response.json() as ItemResponse | { ok: false; error: ApiError };
      if (!body.ok) {
        setError(body.error);
        return null;
      }
      const item = body.data.item;
      setItems((current) => [item, ...current.filter((currentItem) => currentItem.id !== item.id)]);
      setCollectionFilter("all");
      setSelectedId(item.id);
      setNotice(body.data.duplicate
        ? "Already saved — we opened the existing item."
        : item.card
          ? "Saved and organized automatically."
          : "Saved. Add context only if you want Curio to process this restricted link now.");
      return item;
    } catch {
      setError({ code: "NETWORK_ERROR", message: "The save did not finish. Try again." });
      return null;
    } finally {
      stopProgress();
      setSubmitting(false);
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    formData.set("sourceType", captureMode === "upload" ? "uploaded_media" : "external_url");
    const item = await send(formData, captureMode);
    if (item) setCaptureOpen(false);
    if (item?.card) {
      form.reset();
      setSourceUrl("");
    }
  }

  async function trySample() {
    const formData = new FormData();
    formData.set("sourceType", "demo_fixture");
    formData.set("intent", "remember");
    await send(formData, "demo");
  }

  function chooseCollection(key: string) {
    setCollectionFilter(key);
    const next = key === "all" ? items[0] : items.find((item) => groupKey(item) === key);
    setSelectedId(next?.id ?? null);
  }

  function enrichSelected() {
    if (!selected?.sourceUrl) return;
    setDetailOpen(false);
    setCaptureMode("url");
    setSourceUrl(selected.sourceUrl);
    openCapture();
  }

  function openCapture() {
    setCaptureOpen(true);
    window.setTimeout(() => document.querySelector("#quick-save")?.scrollIntoView({ behavior: "smooth", block: "center" }), 30);
  }

  return (
    <main className="curio-shell">
      <header className="topbar">
        <a className="brand-lockup" href="#top" aria-label="Curio home">
          <span className="brand-glyph"><i /><i /><i /></span>
          <span><strong>Curio</strong><small>A home for everything interesting.</small></span>
        </a>
        <nav aria-label="Primary navigation">
          <a className="active" href="#saved">Saved <span>{items.length}</span></a>
          <a href="#collections">Collections <span>{collections.length}</span></a>
        </nav>
        <button className="topbar-save" onClick={openCapture} type="button"><span>＋</span><b>Add</b></button>
      </header>
      {notice && !captureOpen ? <div className="library-toast" role="status">{notice}</div> : null}

      <section className="save-hero" id="top">
        <div className="save-hero-copy">
          <span className="eyebrow">My Curio</span>
          <h1>Saved</h1>
          <p>Everything interesting, saved in one place and organized as you go.</p>
          <label className="library-search"><span>⌕</span><input aria-label="Search saved items" onChange={(event) => setQuery(event.target.value)} placeholder="Search your saves" type="search" value={query} /></label>
        </div>

        {captureOpen ? <button aria-label="Close save panel" className="capture-backdrop" onClick={() => setCaptureOpen(false)} type="button" /> : null}
        <div className={`quick-save-card ${captureOpen ? "open" : ""}`} id="quick-save">
          <span className="sheet-handle" />
          <div className="capture-mode-row" aria-label="Save method">
            <button className={captureMode === "url" ? "active" : ""} onClick={() => setCaptureMode("url")} type="button">↗ Link</button>
            <button className={captureMode === "upload" ? "active" : ""} onClick={() => setCaptureMode("upload")} type="button">↑ Upload</button>
            <span>Share extension coming next</span>
            <button aria-label="Close save panel" className="sheet-close" onClick={() => setCaptureOpen(false)} type="button">×</button>
          </div>

          <form onSubmit={submit}>
            {captureMode === "url" ? (
              <div className="save-input-row">
                <span>↗</span>
                <label>
                  <b>Paste any useful link</b>
                  <input aria-label="Link to save" name="sourceUrl" onChange={(event) => setSourceUrl(event.target.value)} placeholder="Instagram, YouTube, TikTok, article…" required type="url" value={sourceUrl} />
                </label>
                <button disabled={submitting} type="submit">{submitting ? "Saving…" : "Save"}</button>
              </div>
            ) : (
              <div className="save-input-row upload-input-row">
                <span>↑</span>
                <label>
                  <b>Choose a recording</b>
                  <input accept="audio/*,video/mp4,video/quicktime,video/webm,.m4a,.mov" aria-label="Media to save" name="media" required type="file" />
                </label>
                <button disabled={submitting} type="submit">{submitting ? "Saving…" : "Save"}</button>
              </div>
            )}

            <details className="optional-context">
              <summary>Private link or extra context? <span>Add details</span></summary>
              <div>
                <label className="field-group wide-field"><span>Caption, transcript, or note</span><textarea name="sourceCaption" placeholder="Only needed when the source itself is not accessible." rows={3} /></label>
                <label className="field-group"><span>Creator <i>optional</i></span><input name="creator" placeholder="@handle or name" /></label>
                <label className="field-group"><span>Keep for</span><select defaultValue="remember" name="intent"><option value="remember">Remembering</option><option value="try">Trying</option><option value="verify">Verifying</option><option value="reference">Reference</option><option value="use_for_content">Content ideas</option></select></label>
              </div>
            </details>
          </form>

          {progress && progressCopy[progress] ? (
            <div className="save-progress" aria-live="polite"><i /><span><strong>{progressCopy[progress]?.label}</strong>{progressCopy[progress]?.detail}</span></div>
          ) : null}
          {error ? <div className="capture-message error-message" role="alert"><strong>{displayLabel(error.code)}</strong>{error.message}</div> : null}
          {notice ? <div className="capture-message success-message" role="status">{notice}</div> : null}

          <footer>
            <span>Paste a link and Curio will sort it later.</span>
            <button disabled={submitting} onClick={() => void trySample()} type="button">Load an example</button>
          </footer>
        </div>
      </section>

      <section className="collection-shelf" id="collections">
        <header>
          <div><span className="eyebrow">Browse</span><h2>Collections</h2></div>
          <p>Automatically grouped by topic.</p>
        </header>
        <div className="collection-row">
          <button className={collectionFilter === "all" ? "active" : ""} onClick={() => chooseCollection("all")} type="button">
            <span className="collection-cover all-cover"><i>✦</i><i>◎</i><i>▶</i></span>
            <span className="collection-copy"><strong>Everything</strong><small>{items.length} save{items.length === 1 ? "" : "s"}</small></span>
          </button>
          {collections.map((collection, index) => (
            <button className={collectionFilter === collection.key ? "active" : ""} key={collection.key} onClick={() => chooseCollection(collection.key)} type="button">
              <span className={`collection-cover cover-${index % 4}`}><i>{displayLabel(collection.key).slice(0, 1)}</i><i>✦</i><i>↗</i></span>
              <span className="collection-copy"><strong>{displayLabel(collection.key)}</strong><small>{collection.count} save{collection.count === 1 ? "" : "s"}</small></span>
            </button>
          ))}
          {!collections.length ? (
            <button className="collection-placeholder" onClick={() => void trySample()} type="button">
              <span className="collection-cover"><i>+</i></span><span className="collection-copy"><strong>Your first curiosity</strong><small>Save something to begin</small></span>
            </button>
          ) : null}
        </div>
      </section>

      <section className="saved-section" id="saved">
        <header>
          <div><span className="eyebrow">Library</span><h2>{collectionFilter === "all" ? "All saves" : displayLabel(collectionFilter)}</h2></div>
          <span>{processedCount} processed · {items.length - processedCount} waiting</span>
        </header>

        <div className="saved-grid">
          {filteredItems.map((item, index) => (
            <button className={`saved-tile tone-${index % 5} ${selected?.id === item.id ? "active" : ""}`} key={item.id} onClick={() => { setSelectedId(item.id); setDetailOpen(true); }} type="button">
              <span className="tile-visual"><i>{tileIcon(item)}</i><small>{displayLabel(item.platform)}</small></span>
              <span className="tile-copy">
                <small>{displayLabel(groupKey(item))}</small>
                <strong>{itemTitle(item)}</strong>
                <em>{item.card ? "Ready to use" : item.accessLevel === "link_only" ? "Saved · needs source" : displayLabel(item.processingStatus)}</em>
              </span>
            </button>
          ))}
          {!filteredItems.length ? (
            <div className="saved-empty"><span>✦</span><h3>Start your Curio</h3><p>One interesting link is enough to begin.</p><button onClick={openCapture} type="button">Save a find</button></div>
          ) : null}
        </div>
      </section>

      {selected ? (
        <section className={`selected-section ${detailOpen ? "open" : ""}`} id="selected-item">
          <header>
            <button aria-label="Back to saved items" className="detail-back" onClick={() => setDetailOpen(false)} type="button">←</button>
            <div><span className="eyebrow">{selected.card ? "Inside this find" : "Saved source"}</span><h2>{selected.card ? "Curio found the signal." : "Saved now. Enrich only if needed."}</h2></div>
            <div>
              {!selected.card && selected.sourceUrl ? <button onClick={enrichSelected} type="button">Add context</button> : null}
              {selected.sourceUrl ? <a href={selected.sourceUrl} target="_blank" rel="noreferrer">Open source ↗</a> : null}
            </div>
          </header>
          <LearningCardView item={selected} />
        </section>
      ) : null}

      <footer className="site-footer"><span>Curio · keep your curiosity close</span><span>Save freely. Find meaning later.</span></footer>
      <nav className="mobile-tabbar" aria-label="Mobile navigation">
        <a className="active" href="#saved"><span>⌂</span><b>Saved</b></a>
        <button onClick={openCapture} type="button"><span>＋</span><b>Add</b></button>
        <a href="#collections"><span>▦</span><b>Collections</b></a>
      </nav>
    </main>
  );
}
