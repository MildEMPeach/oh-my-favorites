import assert from "node:assert/strict";
import test from "node:test";
import { createDatabase } from "@oh-my-favorites/database";
import { buildApp } from "../src/app.js";
import { ItemService } from "../src/item-service.js";

const TOKEN = "test-api-token";

async function createFixture() {
  const db = createDatabase(":memory:");
  const service = new ItemService(db);
  const app = await buildApp(service, TOKEN);
  return { app };
}

test("API rejects requests without the bearer token", async () => {
  const { app } = await createFixture();
  const response = await app.inject({ method: "GET", url: "/api/items" });
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.json(), { error: "unauthorized" });
  await app.close();
});

test("item lifecycle supports read, favorite, tags and filtering", async () => {
  const { app } = await createFixture();
  const headers = { authorization: `Bearer ${TOKEN}` };

  const createdResponse = await app.inject({
    method: "POST",
    url: "/api/items",
    headers,
    payload: { url: "http://127.0.0.1/article" }
  });
  assert.equal(createdResponse.statusCode, 201);
  const created = createdResponse.json();
  assert.equal(created.readStatus, "unread");
  assert.equal(created.isFavorite, false);

  const readResponse = await app.inject({
    method: "PATCH",
    url: `/api/items/${created.id}/read`,
    headers,
    payload: { read: true }
  });
  assert.equal(readResponse.statusCode, 200);
  assert.equal(readResponse.json().readStatus, "read");

  const favoriteResponse = await app.inject({
    method: "PATCH",
    url: `/api/items/${created.id}/favorite`,
    headers,
    payload: { favorite: true }
  });
  assert.equal(favoriteResponse.statusCode, 200);
  assert.equal(favoriteResponse.json().isFavorite, true);

  const tagsResponse = await app.inject({
    method: "PUT",
    url: `/api/items/${created.id}/tags`,
    headers,
    payload: { tags: ["research", "backend", "research"] }
  });
  assert.equal(tagsResponse.statusCode, 200);
  assert.deepEqual(tagsResponse.json().tags.map((tag: { name: string }) => tag.name), ["backend", "research"]);

  const listResponse = await app.inject({
    method: "GET",
    url: "/api/items?favorite=true&tag=research",
    headers
  });
  assert.equal(listResponse.statusCode, 200);
  const list = listResponse.json();
  assert.equal(list.items.length, 1);
  assert.equal(list.items[0].id, created.id);

  const tagsListResponse = await app.inject({ method: "GET", url: "/api/tags", headers });
  assert.deepEqual(tagsListResponse.json().tags.map((tag: { name: string }) => tag.name), ["backend", "research"]);

  await app.close();
});
