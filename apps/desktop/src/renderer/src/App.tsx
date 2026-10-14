import { Bookmark, Check, Circle, Clock3, ExternalLink, FileText, Inbox, Moon, PanelLeftClose, PanelLeftOpen, Pencil, RefreshCw, Search, Settings, Star, Sun, Tag, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { addItemTag, deleteItem, getConnectionConfig, listItems, listTags, markRead, removeItemTag, renameItem, saveConnectionConfig, setReadStatus, testConnection, toggleFavorite, type Item } from "./api";
import { LibraryEditor } from "./LibraryEditor";
import "./styles.css";

type Filter = "all" | "unread" | "favorites" | "tagged";

export function App() {
  const [filter, setFilter] = useState<Filter>("all");
  const [creating, setCreating] = useState(false);
  const [newRecordVersion, setNewRecordVersion] = useState(0);
  const [reading, setReading] = useState(true);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [collectionFilter, setCollectionFilter] = useState("");
  const [sortByDate, setSortByDate] = useState(false);
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
  const [deletingItemId, setDeletingItemId] = useState<number | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedItemIds, setSelectedItemIds] = useState<Set<number>>(() => new Set());
  const [batchPending, setBatchPending] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [itemColumnOpen, setItemColumnOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(() => Number(localStorage.getItem("sidebarWidth")) || 210);
  const [itemColumnWidth, setItemColumnWidth] = useState(() => Number(localStorage.getItem("itemColumnWidth")) || 360);
  const [resizing, setResizing] = useState(false);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
  const browserHost = useRef<HTMLDivElement>(null);
  const refreshVersion = useRef(0);
  const viewItems = useMemo(() => items.filter((item) =>
    (filter === "tagged" ? true : filter === "favorites" ? item.isFavorite : item.area === "inbox") &&
    (!activeTag || item.tags.some((tag) => tag.name.toLocaleLowerCase() === activeTag.toLocaleLowerCase()))), [items, filter, activeTag]);
  const selected = useMemo(() => viewItems.find((item) => item.id === selectedId) ?? null, [viewItems, selectedId]);
  const collections = useMemo(() => [...new Set(viewItems.map((item) => item.collection).filter((name): name is string => !!name))].sort(), [viewItems]);
  const visibleItems = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    const result = viewItems.filter((item) =>
      (filter !== "favorites" || !collectionFilter || item.collection === collectionFilter) &&
      (!query || [item.title, item.notes, item.url, item.collection, ...item.tags.map((tag) => tag.name)].some((value) => value?.toLocaleLowerCase().includes(query))));
    if (sortByDate && filter === "favorites") result.sort((a, b) => (b.contentDate ?? b.createdAt).localeCompare(a.contentDate ?? a.createdAt));
    return result;
  }, [viewItems, searchQuery, collectionFilter, sortByDate, filter]);

  async function canLeave() {
    if (!hasUnsavedChanges) return true;
    try {
      if (!await window.favorites.confirmDiscard()) return false;
      return true;
    } catch (cause) { setError(String(cause)); return false; }
  }

  function updateItem(updated: Item) {
    setItems((current) => current.map((item) => item.id === updated.id ? updated : item));
  }

  async function newRecord() {
    if (!await canLeave()) return;
    setSelectedId(null);
    setCreating(true);
    setNewRecordVersion((current) => current + 1);
    setReading(false);
    exitSelectionMode();
  }

  async function openDetails(item: Item) {
    if ((selectedId !== item.id || reading) && !await canLeave()) return;
    setSelectedId(item.id);
    setCreating(false);
    setReading(false);
  }

  async function refresh() {
    const version = ++refreshVersion.current;
    try {
      const result = await listItems(filter, activeTag);
      if (version !== refreshVersion.current) return;
      setItems(result.items);
      setSelectedItemIds((current) => {
        const visibleIds = new Set(result.items.map((item) => item.id));
        return new Set([...current].filter((id) => visibleIds.has(id)));
      });
      setError(null);
    } catch (cause) {
      if (version !== refreshVersion.current) return;
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
    const temporarilyHideBrowser = target === "items" && reading && selected?.url != null;

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
    setTitleDraft(item.title ?? item.url ?? "Untitled");
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

  async function chooseFilter(next: Filter) {
    if ((filter !== next || showSettings || showTags || activeTag) && !await canLeave()) return;
    if (selectionMode) {
      exitSelectionMode();
      if (!showSettings && !showTags && !activeTag && filter === next) return;
    }
    if (!showSettings && !showTags && !activeTag && filter === next) {
      setItemColumnOpen((current) => !current);
      return;
    }
    setShowSettings(false);
    setShowTags(false);
    setActiveTag(undefined);
    setFilter(next);
    setCollectionFilter("");
    setSelectedId(null); setCreating(false); setReading(true);
    setItemColumnOpen(true);
    exitSelectionMode();
  }

  function exitSelectionMode() {
    setSelectionMode(false);
    setSelectedItemIds(new Set());
  }

  async function enterSelectionMode() {
    if (!await canLeave()) return;
    setSelectedId(null); setCreating(false);
    setEditingTagId(null);
    setEditingTitleId(null);
    setDeletingItemId(null);
    setSelectionMode(true);
    setSelectedItemIds(new Set());
  }

  function toggleItemSelection(id: number) {
    setSelectedItemIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    const visibleIds = visibleItems.map((item) => item.id);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedItemIds.has(id));
    setSelectedItemIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) visibleIds.forEach((id) => next.delete(id));
      else visibleIds.forEach((id) => next.add(id));
      return next;
    });
  }

  async function batchSetRead(read: boolean) {
    const ids = [...selectedItemIds];
    if (ids.length === 0 || batchPending) return;

    setBatchPending(true);
    try {
      const updatedItems = await Promise.all(ids.map((id) => setReadStatus(id, read)));
      const updatedById = new Map(updatedItems.map((item) => [item.id, item]));
      setItems((current) => current
        .map((item) => updatedById.get(item.id) ?? item)
        .filter((item) => !(filter === "unread" && item.readStatus === "read")));
      setSelectedItemIds(new Set());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to update selected items");
      await refresh();
    } finally {
      setBatchPending(false);
    }
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
    if (selectedId === item.id && activeTag && !await canLeave()) return;
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

  async function openSettings() {
    if (!await canLeave()) return;
    setCreating(false);
    if (showSettings) {
      setItemColumnOpen((current) => !current);
      return;
    }
    setShowSettings(true);
    setShowTags(false);
    setActiveTag(undefined);
    setItemColumnOpen(true);
    setSelectedId(null);
    exitSelectionMode();
    window.favorites.hideBrowser();
  }

  async function openTags() {
    if (!await canLeave()) return;
    setSelectedId(null); setCreating(false);
    if (showTags) {
      setItemColumnOpen((current) => !current);
      return;
    }

    setShowSettings(false);
    setShowTags(true);
    setFilter("tagged");
    setCollectionFilter("");
    setActiveTag(undefined);
    setItemColumnOpen(true);
    exitSelectionMode();
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

  async function openTag(tag: string) {
    if (!await canLeave()) return;
    setSelectedId(null); setCreating(false);
    setShowSettings(false);
    setShowTags(false);
    setFilter("tagged");
    setActiveTag(tag);
    setItemColumnOpen(true);
    exitSelectionMode();
  }

  async function changeTag(tag: string) {
    if (!await canLeave()) return;
    setSelectedId(null); setCreating(false);
    setActiveTag(tag || undefined);
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
    return () => { refreshVersion.current++; };
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
    const visibleIds = new Set(visibleItems.map((item) => item.id));
    setSelectedItemIds((current) => {
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      if (next.size === current.size && [...next].every((id) => current.has(id))) return current;
      return next;
    });
  }, [visibleItems]);

  useEffect(() => {
    if (!selected || !reading || !selected.url || creating) window.favorites.hideBrowser();
    else window.favorites.showBrowser();
  }, [selected?.id, reading, creating]);

  useEffect(() => {
    const preventClose = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    if (hasUnsavedChanges) window.addEventListener("beforeunload", preventClose);
    return () => window.removeEventListener("beforeunload", preventClose);
  }, [hasUnsavedChanges]);

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

  async function open(item: Item, external = false) {
    if (!external && !selectionMode && (filter === "favorites" || !item.url)) { await openDetails(item); return; }
    if (selectionMode) {
      toggleItemSelection(item.id);
      return;
    }
    if (!item.url) return;
    if (!external && !await canLeave()) return;
    try {
      if (external) {
        await window.favorites.openExternal(item.url);
      } else {
        setSelectedId(item.id); setCreating(false); setReading(true);
        await window.favorites.openUrl(item.url);
      }
      if (item.readStatus === "unread") {
        const updated = await markRead(item.id);
        setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, ...updated } : entry));
      }
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to open item");
    }
  }

  async function removeItem(item: Item) {
    if (deletePending) return;
    if (selectedId === item.id && !await canLeave()) return;
    setDeletePending(true);
    try {
      await deleteItem(item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setSelectedId((current) => current === item.id ? null : current);
      setEditingTitleId((current) => current === item.id ? null : current);
      setEditingTagId((current) => current === item.id ? null : current);
      setDeletingItemId(null);
      setError(null);
      await refreshTags();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to delete item");
    } finally {
      setDeletePending(false);
    }
  }

  async function favorite(item: Item) {
    if (favoritePendingId === item.id) return;
    const nextFavorite = !item.isFavorite;
    if (!nextFavorite && filter === "favorites" && selectedId === item.id && !await canLeave()) return;

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
          <NavButton active={!showSettings && !showTags && !activeTag && filter === "all"} icon={<Clock3 size={17} />} label="Collected" onClick={() => chooseFilter("all")} />
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
        {error && <div className="error-card">{error}</div>}
        <div className="tag-browser">
          {!error && tags.length === 0 && <div className="list-empty">
            <Tag size={24} />
            <strong>No tags</strong>
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
          <div>
            <strong>{activeTag ? `#${activeTag}` : filter === "all" ? "Collected" : filter === "unread" ? "Unread" : "Favorites"}</strong>
            <span>{visibleItems.length === viewItems.length ? `${viewItems.length} items` : `${visibleItems.length} of ${viewItems.length} items`}</span>
          </div>
          <div className="list-header-actions">
            {filter === "favorites" && <button className="text-button" onClick={() => void newRecord()}>New</button>}
            {visibleItems.length > 0 && (selectionMode
              ? <button className="text-button" onClick={exitSelectionMode}>Cancel</button>
              : <button className="text-button" onClick={enterSelectionMode}>Select</button>)}
            <button className="icon-button" onClick={() => void canLeave().then((allowed) => { if (allowed) { setSelectedId(null); setCreating(false); setReading(true); void refresh(); } })} title="Refresh"><RefreshCw size={16} /></button>
          </div>
        </header>
        <div className="search-bar">
          <Search size={15} />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search notes, titles and tags"
          />
          {searchQuery && <button className="search-clear" onClick={() => setSearchQuery("")} title="Clear search" aria-label="Clear search"><X size={14} /></button>}
        </div>
        {filter === "favorites" && <div className="library-filters">
          {filter === "favorites" && <select aria-label="Filter by collection" value={collectionFilter} onChange={(event) => setCollectionFilter(event.target.value)}><option value="">All collections</option>{collections.map((name) => <option key={name}>{name}</option>)}</select>}
          <select aria-label="Filter by tag" value={activeTag ?? ""} onChange={(event) => void changeTag(event.target.value)}><option value="">All tags</option>{tags.map((tag) => <option key={tag.id} value={tag.name}>{tag.name}</option>)}</select>
          {filter === "favorites" && <label className="date-sort"><input type="checkbox" checked={sortByDate} onChange={(event) => setSortByDate(event.target.checked)} />Content date</label>}
        </div>}
        {selectionMode && <div className="batch-toolbar">
          <button
            className={`batch-select-all ${visibleItems.length > 0 && visibleItems.every((item) => selectedItemIds.has(item.id)) ? "active" : ""}`}
            onClick={toggleSelectAll}
            disabled={visibleItems.length === 0 || batchPending}
          >
            <span className="selection-box">{visibleItems.length > 0 && visibleItems.every((item) => selectedItemIds.has(item.id)) && <Check size={13} />}</span>
            {visibleItems.length > 0 && visibleItems.every((item) => selectedItemIds.has(item.id)) ? "Clear all" : "Select all"}
          </button>
          <span className="batch-count">{selectedItemIds.size} selected</span>
          <div className="batch-actions">
            <button disabled={selectedItemIds.size === 0 || batchPending} onClick={() => void batchSetRead(true)}>Mark read</button>
            <button disabled={selectedItemIds.size === 0 || batchPending} onClick={() => void batchSetRead(false)}>Mark unread</button>
          </div>
        </div>}
        {error && <div className="error-card">{error}</div>}
        <div className="item-list">
          {!error && viewItems.length === 0 && <div className="list-empty">
            <Inbox size={24} />
            <strong>No items</strong>
          </div>}
          {!error && viewItems.length > 0 && visibleItems.length === 0 && <div className="list-empty">
            <Search size={24} />
            <strong>No results</strong>
          </div>}
          {visibleItems.map((item) => (
            <article
              key={item.id}
              className={`item-card ${selectedId === item.id && !selectionMode ? "selected" : ""} ${selectedItemIds.has(item.id) ? "batch-selected" : ""} ${selectionMode ? "selection-mode" : ""}`}
              onClick={() => void open(item)}
            >
              <div className={`item-title-row ${selectionMode ? "selecting" : ""}`}>
                {selectionMode && <button
                  className={`batch-checkbox ${selectedItemIds.has(item.id) ? "active" : ""}`}
                  aria-label={selectedItemIds.has(item.id) ? "Deselect item" : "Select item"}
                  aria-pressed={selectedItemIds.has(item.id)}
                  onClick={(event) => { event.stopPropagation(); toggleItemSelection(item.id); }}
                >
                  {selectedItemIds.has(item.id) && <Check size={13} />}
                </button>}
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
                ) : <strong>{item.title ?? item.url ?? "Untitled"}</strong>}
                {!selectionMode && <div className="item-actions">
                  <button className="star-button" disabled={hasUnsavedChanges} title="Rename" aria-label="Rename" onClick={(event) => { event.stopPropagation(); openTitleEditor(item); }}><Pencil size={15} /></button>
                  <button className="star-button" title="Notes" aria-label="Notes" onClick={(event) => { event.stopPropagation(); void openDetails(item); }}><FileText size={15} /></button>
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
                  <button className="star-button" disabled={!item.url} title="Open in default browser" aria-label="Open in default browser" onClick={(event) => { event.stopPropagation(); void open(item, true); }}><ExternalLink size={15} /></button>
                  <button className="star-button" title="Delete item" aria-label="Delete item" disabled={deletePending} onClick={(event) => { event.stopPropagation(); setDeletingItemId(item.id); }}><Trash2 size={15} /></button>
                </div>}
              </div>
              {!selectionMode && deletingItemId === item.id && <div className="delete-confirmation" role="group" aria-label="Confirm item deletion" onClick={(event) => event.stopPropagation()}>
                <span>Delete this item? This cannot be undone.</span>
                <div className="title-editor-actions">
                  <button disabled={deletePending} onClick={() => void removeItem(item)}>{deletePending ? "Deleting…" : "Delete"}</button>
                  <button disabled={deletePending} onClick={() => setDeletingItemId(null)}>Cancel</button>
                </div>
              </div>}
              {editingTitleId === item.id && <div className="title-editor-actions" onClick={(event) => event.stopPropagation()}>
                <button onClick={() => void saveTitle(item)}>Save</button>
                <button className="icon-button" onClick={() => setEditingTitleId(null)}><X size={14} /></button>
              </div>}
              <p>{item.notes || item.description || item.url}</p>
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
              <time>{item.contentDate ?? new Date(item.createdAt).toLocaleString()}</time>
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

      <section className="browser-host">
        {reading && selected?.url && <div className="reader-toolbar">
          <button onClick={() => void openDetails(selected)}>Notes</button>
        </div>}
        <div ref={browserHost} className="browser-viewport" style={{ display: reading ? "block" : "none" }}>
          {!selected && !creating && <div className="browser-empty"><Bookmark size={28} /></div>}
        </div>
        {!reading && (selected || creating) && <>
          <LibraryEditor key={selected ? `${selected.id}:${selected.area}:${selected.title}` : `new-${filter}-${newRecordVersion}`} item={selected} collections={collections}
            onDirty={setHasUnsavedChanges}
            onRead={async () => { if (!selected?.url || !await canLeave()) return; try { await window.favorites.openUrl(selected.url); setReading(true); if (selected.readStatus === "unread") updateItem(await markRead(selected.id)); } catch (cause) { setError(String(cause)); } }}
            onSaved={(saved) => { setItems((current) => current.some((item) => item.id === saved.id) ? current.map((item) => item.id === saved.id ? saved : item) : [saved, ...current]); setCreating(false); setSelectedId(saved.id); }} />
        </>}
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
    </div>
    <label>Server URL<input value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} /></label>
    <label>API Token<input type="password" value={apiToken} onChange={(event) => setApiToken(event.target.value)} /></label>
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
