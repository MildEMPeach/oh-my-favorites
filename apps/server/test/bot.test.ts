import assert from "node:assert/strict";
import test from "node:test";
import { processTelegramText } from "../src/bot.js";

test("Telegram ingestion enforces the single-user allowlist", async () => {
  let called = false;
  const reply = await processTelegramText(2, "https://example.com", 1, async () => {
    called = true;
    return { url: "https://example.com/" };
  });

  assert.equal(reply, "Unauthorized.");
  assert.equal(called, false);
});

test("Telegram ingestion extracts URL and trailing custom title", async () => {
  let savedUrl = "";
  let savedTitle: string | undefined;
  const reply = await processTelegramText(1, "read this https://example.com/a My article", 1, async (url, _source, title) => {
    savedUrl = url;
    savedTitle = title;
    return { url: new URL(url).toString(), title };
  });

  assert.equal(savedUrl, "https://example.com/a");
  assert.equal(savedTitle, "My article");
  assert.equal(reply, "Saved: https://example.com/a");
});

test("Telegram ingestion leaves title undefined when no title is supplied", async () => {
  let savedTitle: string | undefined = "unexpected";
  await processTelegramText(1, "https://example.com/a", 1, async (url, _source, title) => {
    savedTitle = title;
    return { url: new URL(url).toString(), title };
  });

  assert.equal(savedTitle, undefined);
});

test("Telegram ingestion handles messages without URLs", async () => {
  const reply = await processTelegramText(1, "nothing here", 1, async () => ({ url: "" }));
  assert.equal(reply, "Send me a URL to save it.");
});
