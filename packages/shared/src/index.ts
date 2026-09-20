export type ReadStatus = "unread" | "read";

export interface TagDto {
  id: number;
  name: string;
}

export interface ItemDto {
  id: number;
  url: string;
  title: string | null;
  description: string | null;
  faviconUrl: string | null;
  source: "telegram" | "desktop";
  readStatus: ReadStatus;
  isFavorite: boolean;
  createdAt: string;
  readAt: string | null;
  favoritedAt: string | null;
  tags: TagDto[];
}

export interface ItemListResponse {
  items: ItemDto[];
}
