/// <reference types="vite/client" />

declare global {
  interface Window {
    favorites: {
      openUrl(url: string): Promise<void>;
      openExternal(url: string): Promise<void>;
      confirmDiscard(): Promise<boolean>;
      setBrowserBounds(bounds: { x: number; y: number; width: number; height: number }): void;
      hideBrowser(): void;
      showBrowser(): void;
    };
  }
}

export {};
