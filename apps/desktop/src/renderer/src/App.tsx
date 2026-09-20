import { Bookmark, Circle, Clock3, Inbox, RefreshCw, Settings, Star, Tag, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { getConnectionConfig, listItems, listTags, markRead, saveConnectionConfig, setItemTags, testConnection, toggleFavorite, type Item } from "./api";
import "./styles.css";

type Filter = "all" | "unread" | "favorites";

export function App() {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<Item[]>([]);
  const [tags, setTags] = useState<{ id: number; name: string }[]>([]);
  const [activeTag, setActiveTag] = useState<string | undefined>();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editingTagId, setEditingTagId] = useState<number | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favoritePendingId, setFavoritePendingId] = useState<number | null>(null);
  const browserHost = useRef<HTMLDivElement>(null);
  const selected = useMemo(() => items.find((item) => item.id === selectedId) ?? null, [items, selectedId]);

  async function refresh() {
    try {
      const result = await listItems(filter, activeTag);
      setItems(result.items);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load items");
    }
  }

  function chooseFilter(next: Filter) {
    setShowSettings(false);
    setFilter(next);
  }

  function openTagEditor(item: Item) {
    setEditingTagId(item.id);
    setTagDraft(item.tags.map((tag) => tag.name).join(", "));
  }

  async function saveTags(item: Item) {
    try {
      const names = tagDraft.split(",").map((name) => name.trim()).filter(Boolean);
      const updated = await setItemTags(item.id, names);
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...updated } : entry));
      const refreshed = await listTags();
      setTags(refreshed.tags);
      setEditingTagId(null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to update tags");
    }
  }

  function openSettings() {
    setShowSettings(true);
    setSelectedId(null);
    window.favorites.hideBrowser();
  }

  useEffect(() => {
    void refresh();
  }, [filter, activeTag]);

  useEffect(() => {
    listTags().then((result) => setTags(result.tags)).catch(() => undefined);
  }, []);

  useEffect(() => {
    const element = browserHost.current;
    if (!element) return;
    const sync = () => {
      const rect = element.getBoundingClientRect();
      window.favorites.setBrowserBounds({ x: rect.x, y: rect.y, width: rect.width, height: rect.height });
    };
    const observer = new ResizeObserver(sync);
    observer.observe(element);
    window.addEventListener("resize", sync);
    sync();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  async function open(item: Item) {
    setSelectedId(item.id);
    await window.favorites.openUrl(item.url);
    if (item.readStatus === "unread") {
      const updated = await markRead(item.id);
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...updated } : entry));
    }
  }

  async function favorite(item: Item) {
    if (favoritePendingId === item.id) return;
    const nextFavorite = !item.isFavorite;

    setFavoritePendingId(item.id);
    setItems((current) => current.map((entry) => entry.id === item.id
      ? { ...entry, isFavorite: nextFavorite }
      : entry));

    try {
      const updated = await toggleFavorite(item.id, nextFavorite);
      setItems((current) => {
        if (filter === "favorites" && !updated.isFavorite) {
          return current.filter((entry) => entry.id !== item.id);
        }
        return current.map((entry) => entry.id === item.id ? { ...entry, ...updated } : entry);
      });
      setError(null);
    } catch (cause) {
      setItems((current) => current.map((entry) => entry.id === item.id
        ? { ...entry, isFavorite: item.isFavorite }
        : entry));
      setError(cause instanceof Error ? cause.message : "Failed to update favorite");
    } finally {
      setFavoritePendingId(null);
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><Bookmark size={20} /> Oh My Favorites</div>
        <nav>
          <NavButton active={!showSettings && filter === "all"} icon={<Clock3 size={17} />} label="Timeline" onClick={() => chooseFilter("all")} />
          <NavButton active={!showSettings && filter === "unread"} icon={<Inbox size={17} />} label="Unread" onClick={() => chooseFilter("unread")} />
          <NavButton active={!showSettings && filter === "favorites"} icon={<Star size={17} />} label="Favorites" onClick={() => chooseFilter("favorites")} />
          <NavButton active={showSettings} icon={<Settings size={17} />} label="Settings" onClick={openSettings} />
        </nav>
        {tags.length > 0 && <div className="tag-nav">
          <span>Tags</span>
          <button className={!activeTag ? "active" : ""} onClick={() => setActiveTag(undefined)}>All tags</button>
          {tags.map((tag) => <button key={tag.id} className={activeTag === tag.name ? "active" : ""} onClick={() => setActiveTag(tag.name)}>#{tag.name}</button>)}
        </div>}
      </aside>

      <section className="item-column">
        {showSettings ? <SettingsPanel onSaved={() => { setShowSettings(false); void refresh(); }} /> : <>
        <header className="list-header">
          <div><strong>{filter === "all" ? "Timeline" : filter === "unread" ? "Unread" : "Favorites"}</strong><span>{items.length} items</span></div>
          <button className="icon-button" onClick={() => void refresh()} title="Refresh"><RefreshCw size={16} /></button>
        </header>
        {error && <div className="error-card">{error}<small>Configure apiUrl/apiToken in localStorage for now.</small></div>}
        <div className="item-list">
          {!error && items.length === 0 && <div className="list-empty">
            <Inbox size={24} />
            <strong>No items here</strong>
            <span>{activeTag ? `Nothing matches #${activeTag}.` : filter === "unread" ? "You have no unread items." : filter === "favorites" ? "You have not favorited anything yet." : "Send a URL to your Telegram bot to get started."}</span>
          </div>}
          {items.map((item) => (
            <article key={item.id} className={`item-card ${selectedId === item.id ? "selected" : ""}`} onClick={() => void open(item)}>
              <div className="item-title-row">
                <Circle size={9} fill={item.readStatus === "unread" ? "currentColor" : "none"} />
                <strong>{item.title ?? new URL(item.url).hostname}</strong>
                <div className="item-actions">
                  <button className="star-button" title="Edit tags" onClick={(event) => { event.stopPropagation(); openTagEditor(item); }}><Tag size={15} /></button>
                  <button
                    className={`star-button ${item.isFavorite ? "active" : ""}`}
                    title={item.isFavorite ? "Remove from favorites" : "Add to favorites"}
                    aria-label={item.isFavorite ? "Remove from favorites" : "Add to favorites"}
                    aria-pressed={item.isFavorite}
                    disabled={favoritePendingId === item.id}
                    onClick={(event) => { event.stopPropagation(); void favorite(item); }}
                  >
                    <Star size={15} fill={item.isFavorite ? "currentColor" : "none"} />
                  </button>
                </div>
              </div>
              <p>{item.description ?? item.url}</p>
              {item.tags?.length > 0 && <div className="item-tags">{item.tags.map((tag) => <span key={tag.id}>#{tag.name}</span>)}</div>}
              {editingTagId === item.id && <div className="tag-editor" onClick={(event) => event.stopPropagation()}>
                <input value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="research, backend, later" onKeyDown={(event) => { if (event.key === "Enter") void saveTags(item); }} />
                <button onClick={() => void saveTags(item)}>Save</button>
                <button className="icon-button" onClick={() => setEditingTagId(null)}><X size={14} /></button>
              </div>}
              <time>{new Date(item.createdAt).toLocaleString()}</time>
            </article>
          ))}
        </div>
        </>}
      </section>

      <section ref={browserHost} className="browser-host">
        {!selected && <div className="browser-empty"><Bookmark size={28} /><span>Select an item to open it here.</span></div>}
      </section>
    </main>
  );
}

function SettingsPanel({ onSaved }: { onSaved(): void }) {
  const initial = getConnectionConfig();
  const [apiUrl, setApiUrl] = useState(initial.apiUrl);
  const [apiToken, setApiToken] = useState(initial.apiToken);
  const [status, setStatus] = useState<string | null>(null);

  async function test() {
    saveConnectionConfig(apiUrl, apiToken);
    try {
      await testConnection();
      setStatus("Connection successful.");
    } catch (cause) {
      setStatus(cause instanceof Error ? `Connection failed: ${cause.message}` : "Connection failed.");
    }
  }

  return <div className="settings-panel">
    <div>
      <h2>Server connection</h2>
      <p>Connect this desktop client to your self-hosted Oh My Favorites server.</p>
    </div>
    <label>Server URL<input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} placeholder="https://favorites.example.com" /></label>
    <label>API Token<input type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} placeholder="Bearer token" /></label>
    <div className="settings-actions">
      <button className="secondary-button" onClick={() => void test()}>Test connection</button>
      <button className="primary-button" onClick={() => { saveConnectionConfig(apiUrl, apiToken); onSaved(); }}>Save</button>
    </div>
    {status && <div className="connection-status">{status}</div>}
  </div>;
}

function NavButton(props: { active: boolean; icon: React.ReactNode; label: string; onClick(): void }) {
  return <button className={`nav-button ${props.active ? "active" : ""}`} onClick={props.onClick}>{props.icon}<span>{props.label}</span></button>;
}
