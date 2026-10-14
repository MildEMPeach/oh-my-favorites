import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { createDatabase } from "@oh-my-favorites/database";
import { sql } from "drizzle-orm";
import { buildApp } from "../src/app.js";
import { ItemService } from "../src/item-service.js";

const headers = { authorization: "Bearer library-test-token" };
async function fixture(t: TestContext) {
  const db = createDatabase(":memory:");
  const app = await buildApp(new ItemService(db), "library-test-token");
  t.after(() => app.close());
  return { app, db };
}

test("legacy database migration preserves IDs, states, tags and the autoincrement sequence", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "omf-migration-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = join(directory, "legacy.db");
  const Database = createRequire(new URL("../../../packages/database/package.json", import.meta.url))("better-sqlite3");
  const old = new Database(filename);
  old.exec(`CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT NOT NULL UNIQUE,
    title TEXT, description TEXT, favicon_url TEXT, source TEXT NOT NULL DEFAULT 'desktop',
    read_status TEXT NOT NULL DEFAULT 'unread', is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, read_at INTEGER, favorited_at INTEGER);
    CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
    CREATE TABLE item_tags (item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, UNIQUE(item_id, tag_id));
    INSERT INTO items VALUES (7, 'https://example.com/', 'Old note', NULL, NULL, 'telegram', 'read', 1, 1000, 2000, 3000);
    INSERT INTO items (id, url, created_at) VALUES (100, 'https://deleted.example/', 1000);
    DELETE FROM items WHERE id = 100;
    INSERT INTO tags VALUES (3, 'keep'); INSERT INTO item_tags VALUES (7, 3);`);
  old.close();
  for (let pass = 0; pass < 2; pass++) {
    const db = createDatabase(filename);
    const service = new ItemService(db);
    const item = await service.get(7);
    assert.equal(item?.url, "https://example.com/");
    assert.equal(item?.source, "telegram");
    assert.equal(item?.isFavorite, true);
    assert.equal(item?.readStatus, "read");
    assert.equal(item?.favoritedAt?.getTime(), 3000);
    assert.deepEqual(item?.tags, [{ id: 3, name: "keep" }]);
    assert.equal(item?.notes, "");
    assert.equal(item?.area, "inbox");
    const record = await service.createRecord({ title: "A favorite", url: `http://127.0.0.1/favorite-${pass}`, notes: "body", collection: null,
      contentDate: null });
    assert.ok(record!.id > 100);
    assert.equal(record?.isFavorite, true);
    assert.deepEqual(db.all(sql`PRAGMA foreign_key_check`), []);
    db.$client.close();
  }
});

test("web favorites keep notes and tags, and can return to Collected", async (t) => {
  const { app } = await fixture(t);
  const response = await app.inject({ method: "POST", url: "/api/records", headers, payload: { url: "http://127.0.0.1/favorite", title: "A favorite", notes: "Thoughts", collection: "CS", contentDate: "2026-10-14" } });
  assert.equal(response.statusCode, 201);
  const note = response.json(); assert.equal(note.isFavorite, true); assert.equal(note.readStatus, "unread");
  await app.inject({ method: "POST", url: `/api/items/${note.id}/tags`, headers, payload: { tag: "reading" } });
  const read = (await app.inject({ method: "PATCH", url: `/api/items/${note.id}/read`, headers, payload: { read: true } })).json();
  assert.equal(read.notes, "Thoughts"); assert.equal(read.tags[0].name, "reading");
  const unstarred = await app.inject({ method: "PATCH", url: `/api/items/${note.id}/favorite`, headers, payload: { favorite: false } });
  assert.equal(unstarred.json().area, "inbox");
  assert.equal((await app.inject({ url: "/api/items?view=inbox&tag=reading", headers })).json().items[0].id, note.id);
  assert.equal((await app.inject({ url: "/api/items?view=favorites", headers })).json().items.length, 0);
});

