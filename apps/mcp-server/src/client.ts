import type { ItemDto, ItemListResponse, TagDto } from "@oh-my-favorites/shared";

export interface SaveUrlInput {
  url: string;
  title?: string;
  tags?: string[];
  read?: boolean;
  favorite?: boolean;
}

export interface ListItemsInput {
  status?: "unread" | "read";
  favorite?: boolean;
  tag?: string;
}

export interface UpdateItemInput {
  id: number;
  title?: string;
  read?: boolean;
  favorite?: boolean;
}

type FetchLike = typeof fetch;

export class OmfApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: unknown
  ) {
    super(message);
    this.name = "OmfApiError";
  }
}

export class OmfApiClient {
  private readonly baseUrl: string;

  constructor(
    baseUrl: string,
    private readonly token: string,
    private readonly fetchImpl: FetchLike = fetch
  ) {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async health() {
    return this.request<{ ok: boolean }>("/health", { authenticated: false });
  }

  async saveUrl(input: SaveUrlInput): Promise<ItemDto> {
    let item = await this.request<ItemDto>("/api/items", {
      method: "POST",
      body: {
        url: input.url,
        title: input.title,
        tags: input.tags
      }
    });

    if (input.read !== undefined) {
      item = await this.request<ItemDto>(`/api/items/${item.id}/read`, {
        method: "PATCH",
        body: { read: input.read }
      });
    }
    if (input.favorite !== undefined) {
      item = await this.request<ItemDto>(`/api/items/${item.id}/favorite`, {
        method: "PATCH",
        body: { favorite: input.favorite }
      });
    }

    return this.getItem(item.id);
  }

  getItem(id: number) {
    return this.request<ItemDto>(`/api/items/${id}`);
  }

  async listItems(filters: ListItemsInput = {}) {
    const query = new URLSearchParams();
    if (filters.status) query.set("status", filters.status);
    if (filters.favorite !== undefined) query.set("favorite", String(filters.favorite));
    if (filters.tag?.trim()) query.set("tag", filters.tag.trim());
    const suffix = query.size > 0 ? `?${query.toString()}` : "";
    return this.request<ItemListResponse>(`/api/items${suffix}`);
  }

  async listTags() {
    return this.request<{ tags: TagDto[] }>("/api/tags");
  }

  async updateItem(input: UpdateItemInput): Promise<ItemDto> {
    const changes = [input.title !== undefined, input.read !== undefined, input.favorite !== undefined];
    if (!changes.some(Boolean)) throw new Error("At least one field must be supplied to update_item");

    let item = await this.getItem(input.id);
    if (input.title !== undefined) {
      item = await this.request<ItemDto>(`/api/items/${input.id}/title`, {
        method: "PATCH",
        body: { title: input.title }
      });
    }
    if (input.read !== undefined) {
      item = await this.request<ItemDto>(`/api/items/${input.id}/read`, {
        method: "PATCH",
        body: { read: input.read }
      });
    }
    if (input.favorite !== undefined) {
      item = await this.request<ItemDto>(`/api/items/${input.id}/favorite`, {
        method: "PATCH",
        body: { favorite: input.favorite }
      });
    }
    return this.getItem(item.id);
  }

  async addTags(id: number, names: string[]) {
    let item = await this.getItem(id);
    for (const tag of normalizeTags(names)) {
      item = await this.request<ItemDto>(`/api/items/${id}/tags`, {
        method: "POST",
        body: { tag }
      });
    }
    return item;
  }

  async removeTags(id: number, names: string[]) {
    let item = await this.getItem(id);
    const wanted = new Set(normalizeTags(names).map((name) => name.toLocaleLowerCase()));
    for (const tag of item.tags.filter((candidate) => wanted.has(candidate.name.toLocaleLowerCase()))) {
      item = await this.request<ItemDto>(`/api/items/${id}/tags/${tag.id}`, {
        method: "DELETE"
      });
    }
    return item;
  }

  private async request<T>(
    path: string,
    options: {
      method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
      body?: unknown;
      authenticated?: boolean;
    } = {}
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (options.authenticated !== false) headers.authorization = `Bearer ${this.token}`;
    if (options.body !== undefined) headers["content-type"] = "application/json";

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(15_000)
      });
    } catch (error) {
      throw new Error(`Cannot reach Oh My Favorites server at ${this.baseUrl}: ${errorMessage(error)}`);
    }

    const text = await response.text();
    let body: unknown = undefined;
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    if (!response.ok) {
      throw new OmfApiError(`Oh My Favorites API returned HTTP ${response.status}`, response.status, body);
    }
    return body as T;
  }
}

function normalizeTags(names: string[]) {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
}

export function errorMessage(error: unknown) {
  if (error instanceof OmfApiError) {
    const body = error.body === undefined ? "" : `: ${JSON.stringify(error.body)}`;
    return `${error.message}${body}`;
  }
  return error instanceof Error ? error.message : String(error);
}
