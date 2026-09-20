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

test("Telegram ingestion extracts and saves the first URL", async () => {
  let savedUrl = "";
  const reply = await processTelegramText(1, "read this https://example.com/a later", 1, async (url) => {
    savedUrl = url;
    return { url: new URL(url).toString() };
  });

  assert.equal(savedUrl, "https://example.com/a");
  assert.equal(reply, "Saved: https://example.com/a");
});

test("Telegram ingestion handles messages without URLs", async () => {
  const reply = await processTelegramText(1, "nothing here", 1, async () => ({ url: "" }));
  assert.equal(reply, "Send me a URL to save it.");
});
