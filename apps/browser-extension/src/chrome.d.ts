interface ChromeTab {
  id?: number;
  title?: string;
  url?: string;
}

interface ChromeStorageArea {
  get(keys: string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface ChromeActionApi {
  onClicked: { addListener(callback: (tab: ChromeTab) => void): void };
  setBadgeText(details: { text: string }): Promise<void>;
  setTitle(details: { title: string }): Promise<void>;
}

interface ChromeRuntimeApi {
  onInstalled: { addListener(callback: (details: { reason: string }) => void): void };
  openOptionsPage(): Promise<void>;
}

interface ChromeApi {
  action: ChromeActionApi;
  runtime: ChromeRuntimeApi;
  storage: { local: ChromeStorageArea };
}

declare const chrome: ChromeApi;
