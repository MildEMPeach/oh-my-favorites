import assert from "node:assert/strict";
import test from "node:test";
import { OmfApiClient } from "../src/client.js";

const BASE_ITEM = {
  id: 7,
  url: "https://example.com/article",
  title: "Article",
  description: null,
  faviconUrl: null,
  source: "desktop" as const,
  readStatus: "unread" as const,
  isFavorite: false,
  createdAt: "2026-09-20T00:00:00.000Z",
  readAt: null,
  favoritedAt: null,
  tags: [{ id: 1, name: "research" }]
};

test("saveUrl sends MCP source, custom title and tags", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fakeFetch: typeof fetch = async (input, init) => {
    calls.push({ url: String(input), init });
    if (String(input).endsWith("/api/items") && init?.method === "POST") {
      return jsonResponse(BASE_ITEM, 201);
    }
    if (String(input).endsWith("/api/items/7")) return jsonResponse(BASE_ITEM);
    throw new Error(`Unexpected request: ${String(input)}`);
  };

  const client = new OmfApiClient("http://omf.local/", "secret", fakeFetch);
  const item = await client.saveUrl({
    url: BASE_ITEM.url,
    title: "Agent title",
    tags: ["research", "agent"]
  });

  assert.equal(item.id, 7);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "http://omf.local/api/items");
  assert.equal(new Headers(calls[0].init?.headers).get("authorization"), "Bearer secret");
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
    url: BASE_ITEM.url,
    title: "Agent title",
    tags: ["research", "agent"]
  });
  assert.equal(calls.some((call) => call.url.endsWith("/read")), false);
});

test("removeTags resolves names to tag IDs and preserves other tags", async () => {
  const calls: string[] = [];
  const item = {
    ...BASE_ITEM,
    tags: [
      { id: 1, name: "research" },
      { id: 2, name: "agent" }
    ]
  };
  const afterDelete = { ...item, tags: [{ id: 1, name: "research" }] };
  const fakeFetch: typeof fetch = async (input, init) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url}`);
    if (url.endsWith("/api/items/7") && (init?.method ?? "GET") === "GET") return jsonResponse(item);
    if (url.endsWith("/api/items/7/tags/2") && init?.method === "DELETE") return jsonResponse(afterDelete);
    throw new Error(`Unexpected request: ${url}`);
  };

  const client = new OmfApiClient("http://omf.local", "secret", fakeFetch);
  const result = await client.removeTags(7, ["AGENT", "missing"]);
  assert.deepEqual(result.tags, [{ id: 1, name: "research" }]);
  assert.deepEqual(calls, ["GET http://omf.local/api/items/7", "DELETE http://omf.local/api/items/7/tags/2"]);
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}
