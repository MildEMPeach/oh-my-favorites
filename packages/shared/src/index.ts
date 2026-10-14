export type ReadStatus = "unread" | "read";
export interface LibraryFields {
  notes: string;
  collection: string | null;
  contentDate: string | null;
}

export interface TagDto {
  id: number;
  name: string;
}

export interface ItemDto extends LibraryFields {
  id: number;
  url: string | null;
  area: "inbox" | "library";
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
