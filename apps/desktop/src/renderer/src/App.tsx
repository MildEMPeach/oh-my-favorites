import { Bookmark, Circle, Clock3, Inbox, Moon, PanelLeftClose, PanelLeftOpen, Pencil, RefreshCw, Settings, Star, Sun, Tag, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { addItemTag, getConnectionConfig, listItems, listTags, markRead, removeItemTag, renameItem, saveConnectionConfig, testConnection, toggleFavorite, type Item } from "./api";
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
  const [editingTitleId, setEditingTitleId] = useState<number | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [showTags, setShowTags] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [favoritePendingId, setFavoritePendingId] = useState<number | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [itemColumnOpen, setItemColumnOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem("sidebarWidth")) || 210);
  const [itemColumnWidth, setItemColumnWidth] = useState(() => Number(localStorage.getItem("itemColumnWidth")) || 360);
  const [resizing, setResizing] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
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

  function startResize(target: "sidebar" | "items", event: React.PointerEvent<HTMLDivElement>) {
    if ((target === "sidebar" && sidebarCollapsed) || (target === "items" && !itemColumnOpen)) return;

    event.preventDefault();
    const startX = event.clientX;
    const startWidth = target === "sidebar" ? sidebarWidth : itemColumnWidth;
    const sidebarRenderedWidth = sidebarCollapsed ? 56 : sidebarWidth;
    const itemRenderedWidth = itemColumnOpen ? itemColumnWidth : 0;
    const minWidth = target === "sidebar" ? 160 : 280;
    const temporarilyHideBrowser = target === "items" && selected !== null;

    setResizing(true);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    if (temporarilyHideBrowser) window.favorites.hideBrowser();

    const onPointerMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX;
      const otherWidth = target === "sidebar" ? itemRenderedWidth : sidebarRenderedWidth;
      const maxWidth = Math.max(minWidth, window.innerWidth - otherWidth - 320);
      const nextWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));

      if (target === "sidebar") {
        setSidebarWidth(nextWidth);
      } else {
        setItemColumnWidth(nextWidth);
      }
    };

    const finishResize = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", finishResize);
      window.removeEventListener("pointercancel", finishResize);
      window.removeEventListener("blur", finishResize);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      setResizing(false);
      if (temporarilyHideBrowser) window.favorites.showBrowser();
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", finishResize, { once: true });
    window.addEventListener("pointercancel", finishResize, { once: true });
    window.addEventListener("blur", finishResize, { once: true });
  }

  function resizeWithKeyboard(target: "sidebar" | "items", event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? -20 : 20;
    const minWidth = target === "sidebar" ? 160 : 280;
    const otherWidth = target === "sidebar"
      ? (itemColumnOpen ? itemColumnWidth : 0)
      : (sidebarCollapsed ? 56 : sidebarWidth);
    const maxWidth = Math.max(minWidth, window.innerWidth - otherWidth - 320);

    if (target === "sidebar") {
      setSidebarWidth((current) => Math.min(maxWidth, Math.max(minWidth, current + delta)));
    } else {
      setItemColumnWidth((current) => Math.min(maxWidth, Math.max(minWidth, current + delta)));
    }
  }

  function openTitleEditor(item: Item) {
    setEditingTitleId(item.id);
    setTitleDraft(item.title ?? new URL(item.url).hostname);
  }

  async function saveTitle(item: Item) {
    const title = titleDraft.trim();
    if (!title) return;

    try {
      const updated = await renameItem(item.id, title);
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...updated } : entry));
      setEditingTitleId(null);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to rename item");
    }
  }

  function chooseFilter(next: Filter) {
    if (!showSettings && !showTags && !activeTag && filter === next) {
      setItemColumnOpen((current) => !current);
      return;
    }
    setShowSettings(false);
    setShowTags(false);
    setActiveTag(undefined);
    setFilter(next);
    setItemColumnOpen(true);
  }

  function openTagEditor(item: Item) {
    setEditingTagId(item.id);
    setTagDraft("");
  }

  async function addTag(item: Item) {
    const name = tagDraft.trim();
    if (!name) return;

    try {
      const updated = await addItemTag(item.id, name);
      setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...updated } : entry));
      const refreshed = await listTags();
      setTags(refreshed.tags);
      setEditingTagId(null);
      setTagDraft("");
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to add tag");
    }
  }

  async function removeTag(item: Item, tagId: number) {
    try {
      const updated = await removeItemTag(item.id, tagId);
      setItems((current) => {
        if (activeTag && !updated.tags.some((tag) => tag.name === activeTag)) {
          return current.filter((entry) => entry.id !== item.id);
        }
        return current.map((entry) => entry.id === item.id ? { ...entry, ...updated } : entry);
      });
      const refreshed = await listTags();
      setTags(refreshed.tags);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to remove tag");
    }
  }

  function openSettings() {
    if (showSettings) {
      setItemColumnOpen((current) => !current);
      return;
    }
    setShowSettings(true);
    setShowTags(false);
    setActiveTag(undefined);
    setItemColumnOpen(true);
    setSelectedId(null);
    window.favorites.hideBrowser();
  }

  async function openTags() {
    if (showTags) {
      setItemColumnOpen((current) => !current);
      return;
    }

    setShowSettings(false);
    setShowTags(true);
    setActiveTag(undefined);
    setItemColumnOpen(true);
    await refreshTags();
  }

  async function refreshTags() {
    try {
      const result = await listTags();
      setTags(result.tags);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load tags");
    }
  }

  function openTag(tag: string) {
    setShowSettings(false);
    setShowTags(false);
    setFilter("all");
    setActiveTag(tag);
    setItemColumnOpen(true);
  }

  function toggleTheme() {
    setDarkMode((current) => {
      const next = !current;
      localStorage.setItem("theme", next ? "dark" : "light");
      return next;
    });
  }

  useEffect(() => {
    void refresh();
  }, [filter, activeTag]);

  useEffect(() => {
    listTags().then((result) => setTags(result.tags)).catch(() => undefined);
  }, []);

  useEffect(() => {
    document.documentElement.style.colorScheme = darkMode ? "dark" : "light";
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem("sidebarWidth", String(Math.round(sidebarWidth)));
  }, [sidebarWidth]);

  useEffect(() => {
    localStorage.setItem("itemColumnWidth", String(Math.round(itemColumnWidth)));
  }, [itemColumnWidth]);

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
    <main
      className={`app-shell ${darkMode ? "dark-mode" : ""} ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${itemColumnOpen ? "" : "item-column-collapsed"} ${resizing ? "resizing" : ""}`}
      style={{
        "--sidebar-width": `${sidebarWidth}px`,
        "--item-column-width": `${itemColumnWidth}px`,
      } as React.CSSProperties}
    >
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-title"><Bookmark size={20} /><span>Oh My Favorites</span></div>
          <button
            className="sidebar-toggle"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            onClick={() => setSidebarCollapsed((current) => !current)}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
          </button>
        </div>
        <nav>
          <NavButton active={!showSettings && !showTags && !activeTag && filter === "all"} icon={<Clock3 size={17} />} label="Timeline" onClick={() => chooseFilter("all")} />
          <NavButton active={!showSettings && !showTags && !activeTag && filter === "unread"} icon={<Inbox size={17} />} label="Unread" onClick={() => chooseFilter("unread")} />
          <NavButton active={!showSettings && !showTags && !activeTag && filter === "favorites"} icon={<Star size={17} />} label="Favorites" onClick={() => chooseFilter("favorites")} />
          <NavButton active={showTags || Boolean(activeTag)} icon={<Tag size={17} />} label="Tags" onClick={() => void openTags()} />
          <NavButton active={showSettings} icon={<Settings size={17} />} label="Settings" onClick={openSettings} />
        </nav>
        <div className="sidebar-footer">
          <NavButton active={false} icon={darkMode ? <Sun size={17} /> : <Moon size={17} />} label={darkMode ? "Light mode" : "Dark mode"} onClick={toggleTheme} />
        </div>
      </aside>

      <div
        className="pane-resizer sidebar-resizer"
        role="separator"
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        tabIndex={sidebarCollapsed ? -1 : 0}
        onPointerDown={(event) => startResize("sidebar", event)}
        onKeyDown={(event) => resizeWithKeyboard("sidebar", event)}
      />

      <section className="item-column">
        {showSettings ? <SettingsPanel onSaved={() => { setShowSettings(false); setItemColumnOpen(true); void refresh(); }} /> : showTags ? <>
        <header className="list-header">
          <div><strong>Tags</strong><span>{tags.length} tags</span></div>
          <button className="icon-button" onClick={() => void refreshTags()} title="Refresh"><RefreshCw size={16} /></button>
        </header>
        {error && <div className="error-card">{error}<small>Check Settings and confirm the server is reachable.</small></div>}
        <div className="tag-browser">
          {!error && tags.length === 0 && <div className="list-empty">
            <Tag size={24} />
            <strong>No tags yet</strong>
            <span>Add tags to an item and they will appear here.</span>
          </div>}
          {tags.map((tag) => (
            <button key={tag.id} className="tag-browser-item" onClick={() => openTag(tag.name)}>
              <Tag size={15} />
              <span>#{tag.name}</span>
            </button>
          ))}
        </div>
        </> : <>
        <header className="list-header">
          <div><strong>{activeTag ? `#${activeTag}` : filter === "all" ? "Timeline" : filter === "unread" ? "Unread" : "Favorites"}</strong><span>{items.length} items</span></div>
          <button className="icon-button" onClick={() => void refresh()} title="Refresh"><RefreshCw size={16} /></button>
        </header>
        {error && <div className="error-card">{error}<small>Check Settings and confirm the server is reachable.</small></div>}
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
                {editingTitleId === item.id ? (
                  <input
                    className="title-editor"
                    autoFocus
                    value={titleDraft}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setTitleDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") void saveTitle(item);
                      if (event.key === "Escape") setEditingTitleId(null);
                    }}
                  />
                ) : <strong>{item.title ?? new URL(item.url).hostname}</strong>}
                <div className="item-actions">
                  <button className="star-button" title="Rename" aria-label="Rename" onClick={(event) => { event.stopPropagation(); openTitleEditor(item); }}><Pencil size={15} /></button>
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
              {editingTitleId === item.id && <div className="title-editor-actions" onClick={(event) => event.stopPropagation()}>
                <button onClick={() => void saveTitle(item)}>Save</button>
                <button className="icon-button" onClick={() => setEditingTitleId(null)}><X size={14} /></button>
              </div>}
              <p>{item.description ?? item.url}</p>
              {item.tags?.length > 0 && <div className="item-tags" onClick={(event) => event.stopPropagation()}>{item.tags.map((tag) => <span className="item-tag-chip" key={tag.id}>
                <span>#{tag.name}</span>
                <button
                  className="tag-remove-button"
                  title={`Remove #${tag.name}`}
                  aria-label={`Remove #${tag.name}`}
                  onClick={() => void removeTag(item, tag.id)}
                ><X size={11} /></button>
              </span>)}</div>}
              {editingTagId === item.id && <div className="tag-editor" onClick={(event) => event.stopPropagation()}>
                <input autoFocus value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="Add one tag" onKeyDown={(event) => { if (event.key === "Enter") void addTag(item); if (event.key === "Escape") setEditingTagId(null); }} />
                <button onClick={() => void addTag(item)}>Add</button>
                <button className="icon-button" onClick={() => setEditingTagId(null)}><X size={14} /></button>
              </div>}
              <time>{new Date(item.createdAt).toLocaleString()}</time>
            </article>
          ))}
        </div>
        </>}
      </section>

      <div
        className="pane-resizer item-resizer"
        role="separator"
        aria-label="Resize item list"
        aria-orientation="vertical"
        tabIndex={itemColumnOpen ? 0 : -1}
        onPointerDown={(event) => startResize("items", event)}
        onKeyDown={(event) => resizeWithKeyboard("items", event)}
      />

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
  return <button
    className={`nav-button ${props.active ? "active" : ""}`}
    title={props.label}
    aria-label={props.label}
    onClick={props.onClick}
  >{props.icon}<span>{props.label}</span></button>;
}
