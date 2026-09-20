/// <reference types="vite/client" />

declare global {
  interface Window {
    favorites: {
      openUrl(url: string): Promise<void>;
      setBrowserBounds(bounds: { x: number; y: number; width: number; height: number }): void;
      hideBrowser(): void;
    };
  }
}

export {};
