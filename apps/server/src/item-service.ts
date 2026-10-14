import { and, asc, desc, eq, inArray, notExists } from "drizzle-orm";
import type { LibraryFields } from "@oh-my-favorites/shared";
import type { FavoritesDatabase } from "@oh-my-favorites/database";
import { itemTags, items, tags } from "@oh-my-favorites/database";
import { fetchUrlMetadata } from "./metadata.js";

// Retain retired records in existing databases without exposing them through this app.
const activeItems = inArray(items.area, ["inbox", "library"]);

export class ItemService {
  constructor(private readonly db: FavoritesDatabase) {}

  async create(url: string, source: "telegram" | "desktop", title?: string) {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only http(s) URLs are supported");
    }
    const normalized = parsed.toString();
    const normalizedTitle = title?.trim() || normalized;
    const now = new Date();
    const inserted = await this.db.insert(items).values({
      url: normalized,
      title: normalizedTitle,
      source,
      createdAt: now
    }).onConflictDoNothing({ target: items.url }).returning();

    if (inserted[0]) {
      try {
        const metadata = await fetchUrlMetadata(normalized);
        const enriched = await this.db.update(items).set({
          description: metadata.description,
          faviconUrl: metadata.faviconUrl
        }).where(eq(items.id, inserted[0].id)).returning();
        return { ...(enriched[0] ?? inserted[0]), url: normalized };
      } catch {
        return { ...inserted[0], url: normalized };
      }
    }
    const existing = await this.db.select().from(items).where(and(eq(items.url, normalized), activeItems)).limit(1);
    if (existing[0] && title?.trim()) {
      const renamed = await this.db.update(items).set({ title: title.trim() }).where(eq(items.id, existing[0].id)).returning();
      return { ...(renamed[0] ?? existing[0]), url: normalized };
    }
    // shortcut: archived URLs keep their unique reservation until legacy data is moved to its own database.
    if (!existing[0]) return undefined;
    return { ...existing[0], url: normalized };
  }

  async createRecord(input: LibraryFields & { title: string; url: string }) {
    const now = new Date();
    const created = this.db.insert(items).values({
      ...input, url: new URL(input.url).toString(), area: "library",
      source: "desktop", createdAt: now, isFavorite: true, favoritedAt: now
    }).onConflictDoNothing({ target: items.url }).returning().get();
    return created ? this.get(created.id) : undefined;
  }

  async setDetails(id: number, input: Partial<LibraryFields> & { title?: string }) {
    const updated = this.db.update(items).set(input).where(and(eq(items.id, id), activeItems)).returning().get();
    return updated ? this.get(id) : undefined;
  }

  async get(id: number) {
    const rows = await this.db.select().from(items).where(and(eq(items.id, id), activeItems)).limit(1);
    if (!rows[0]) return undefined;
    return (await this.attachTags(rows))[0];
  }

  async delete(id: number) {
    return this.db.transaction((tx) => {
      const deleted = tx.delete(items).where(and(eq(items.id, id), activeItems)).returning({ id: items.id }).get();
      if (deleted) {
        tx.delete(tags).where(notExists(
          tx.select().from(itemTags).where(eq(itemTags.tagId, tags.id))
        )).run();
      }
      return deleted;
    });
  }

  async list(filters: { status?: "unread" | "read"; favorite?: boolean; tag?: string; view?: "inbox" | "favorites" }) {
    const predicates = [activeItems];
    if (filters.status) predicates.push(eq(items.readStatus, filters.status));
    if (filters.favorite !== undefined) predicates.push(eq(items.isFavorite, filters.favorite));
    if (filters.view === "inbox") predicates.push(eq(items.area, "inbox"));
    if (filters.view === "favorites") predicates.push(eq(items.isFavorite, true));

    const rows = await this.db.select().from(items)
      .where(predicates.length ? and(...predicates) : undefined)
      .orderBy(desc(items.createdAt));

    const withTags = await this.attachTags(rows);
    if (!filters.tag) return withTags;
    const normalizedTag = filters.tag.trim().toLocaleLowerCase();
    return withTags.filter((item) => item.tags.some((tag) => tag.name.toLocaleLowerCase() === normalizedTag));
  }

  async listTags() {
    return this.db.selectDistinct({ id: tags.id, name: tags.name }).from(tags)
      .innerJoin(itemTags, eq(itemTags.tagId, tags.id))
      .innerJoin(items, eq(items.id, itemTags.itemId))
      .where(activeItems).orderBy(asc(tags.name));
  }

  async setTags(itemId: number, names: string[]) {
    const item = await this.db.select().from(items).where(and(eq(items.id, itemId), activeItems)).limit(1);
    if (!item[0]) return undefined;

    const normalizedNames = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
    await this.db.delete(itemTags).where(eq(itemTags.itemId, itemId));

    for (const name of normalizedNames) {
      await this.db.insert(tags).values({ name }).onConflictDoNothing({ target: tags.name });
      const tag = await this.db.select().from(tags).where(eq(tags.name, name)).limit(1);
      if (tag[0]) {
        await this.db.insert(itemTags).values({ itemId, tagId: tag[0].id }).onConflictDoNothing();
      }
    }

    await this.deleteUnusedTags();

    return (await this.attachTags(item))[0];
  }

  async addTag(itemId: number, name: string) {
    const item = await this.db.select().from(items).where(and(eq(items.id, itemId), activeItems)).limit(1);
    if (!item[0]) return undefined;

    const normalizedName = name.trim();
    await this.db.insert(tags).values({ name: normalizedName }).onConflictDoNothing({ target: tags.name });
    const tag = await this.db.select().from(tags).where(eq(tags.name, normalizedName)).limit(1);
    if (tag[0]) {
      await this.db.insert(itemTags).values({ itemId, tagId: tag[0].id }).onConflictDoNothing();
    }

    return (await this.attachTags(item))[0];
  }

  async removeTag(itemId: number, tagId: number) {
    const item = await this.db.select().from(items).where(and(eq(items.id, itemId), activeItems)).limit(1);
    if (!item[0]) return undefined;

    await this.db.delete(itemTags).where(and(eq(itemTags.itemId, itemId), eq(itemTags.tagId, tagId)));
    await this.deleteUnusedTags();
    return (await this.attachTags(item))[0];
  }

  async setRead(id: number, read: boolean) {
    const now = read ? new Date() : null;
    const rows = await this.db.update(items).set({
      readStatus: read ? "read" : "unread",
      readAt: now
    }).where(and(eq(items.id, id), activeItems)).returning();
    return rows[0] ? this.get(id) : undefined;
  }

  async setFavorite(id: number, favorite: boolean) {
    const rows = await this.db.update(items).set({
      isFavorite: favorite,
      favoritedAt: favorite ? new Date() : null,
      ...(!favorite ? { area: "inbox" as const } : {})
    }).where(and(eq(items.id, id), activeItems)).returning();
    return rows[0] ? this.get(id) : undefined;
  }

  async setTitle(id: number, title: string) {
    const rows = await this.db.update(items).set({
      title: title.trim()
    }).where(and(eq(items.id, id), activeItems)).returning();
    return rows[0] ? this.get(id) : undefined;
  }

  private async deleteUnusedTags() {
    const allTags = await this.db.select({ id: tags.id }).from(tags);
    if (allTags.length === 0) return;

    const relations = await this.db.select({ tagId: itemTags.tagId }).from(itemTags);
    const usedTagIds = new Set(relations.map((relation) => relation.tagId));
    const unusedTagIds = allTags.map((tag) => tag.id).filter((id) => !usedTagIds.has(id));
    if (unusedTagIds.length > 0) {
      await this.db.delete(tags).where(inArray(tags.id, unusedTagIds));
    }
  }

  private async attachTags(rows: (typeof items.$inferSelect)[]) {
    if (rows.length === 0) return [];

    const relations = await this.db
      .select({ itemId: itemTags.itemId, id: tags.id, name: tags.name })
      .from(itemTags)
      .innerJoin(tags, eq(itemTags.tagId, tags.id))
      .where(inArray(itemTags.itemId, rows.map((row) => row.id)))
      .orderBy(asc(tags.name));

    const byItem = new Map<number, { id: number; name: string }[]>();
    for (const relation of relations) {
      const current = byItem.get(relation.itemId) ?? [];
      current.push({ id: relation.id, name: relation.name });
      byItem.set(relation.itemId, current);
    }

    return rows.map((row) => ({ ...row, tags: byItem.get(row.id) ?? [] }));
  }
}
