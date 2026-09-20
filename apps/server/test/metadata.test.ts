import assert from "node:assert/strict";
import test from "node:test";
import { isBlockedIp, parseMetadata, resolvePublicAddress } from "../src/metadata.js";

test("blocks private, loopback, link-local and reserved addresses", () => {
  for (const address of [
    "127.0.0.1",
    "10.0.0.1",
    "172.16.0.1",
    "192.168.1.1",
    "169.254.1.1",
    "198.51.100.1",
    "203.0.113.1",
    "0.0.0.0",
    "::1",
    "::ffff:7f00:1",
    "fc00::1",
    "fe80::1",
    "2001:db8::1"
  ]) {
    assert.equal(isBlockedIp(address), true, address);
  }

  assert.equal(isBlockedIp("8.8.8.8"), false);
  assert.equal(isBlockedIp("2606:4700:4700::1111"), false);
});

test("rejects localhost before making a metadata request", async () => {
  await assert.rejects(() => resolvePublicAddress("localhost"), /Local addresses are not allowed/);
});

test("parses title, description and favicon", () => {
  const metadata = parseMetadata(`
    <html>
      <head>
        <title>Fallback title</title>
        <meta property="og:title" content="A &amp; B">
        <meta name="description" content="Example description">
        <link rel="shortcut icon" href="/favicon.png">
      </head>
    </html>
  `, new URL("https://example.com/articles/1"));

  assert.deepEqual(metadata, {
    title: "A & B",
    description: "Example description",
    faviconUrl: "https://example.com/favicon.png"
  });
});
