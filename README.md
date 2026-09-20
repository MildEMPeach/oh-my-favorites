# Oh My Favorites

Single-user, self-hosted URL inbox and favorites manager. URLs can be sent from Telegram or any MCP-capable agent, stored by a small self-hosted server, and read from an Electron desktop client with an embedded browser.

## Architecture

```text
Telegram
   │
   ▼
Server (Docker)
Fastify + grammY + SQLite
   ▲                 ▲
   │ REST            │ REST
   │                 │
Desktop          MCP Server (stdio)
Electron             ▲
                     │ MCP
                  Any Agent
```

- `apps/server`: Fastify API + Telegram Bot.
- `apps/desktop`: Electron + React desktop client.
- `apps/mcp-server`: stdio MCP adapter for agents such as Hermes, Claude, Codex, or other MCP clients.
- `packages/database`: Drizzle schema and SQLite setup.
- `packages/shared`: shared TypeScript contracts.

The desktop browser runs in a separate persistent Electron session from the app UI. Remote pages have Node.js disabled, non-HTTP(S) navigation blocked, and permission requests denied by default.

## Features

- Telegram URL ingestion with a single allowed Telegram user ID.
- MCP URL ingestion for external agents, with custom titles and additive tags.
- Timeline ordered by import time.
- Unread/read state. Opening an item marks it as read.
- Favorites view.
- Manual tags and tag filtering.
- Optional custom titles; new items default to their URL when no title is supplied.
- Page description and favicon metadata fetching.
- SSRF-aware metadata fetching with DNS resolution checks, redirect revalidation, response-size limits and timeouts.
- Embedded Chromium browser using Electron `WebContentsView`.
- Self-hosted Fastify/SQLite server with Docker Compose.

## Requirements

- Node.js 24+
- pnpm 12+
- Docker + Docker Compose for self-hosted server deployment

## Local development

```bash
pnpm install
cp .env.example .env
```

Edit `.env` and set at least:

```env
API_TOKEN=replace-with-a-long-random-token
```

Telegram ingestion is optional during local development:

```env
TELEGRAM_BOT_TOKEN=123456:your-bot-token
TELEGRAM_ALLOWED_USER_ID=123456789
```

Telegram message formats:

```text
https://example.com
https://example.com My custom title
```

When text follows the URL, it is saved as the item title. When no title is supplied, the normalized URL is used as the title.

Start the server and desktop client in separate terminals:

```bash
pnpm dev:server
pnpm dev:desktop
```

## MCP / agent integration

The MCP adapter lets an agent use its own browser to inspect a page, choose a title and tags, and then save it to Oh My Favorites. The MCP adapter itself intentionally does not fetch or interpret page content.

Build it with:

```bash
pnpm build:mcp
```

Configure an MCP client to launch:

```text
node /absolute/path/to/oh-my-favoirtes/apps/mcp-server/dist/index.js
```

with:

```env
OMF_BASE_URL=http://127.0.0.1:8787
OMF_API_TOKEN=the-same-token-as-API_TOKEN
```

Example generic stdio MCP configuration:

```json
{
  "mcpServers": {
    "oh-my-favorites": {
      "command": "node",
      "args": ["/absolute/path/to/oh-my-favoirtes/apps/mcp-server/dist/index.js"],
      "env": {
        "OMF_BASE_URL": "http://127.0.0.1:8787",
        "OMF_API_TOKEN": "your-server-api-token"
      }
    }
  }
}
```

Available tools are `save_url`, `get_item`, `list_items`, `list_tags`, `update_item`, `add_tags`, and `remove_tags`. See `apps/mcp-server/README.md` for details.

In the desktop app, open **Settings** and configure:

- Server URL, for example `http://localhost:8787`
- The same API token configured on the server

The connection can be tested directly from the Settings screen.

## Verification

```bash
pnpm test
pnpm typecheck
pnpm build
```

The server test suite covers API authentication, item state changes, tags/filtering, Telegram allowlist/URL extraction and metadata SSRF rules.

## Self-hosted server

Create the environment file:

```bash
cp .env.example .env
```

Configure it:

```env
PORT=8787
HOST=0.0.0.0
DATABASE_URL=./data/favorites.db
API_TOKEN=replace-with-a-long-random-token
TELEGRAM_BOT_TOKEN=123456:your-bot-token
TELEGRAM_ALLOWED_USER_ID=123456789
```

Then deploy:

```bash
docker compose up -d --build
```

Check service state:

```bash
docker compose ps
docker compose logs -f server
```

The Compose service includes an HTTP health check against `/health`. SQLite data is stored in the named Docker volume `favorites-data`, so recreating the container does not remove saved URLs.

The `/api/*` endpoints require:

```http
Authorization: Bearer <API_TOKEN>
```

Only `TELEGRAM_ALLOWED_USER_ID` is permitted to submit URLs through the bot. This project intentionally does not implement multi-user accounts.

## Desktop build and packaging

Build Electron assets:

```bash
pnpm --filter @oh-my-favorites/desktop build
```

Package the desktop app with electron-builder:

```bash
pnpm --filter @oh-my-favorites/desktop package
```

Configured targets are:

- macOS: DMG and ZIP
- Windows: NSIS installer
- Linux: AppImage

Packaged artifacts are written to `apps/desktop/release/`.

## Data model

`readStatus` and `isFavorite` are intentionally independent. An item can therefore be unread + favorite, read + favorite, read + not favorite, or unread + not favorite.

Main tables:

- `items`
- `tags`
- `item_tags`

## Security notes

- Keep `API_TOKEN` secret and use HTTPS when the server is exposed over the public internet.
- The server rejects metadata targets that resolve to loopback, private, link-local, multicast, documentation and other reserved IP ranges.
- Redirect targets are validated again before metadata requests continue.
- Metadata downloads are limited in time and size.
- The embedded browser is isolated from the React application and does not receive Node.js integration.
