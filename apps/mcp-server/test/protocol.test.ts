import assert from "node:assert/strict";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createRemoteMcpHttpServer } from "../src/http-server.js";

const ITEM = {
  id: 1,
  url: "https://example.com/agent-article",
  title: "Agent article",
  description: null,
  faviconUrl: null,
  source: "desktop",
  readStatus: "unread",
  isFavorite: false,
  createdAt: "2026-09-20T00:00:00.000Z",
  readAt: null,
  favoritedAt: null,
  tags: [
    { id: 1, name: "agent" },
    { id: 2, name: "research" }
  ]
};

test("stdio MCP server initializes, lists tools and calls save_url", async () => {
  const requests: { method: string; url: string; body?: unknown }[] = [];
  const api = createServer(async (req, res) => {
    let body: unknown = undefined;
    if (req.method !== "GET") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      if (chunks.length > 0) body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
    requests.push({ method: req.method ?? "GET", url: req.url ?? "/", body });

    if (req.headers.authorization !== "Bearer protocol-test-token") {
      return sendJson(res, 401, { error: "unauthorized" });
    }
    if (req.method === "POST" && req.url === "/api/items") return sendJson(res, 201, ITEM);
    if (req.method === "GET" && req.url === "/api/items/1") return sendJson(res, 200, ITEM);
    if (req.method === "GET" && req.url === "/api/tags") return sendJson(res, 200, { tags: ITEM.tags });
    return sendJson(res, 404, { error: "not_found" });
  });

  await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
  const address = api.address();
  assert.ok(address && typeof address === "object");

  const serverPath = fileURLToPath(new URL("../dist/index.js", import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: {
      OMF_BASE_URL: `http://127.0.0.1:${address.port}`,
      OMF_API_TOKEN: "protocol-test-token"
    },
    stderr: "pipe"
  });
  const client = new Client({ name: "omf-test-client", version: "0.1.0" });

  try {
    await client.connect(transport);
    const version = client.getServerVersion();
    assert.equal(version?.name, "oh-my-favorites");

    const tools = await client.listTools();
    const names = tools.tools.map((tool) => tool.name).sort();
    assert.deepEqual(names, [
      "add_tags",
      "get_item",
      "list_items",
      "list_tags",
      "remove_tags",
      "save_url",
      "update_item"
    ]);

    const result = await client.callTool({
      name: "save_url",
      arguments: {
        url: ITEM.url,
        title: ITEM.title,
        tags: ["agent", "research"]
      }
    });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent?.id, 1);
    assert.equal(result.structuredContent?.title, "Agent article");

    const post = requests.find((request) => request.method === "POST" && request.url === "/api/items");
    assert.deepEqual(post?.body, {
      url: ITEM.url,
      title: ITEM.title,
      tags: ["agent", "research"]
    });
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => api.close((error) => (error ? reject(error) : resolve())));
  }
});

test("remote Streamable HTTP MCP authenticates, creates a session and calls save_url", async () => {
  const requests: { method: string; url: string; body?: unknown }[] = [];
  const api = createServer(async (req, res) => {
    let body: unknown = undefined;
    if (req.method !== "GET") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      if (chunks.length > 0) body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    }
    requests.push({ method: req.method ?? "GET", url: req.url ?? "/", body });

    if (req.headers.authorization !== "Bearer protocol-test-token") {
      return sendJson(res, 401, { error: "unauthorized" });
    }
    if (req.method === "POST" && req.url === "/api/items") return sendJson(res, 201, ITEM);
    if (req.method === "GET" && req.url === "/api/items/1") return sendJson(res, 200, ITEM);
    if (req.method === "GET" && req.url === "/api/tags") return sendJson(res, 200, { tags: ITEM.tags });
    return sendJson(res, 404, { error: "not_found" });
  });
  await new Promise<void>((resolve) => api.listen(0, "127.0.0.1", resolve));
  const apiAddress = api.address();
  assert.ok(apiAddress && typeof apiAddress === "object");

  const remote = createRemoteMcpHttpServer({
    baseUrl: `http://127.0.0.1:${apiAddress.port}`,
    apiToken: "protocol-test-token",
    mcpToken: "remote-mcp-token"
  });
  await new Promise<void>((resolve) => remote.listen(0, "127.0.0.1", resolve));
  const remoteAddress = remote.address();
  assert.ok(remoteAddress && typeof remoteAddress === "object");
  const endpoint = `http://127.0.0.1:${remoteAddress.port}/mcp`;

  const unauthorized = await fetch(endpoint);
  assert.equal(unauthorized.status, 401);

  const transport = new StreamableHTTPClientTransport(new URL(endpoint), {
    requestInit: {
      headers: { authorization: "Bearer remote-mcp-token" }
    }
  });
  const client = new Client({ name: "omf-http-test-client", version: "0.1.0" });

  try {
    await client.connect(transport);
    assert.ok(transport.sessionId);
    assert.equal(client.getServerVersion()?.name, "oh-my-favorites");

    const tools = await client.listTools();
    assert.ok(tools.tools.some((tool) => tool.name === "save_url"));

    const result = await client.callTool({
      name: "save_url",
      arguments: {
        url: ITEM.url,
        title: ITEM.title,
        tags: ["agent", "research"]
      }
    });
    assert.equal(result.isError, undefined);
    assert.equal(result.structuredContent?.id, 1);

    const post = requests.find((request) => request.method === "POST" && request.url === "/api/items");
    assert.deepEqual(post?.body, {
      url: ITEM.url,
      title: ITEM.title,
      tags: ["agent", "research"]
    });
  } finally {
    await client.close();
    await new Promise<void>((resolve, reject) => remote.close((error) => (error ? reject(error) : resolve())));
    await new Promise<void>((resolve, reject) => api.close((error) => (error ? reject(error) : resolve())));
  }
});

function sendJson(res: import("node:http").ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}
