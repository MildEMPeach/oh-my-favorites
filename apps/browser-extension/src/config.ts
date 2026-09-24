export interface ExtensionConfig {
  apiUrl: string;
  apiToken: string;
}

export const DEFAULT_API_URL = "http://localhost:8787";

export async function getConfig(): Promise<ExtensionConfig> {
  const stored = await chrome.storage.local.get(["apiUrl", "apiToken"]);
  return {
    apiUrl: typeof stored.apiUrl === "string" && stored.apiUrl.trim()
      ? stored.apiUrl.replace(/\/+$/, "")
      : DEFAULT_API_URL,
    apiToken: typeof stored.apiToken === "string" ? stored.apiToken : ""
  };
}

export async function saveConfig(config: ExtensionConfig) {
  await chrome.storage.local.set({
    apiUrl: config.apiUrl.replace(/\/+$/, ""),
    apiToken: config.apiToken
  });
}

export function validateApiUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Server URL must use http or https.");
  }
  return url.toString().replace(/\/+$/, "");
}
