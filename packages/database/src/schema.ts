import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const items = sqliteTable("items", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  url: text("url").notNull(),
  title: text("title"),
  description: text("description"),
  faviconUrl: text("favicon_url"),
  source: text("source", { enum: ["telegram", "desktop"] }).notNull().default("desktop"),
  readStatus: text("read_status", { enum: ["unread", "read"] }).notNull().default("unread"),
  isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(false),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  readAt: integer("read_at", { mode: "timestamp_ms" }),
  favoritedAt: integer("favorited_at", { mode: "timestamp_ms" })
}, (table) => [
  uniqueIndex("items_url_unique").on(table.url)
]);

export const tags = sqliteTable("tags", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull()
}, (table) => [
  uniqueIndex("tags_name_unique").on(table.name)
]);

export const itemTags = sqliteTable("item_tags", {
  itemId: integer("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
  tagId: integer("tag_id").notNull().references(() => tags.id, { onDelete: "cascade" })
}, (table) => [
  uniqueIndex("item_tags_unique").on(table.itemId, table.tagId)
]);
