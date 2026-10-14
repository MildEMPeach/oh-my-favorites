import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function api(fetch) {
  const source = readFileSync(new URL("../src/renderer/src/api.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
  const exports = {};
  runInNewContext(outputText, { exports, fetch, Error, URLSearchParams, localStorage: { getItem: () => null } });
  return exports;
}

test("favorites request their view while tag browsing searches all active items", async () => {
  const urls = [];
  const client = api(async (url) => { urls.push(new URL(url)); return Response.json({ items: [] }); });
  await client.listItems("favorites");
  await client.listItems("tagged", "reading");
  assert.equal(urls[0].searchParams.get("view"), "favorites");
  assert.equal(urls[1].searchParams.has("view"), false);
  assert.equal(urls[1].searchParams.get("tag"), "reading");
});

test("old server responses report an upgrade message for favorite notes", async () => {
  const client = api(async () => Response.json({ items: [{ id: 1, title: "Page", url: "https://example.com/" }] }));
  await assert.rejects(client.listItems("favorites"), /Server is outdated/);
});
