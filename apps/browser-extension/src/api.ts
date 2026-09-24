import type { ExtensionConfig } from "./config.js";

interface SavedItem {
  id: number;
  title: string | null;
  url: string;
}

async function request<T>(config: ExtensionConfig, path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${config.apiToken}`,
        ...(init?.body === undefined ? {} : { "Content-Type": "application/json" }),
        ...init?.headers
      }
    });
  } catch {
    throw new Error(`Cannot reach ${config.apiUrl}`);
  }

  if (!response.ok) {
    if (response.status === 401) throw new Error("Invalid API token.");
    throw new Error(`Server returned ${response.status}.`);
  }
  return response.json() as Promise<T>;
}

export function savePage(config: ExtensionConfig, url: string, title?: string) {
  return request<SavedItem>(config, "/api/items", {
    method: "POST",
    body: JSON.stringify({
      url,
      title: title?.trim() || undefined
    })
  });
}

export function testConnection(config: ExtensionConfig) {
  return request<{ tags: unknown[] }>(config, "/api/tags");
}
