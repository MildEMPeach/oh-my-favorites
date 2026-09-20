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

test("CORS preflight allows desktop mutation methods", async () => {
  const { app } = await createFixture();

  for (const method of ["PATCH", "PUT"]) {
    const response = await app.inject({
      method: "OPTIONS",
      url: "/api/items/1/favorite",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": method,
        "access-control-request-headers": "authorization,content-type"
      }
    });

    assert.equal(response.statusCode, 204);
    const allowed = response.headers["access-control-allow-methods"] ?? "";
    assert.match(allowed, new RegExp(`(?:^|,\\s*)${method}(?:,|$)`));
    assert.equal(response.headers["access-control-allow-origin"], "http://localhost:5173");
  }

  await app.close();
});

test("API returns 400 for invalid input and 404 for missing items", async () => {
  const { app } = await createFixture();
  const headers = { authorization: `Bearer ${TOKEN}` };

  for (const url of ["not a url", "ftp://example.com/file"]) {
    const response = await app.inject({
      method: "POST",
      url: "/api/items",
      headers,
      payload: { url }
    });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { error: "invalid_request" });
  }

  const invalidQuery = await app.inject({
    method: "GET",
    url: "/api/items?favorite=yes",
    headers
  });
  assert.equal(invalidQuery.statusCode, 400);
  assert.deepEqual(invalidQuery.json(), { error: "invalid_request" });

  const invalidId = await app.inject({
    method: "PATCH",
    url: "/api/items/not-a-number/read",
    headers,
    payload: { read: true }
  });
  assert.equal(invalidId.statusCode, 400);
  assert.deepEqual(invalidId.json(), { error: "invalid_request" });

  const missingRead = await app.inject({
    method: "PATCH",
    url: "/api/items/999/read",
    headers,
    payload: { read: true }
  });
  assert.equal(missingRead.statusCode, 404);
  assert.deepEqual(missingRead.json(), { error: "not_found" });

  const missingFavorite = await app.inject({
    method: "PATCH",
    url: "/api/items/999/favorite",
    headers,
    payload: { favorite: true }
  });
  assert.equal(missingFavorite.statusCode, 404);
  assert.deepEqual(missingFavorite.json(), { error: "not_found" });

  const missingTitle = await app.inject({
    method: "PATCH",
    url: "/api/items/999/title",
    headers,
    payload: { title: "Renamed item" }
  });
  assert.equal(missingTitle.statusCode, 404);
  assert.deepEqual(missingTitle.json(), { error: "not_found" });

  const invalidTitle = await app.inject({
    method: "PATCH",
    url: "/api/items/999/title",
    headers,
    payload: { title: "   " }
  });
  assert.equal(invalidTitle.statusCode, 400);
  assert.deepEqual(invalidTitle.json(), { error: "invalid_request" });

  const missingTags = await app.inject({
    method: "PUT",
    url: "/api/items/999/tags",
    headers,
    payload: { tags: ["research"] }
  });
  assert.equal(missingTags.statusCode, 404);
  assert.deepEqual(missingTags.json(), { error: "not_found" });

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

  const titleResponse = await app.inject({
    method: "PATCH",
    url: `/api/items/${created.id}/title`,
    headers,
    payload: { title: "My renamed article" }
  });
  assert.equal(titleResponse.statusCode, 200);
  assert.equal(titleResponse.json().title, "My renamed article");

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
  assert.equal(list.items[0].title, "My renamed article");

  const tagsListResponse = await app.inject({ method: "GET", url: "/api/tags", headers });
  assert.deepEqual(tagsListResponse.json().tags.map((tag: { name: string }) => tag.name), ["backend", "research"]);

  await app.close();
});
