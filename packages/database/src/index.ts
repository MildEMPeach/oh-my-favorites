import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema.js";

export type FavoritesDatabase = ReturnType<typeof createDatabase>;

export function createDatabase(filename: string) {
  const sqlite = new Database(filename);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = OFF");
  try {
    sqlite.transaction(() => {
      sqlite.exec(`
        CREATE TABLE IF NOT EXISTS items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          url TEXT UNIQUE,
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
      `);
      const fields: Record<string, string> = {
        area: "TEXT NOT NULL DEFAULT 'inbox' CHECK (area IN ('inbox', 'library'))",
        notes: "TEXT NOT NULL DEFAULT ''", collection: "TEXT", content_date: "TEXT"
      };
      const info = sqlite.pragma("table_info(items)") as { name: string; notnull: number }[];
      for (const [name, definition] of Object.entries(fields)) {
        if (!info.some((column) => column.name === name)) sqlite.exec(`ALTER TABLE items ADD COLUMN ${name} ${definition}`);
      }
      if (info.find((column) => column.name === "url")?.notnull) {
        // SQLite requires a table rebuild to allow records without a URL.
        const definition = (sqlite.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'items'").get() as { sql: string }).sql;
        const sequence = sqlite.prepare("SELECT seq FROM sqlite_sequence WHERE name = 'items'").get() as { seq: number } | undefined;
        sqlite.exec(definition.replace(/CREATE TABLE ["`]?items["`]?/i, "CREATE TABLE items_nullable").replace(/["`]?url["`]?\s+TEXT\s+NOT NULL/i, "url TEXT"));
        const columns = (sqlite.pragma("table_info(items)") as { name: string }[]).map((column) => `"${column.name.replaceAll('"', '""')}"`).join(", ");
        sqlite.exec(`INSERT INTO items_nullable (${columns}) SELECT ${columns} FROM items; DROP TABLE items; ALTER TABLE items_nullable RENAME TO items;`);
        if (sequence) sqlite.prepare("UPDATE sqlite_sequence SET seq = ? WHERE name = 'items'").run(sequence.seq);
      }
      sqlite.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS items_url_unique ON items(url);
        CREATE INDEX IF NOT EXISTS items_created_at_idx ON items(created_at DESC);
        CREATE INDEX IF NOT EXISTS items_read_status_idx ON items(read_status);
        CREATE INDEX IF NOT EXISTS items_favorite_idx ON items(is_favorite);
      `);
      if ((sqlite.pragma("foreign_key_check") as unknown[]).length) throw new Error("Database migration would leave invalid references");
    })();
    sqlite.pragma("foreign_keys = ON");
  } catch (error) {
    sqlite.close();
    throw error;
  }
  return drizzle(sqlite, { schema });
}

export * from "./schema.js";
