# Oh My Favorites Browser Extension

Manifest V3 extension for Chrome and Edge. Clicking the extension action saves the current HTTP/HTTPS tab directly to the configured Oh My Favorites server.

## Build

```bash
pnpm --filter @oh-my-favorites/browser-extension build
```

Load `dist/` as an unpacked extension. On first install, configure the Server URL and API Token in the options page.

The token is stored in the browser extension's local storage. The extension requests HTTP/HTTPS host access because the OMF server URL is user-configurable.