test("favorite input validates URLs and dates and rejects retired feature fields", async (t) => {
  const { app } = await fixture(t);
  const base = { title: "Page", url: "http://127.0.0.1/page" };
  for (const invalid of [{ url: null }, { url: "file:///tmp/private" }, { url: "javascript:alert(1)" }, { contentDate: "2026-02-30" }, { area: "gallery" }, { galleryTypeId: 1 }, { metadata: {} }]) {
    assert.equal((await app.inject({ method: "POST", url: "/api/records", headers, payload: { ...base, ...invalid } })).statusCode, 400);
  }
  assert.equal((await app.inject({ method: "POST", url: "/api/records", payload: base })).statusCode, 401);
  const item = (await app.inject({ method: "POST", url: "/api/records", headers, payload: base })).json();
  assert.equal((await app.inject({ method: "PATCH", url: `/api/items/${item.id}/details`, headers, payload: { notes: "updated" } })).statusCode, 200);
  for (const payload of [{}, { galleryTypeId: 1 }, { metadata: {} }]) assert.equal((await app.inject({ method: "PATCH", url: `/api/items/${item.id}/details`, headers, payload })).statusCode, 400);
  for (const [method, url] of [["GET", "/api/gallery-types"], ["POST", `/api/items/${item.id}/resources`], ["DELETE", `/api/items/${item.id}/resources/1`]] as const) assert.equal((await app.inject({ method, url, headers })).statusCode, 404);
  assert.equal((await app.inject({ url: "/api/items?view=gallery", headers })).statusCode, 400);
});

test("retired data remains intact on upgrade and is excluded from items, mutations and tags", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "omf-retired-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filename = join(directory, "previous.db");
  const Database = createRequire(new URL("../../../packages/database/package.json", import.meta.url))("better-sqlite3");
  const old = new Database(filename);
  old.exec(`CREATE TABLE items (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT UNIQUE, title TEXT,
    description TEXT, favicon_url TEXT, source TEXT NOT NULL DEFAULT 'desktop', read_status TEXT NOT NULL DEFAULT 'unread',
    is_favorite INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, read_at INTEGER, favorited_at INTEGER,
    area TEXT NOT NULL DEFAULT 'inbox' CHECK (area IN ('inbox', 'library', 'gallery')), notes TEXT NOT NULL DEFAULT '', collection TEXT, content_date TEXT,
    gallery_type_id INTEGER, metadata TEXT NOT NULL DEFAULT '{}');
    CREATE TABLE tags (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE);
    CREATE TABLE item_tags (item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE, tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE, UNIQUE(item_id, tag_id));
    CREATE TABLE gallery_types (id INTEGER PRIMARY KEY, name TEXT, fields TEXT);
    CREATE TABLE eagle_resources (id INTEGER PRIMARY KEY, item_id INTEGER REFERENCES items(id) ON DELETE CASCADE, eagle_id TEXT, library_path TEXT, name TEXT, ext TEXT);
    INSERT INTO items (id, url, title, created_at, area, gallery_type_id, metadata) VALUES (7, 'http://127.0.0.1/retired', 'Retired record', 1000, 'gallery', 1, '{"year":2026}');
    INSERT INTO items (id, url, title, created_at, area, is_favorite, notes) VALUES (8, 'http://127.0.0.1/active', 'Favorite', 1000, 'library', 1, 'Keep notes');
    INSERT INTO tags VALUES (1, 'retired-only'), (2, 'reading'); INSERT INTO item_tags VALUES (7, 1), (8, 2);
    INSERT INTO gallery_types VALUES (1, 'Records', '[]');
    INSERT INTO eagle_resources VALUES (1, 7, 'ASSET', '/Assets.library', 'Keep', 'png');`);
  const snapshots = new Map(["items", "tags", "item_tags", "gallery_types", "eagle_resources"].map((table) => [table, old.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()]));
  old.close();
  const db = createDatabase(filename);
  const app = await buildApp(new ItemService(db), "library-test-token");
  assert.deepEqual((await app.inject({ url: "/api/items", headers })).json().items.map((item: { id: number }) => item.id), [8]);
  assert.deepEqual((await app.inject({ url: "/api/tags", headers })).json().tags, [{ id: 2, name: "reading" }]);
  for (const [method, url, payload] of [
    ["GET", "/api/items/7", undefined], ["DELETE", "/api/items/7", undefined],
    ["PATCH", "/api/items/7/favorite", { favorite: true }], ["PATCH", "/api/items/7/read", { read: true }],
    ["PATCH", "/api/items/7/details", { notes: "change" }], ["POST", "/api/items/7/tags", { tag: "new" }]
  ] as const) assert.equal((await app.inject({ method, url, headers, payload })).statusCode, 404);
  assert.equal((await app.inject({ method: "POST", url: "/api/items", headers, payload: { url: "http://127.0.0.1/retired" } })).statusCode, 409);
  for (const [table, rows] of snapshots) assert.deepEqual(db.$client.prepare(`SELECT * FROM ${table} ORDER BY 1`).all(), rows);
  await app.close(); db.$client.close();
});
