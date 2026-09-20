import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export type FavoritesDatabase = ReturnType<typeof createDatabase>;

export function createDatabase(filename: string) {
  const sqlite = new Database(filename);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT,
      description TEXT,
      favicon_url TEXT,
      source TEXT NOT NULL DEFAULT 'desktop' CHECK (source IN ('telegram', 'desktop')),
      read_status TEXT NOT NULL DEFAULT 'unread' CHECK (read_status IN ('unread', 'read')),
      is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      read_at INTEGER,
      favorited_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS item_tags (
      item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      UNIQUE(item_id, tag_id)
    );
    CREATE INDEX IF NOT EXISTS items_created_at_idx ON items(created_at DESC);
    CREATE INDEX IF NOT EXISTS items_read_status_idx ON items(read_status);
    CREATE INDEX IF NOT EXISTS items_favorite_idx ON items(is_favorite);
  `);
  return drizzle(sqlite, { schema });
}

export * from "./schema.js";
