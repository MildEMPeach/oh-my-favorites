import cors from "@fastify/cors";
import Fastify from "fastify";
import { z, ZodError } from "zod";
import type { ItemService } from "./item-service.js";

export async function buildApp(items: ItemService, apiToken: string) {
  const app = Fastify({ logger: true });
  await app.register(cors, {
    origin: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: "invalid_request" });
    }
    request.log.error(error);
    return reply.code(500).send({ error: "internal_error" });
  });

  app.get("/health", async () => ({ ok: true }));

  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/")) return;
    if (request.headers.authorization !== `Bearer ${apiToken}`) {
      await reply.code(401).send({ error: "unauthorized" });
    }
  });

  app.get("/api/items", async (request) => {
    const query = z.object({
      status: z.enum(["unread", "read"]).optional(),
      favorite: z.enum(["true", "false"]).optional(),
      tag: z.string().min(1).optional()
    }).parse(request.query);

    return {
      items: await items.list({
        status: query.status,
        favorite: query.favorite === undefined ? undefined : query.favorite === "true",
        tag: query.tag
      })
    };
  });

  app.get("/api/items/:id", async (request, reply) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const item = await items.get(params.id);
    if (!item) return reply.code(404).send({ error: "not_found" });
    return item;
  });

  app.get("/api/tags", async () => ({ tags: await items.listTags() }));

  app.post("/api/items", async (request, reply) => {
    const body = z.object({
      url: z.string().refine((value) => {
        try {
          const parsed = new URL(value);
          return parsed.protocol === "http:" || parsed.protocol === "https:";
        } catch {
          return false;
        }
      }),
      title: z.string().trim().min(1).max(300).optional(),
      tags: z.array(z.string().trim().min(1).max(64)).max(30).optional()
    }).parse(request.body);
    const item = await items.create(body.url, "desktop", body.title);
    if (!item) return reply.code(500).send({ error: "internal_error" });
    for (const tag of body.tags ?? []) {
      await items.addTag(item.id, tag);
    }
    return reply.code(201).send(await items.get(item.id));
  });

  app.patch("/api/items/:id/read", async (request, reply) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = z.object({ read: z.boolean() }).parse(request.body);
    const item = await items.setRead(params.id, body.read);
    if (!item) return reply.code(404).send({ error: "not_found" });
    return item;
  });

  app.patch("/api/items/:id/favorite", async (request, reply) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = z.object({ favorite: z.boolean() }).parse(request.body);
    const item = await items.setFavorite(params.id, body.favorite);
    if (!item) return reply.code(404).send({ error: "not_found" });
    return item;
  });

  app.patch("/api/items/:id/title", async (request, reply) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = z.object({ title: z.string().trim().min(1).max(300) }).parse(request.body);
    const item = await items.setTitle(params.id, body.title);
    if (!item) return reply.code(404).send({ error: "not_found" });
    return item;
  });

  app.put("/api/items/:id/tags", async (request, reply) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = z.object({ tags: z.array(z.string().min(1).max(64)).max(30) }).parse(request.body);
    const item = await items.setTags(params.id, body.tags);
    if (!item) return reply.code(404).send({ error: "not_found" });
    return item;
  });

  app.post("/api/items/:id/tags", async (request, reply) => {
    const params = z.object({ id: z.coerce.number().int().positive() }).parse(request.params);
    const body = z.object({ tag: z.string().trim().min(1).max(64) }).parse(request.body);
    const item = await items.addTag(params.id, body.tag);
    if (!item) return reply.code(404).send({ error: "not_found" });
    return item;
  });

  app.delete("/api/items/:id/tags/:tagId", async (request, reply) => {
    const params = z.object({
      id: z.coerce.number().int().positive(),
      tagId: z.coerce.number().int().positive()
    }).parse(request.params);
    const item = await items.removeTag(params.id, params.tagId);
    if (!item) return reply.code(404).send({ error: "not_found" });
    return item;
  });

  return app;
}
