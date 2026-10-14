import type { ItemDto, LibraryFields } from "@oh-my-favorites/shared";
export type Item = ItemDto;

const DEFAULT_API_URL = "http://localhost:8787";

export function getConnectionConfig() {
  return {
    apiUrl: localStorage.getItem("apiUrl") ?? DEFAULT_API_URL,
    apiToken: localStorage.getItem("apiToken") ?? ""
  };
}

export async function addItemTag(id: number, tag: string) {
  return request<Item>(`/api/items/${id}/tags`, {
    method: "POST",
    body: JSON.stringify({ tag })
  });
}

export async function removeItemTag(id: number, tagId: number) {
  return request<Item>(`/api/items/${id}/tags/${tagId}`, {
    method: "DELETE"
  });
}

export function saveConnectionConfig(apiUrl: string, apiToken: string) {
  localStorage.setItem("apiUrl", apiUrl.replace(/\/+$/, ""));
  localStorage.setItem("apiToken", apiToken);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { apiUrl, apiToken } = getConnectionConfig();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiToken}`
  };
  if (init?.body !== undefined) headers["Content-Type"] = "application/json";

  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      ...init,
      headers: {
        ...headers,
        ...init?.headers
      }
    });
  } catch {
    throw new Error(`Cannot reach server at ${apiUrl}`);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ? `${body.error} (${response.status})` : `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function listItems(filter: "all" | "unread" | "favorites" | "tagged", tag?: string) {
  const params = new URLSearchParams();
  if (filter === "unread") params.set("status", "unread");
  if (filter === "favorites") params.set("favorite", "true");
  if (filter !== "tagged") params.set("view", filter === "favorites" ? "favorites" : "inbox");
  if (tag) params.set("tag", tag);
  const query = params.size ? `?${params.toString()}` : "";
  const result = await request<{ items: Item[] }>(`/api/items${query}`);
  if (!Array.isArray(result.items)) throw new Error("Server returned an invalid item list");
  if (result.items.some((item) => !["inbox", "library"].includes(item.area) || typeof item.notes !== "string" || !Array.isArray(item.tags))) {
    throw new Error("Server is outdated. Update the server to use favorites and notes.");
  }
  return result;
}

export async function listTags() {
  return request<{ tags: { id: number; name: string }[] }>("/api/tags");
}

export async function setReadStatus(id: number, read: boolean) {
  return request<Item>(`/api/items/${id}/read`, {
    method: "PATCH",
    body: JSON.stringify({ read })
  });
}

export async function markRead(id: number) {
  return setReadStatus(id, true);
}

export async function toggleFavorite(id: number, favorite: boolean) {
  return request<Item>(`/api/items/${id}/favorite`, {
    method: "PATCH",
    body: JSON.stringify({ favorite })
  });
}

export async function renameItem(id: number, title: string) {
  return request<Item>(`/api/items/${id}/title`, {
    method: "PATCH",
    body: JSON.stringify({ title })
  });
}

export async function deleteItem(id: number) {
  return request<{ ok: true }>(`/api/items/${id}`, { method: "DELETE" });
}

export function createRecord(input: LibraryFields & { title: string; url: string }) {
  return request<Item>("/api/records", { method: "POST", body: JSON.stringify(input) });
}

export function saveDetails(id: number, input: Partial<LibraryFields> & { title?: string }) {
  return request<Item>(`/api/items/${id}/details`, { method: "PATCH", body: JSON.stringify(input) });
}

export async function setItemTags(id: number, tags: string[]) {
  return request<Item>(`/api/items/${id}/tags`, {
    method: "PUT",
    body: JSON.stringify({ tags })
  });
}

export async function testConnection() {
  return request<{ tags: { id: number; name: string }[] }>("/api/tags");
}
