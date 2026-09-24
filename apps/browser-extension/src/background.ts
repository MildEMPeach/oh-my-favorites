import { savePage } from "./api.js";
import { getConfig } from "./config.js";

const HTTP_PROTOCOLS = new Set(["http:", "https:"]);

chrome.runtime.onInstalled.addListener(() => {
  void ensureConfigured();
});

chrome.action.onClicked.addListener((tab) => {
  void saveCurrentTab(tab);
});

async function ensureConfigured() {
  const config = await getConfig();
  if (!config.apiToken) await chrome.runtime.openOptionsPage();
}

async function saveCurrentTab(tab: ChromeTab) {
  try {
    const config = await getConfig();
    if (!config.apiToken) {
      await chrome.runtime.openOptionsPage();
      throw new Error("Configure Oh My Favorites first.");
    }

    if (!tab.url) throw new Error("This tab has no URL.");
    const url = new URL(tab.url);
    if (!HTTP_PROTOCOLS.has(url.protocol)) throw new Error("Only web pages can be saved.");

    await showBadge("…", "Saving to Oh My Favorites…");
    const item = await savePage(config, tab.url, tab.title);
    await showBadge("✓", `Saved: ${item.title ?? item.url}`);
    scheduleBadgeReset();
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Save failed.";
    await showBadge("!", message);
    scheduleBadgeReset(3500);
  }
}

async function showBadge(text: string, title: string) {
  await Promise.all([
    chrome.action.setBadgeText({ text }),
    chrome.action.setTitle({ title })
  ]);
}

function scheduleBadgeReset(delay = 1800) {
  setTimeout(() => {
    void Promise.all([
      chrome.action.setBadgeText({ text: "" }),
      chrome.action.setTitle({ title: "Save to Oh My Favorites" })
    ]);
  }, delay);
}
