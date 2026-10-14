import { useEffect, useRef, useState } from "react";
import type { LibraryFields } from "@oh-my-favorites/shared";
import { createRecord, saveDetails, type Item } from "./api";

export function LibraryEditor({ item, collections, onSaved, onDirty, onRead }: {
  item: Item | null; collections: string[];
  onSaved(item: Item): void; onDirty(dirty: boolean): void; onRead(): void;
}) {
  const [draft, setDraft] = useState<LibraryFields & { title: string; url: string }>(() => ({
    title: item?.title ?? "", url: item?.url ?? "", notes: item?.notes ?? "",
    collection: item?.collection ?? null, contentDate: item?.contentDate ?? null
  }));
  const [baseline, setBaseline] = useState(() => JSON.stringify(draft));
  const dirty = JSON.stringify(draft) !== baseline;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { onDirty(dirty); return () => onDirty(false); }, [dirty, onDirty]);

  function field<K extends keyof typeof draft>(key: K, value: typeof draft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const { url, ...details } = draft;
      const saved = item ? await saveDetails(item.id, details) : await createRecord({ ...details, url: url.trim() });
      if (!mounted.current) return;
      setBaseline(JSON.stringify(draft)); onDirty(false); onSaved(saved);
    } catch (cause) { if (mounted.current) setError(cause instanceof Error ? cause.message : "Failed to save notes"); }
    finally { if (mounted.current) setBusy(false); }
  }

  return <div className="library-editor">
    <header className="detail-header"><h2>{item ? item.title ?? "Untitled" : "New favorite"}</h2>
      {item?.url && <button onClick={onRead}>Read page</button>}
    </header>
    <form onSubmit={(event) => void save(event)} className="detail-form">
      <fieldset disabled={busy} className="detail-fields">
        <label>Title<input required maxLength={300} value={draft.title} onChange={(event) => field("title", event.target.value)} /></label>
        {!item && <label>Source URL<input required type="url" maxLength={8192} value={draft.url} onChange={(event) => field("url", event.target.value)} /></label>}
        {item?.url && <a className="source-link" href={item.url} onClick={(event) => { event.preventDefault(); void window.favorites.openExternal(item.url!).catch((cause) => setError(String(cause))); }}>{item.url}</a>}
        <div className="field-grid">
          <label>Collection<input list="collection-names" maxLength={80} value={draft.collection ?? ""} onChange={(event) => field("collection", event.target.value || null)} /></label>
          <datalist id="collection-names">{collections.map((name) => <option key={name} value={name} />)}</datalist>
          <label>Content date<input type="date" value={draft.contentDate ?? ""} onChange={(event) => field("contentDate", event.target.value || null)} /></label>
        </div>
        <label>Notes<textarea rows={12} maxLength={100_000} value={draft.notes} onChange={(event) => field("notes", event.target.value)} /></label>
      </fieldset>
      <div className="detail-actions"><button className="primary-button" disabled={busy}>{busy ? "Saving…" : "Save"}</button>{dirty && <span role="status">Unsaved</span>}</div>
      {error && <div className="inline-error" role="alert">{error}</div>}
    </form>
  </div>;
}
