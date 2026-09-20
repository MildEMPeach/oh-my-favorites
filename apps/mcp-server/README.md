# Oh My Favorites MCP Server

MCP adapter for Oh My Favorites. It exposes the same tools through two transports:

- stdio for local, process-spawned agents;
- Streamable HTTP for remote agents and containerized deployments.

The MCP server does **not** browse web pages itself. The intended workflow is:

1. The agent opens and reads a page using its own browser capability.
2. The agent chooses a useful title and tags.
3. The agent calls `save_url`.

## Build

From the repository root:

```bash
pnpm --filter @oh-my-favorites/shared build
pnpm --filter @oh-my-favorites/mcp build
```

The stdio executable entry point is:

```text
apps/mcp-server/dist/index.js
```

The remote Streamable HTTP entry point is:

```text
apps/mcp-server/dist/http.js
```

## Configuration

Both modes require:

```env
OMF_BASE_URL=http://127.0.0.1:8787
OMF_API_TOKEN=your-server-api-token
```

`OMF_BASE_URL` points to the existing Oh My Favorites server. `OMF_API_TOKEN` must match the server's `API_TOKEN`.

Generic stdio MCP client configuration:

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

Use the equivalent stdio MCP configuration fields if an agent uses a different config format.

## Remote Streamable HTTP

The remote server additionally requires a dedicated MCP bearer token:

```env
MCP_TOKEN=replace-with-a-different-long-random-token
MCP_HOST=0.0.0.0
MCP_PORT=8790
```

Start it directly with:

```bash
OMF_BASE_URL=http://127.0.0.1:8787 \
OMF_API_TOKEN=your-server-api-token \
MCP_TOKEN=your-mcp-token \
pnpm dev:mcp:http
```

The MCP endpoint is:

```text
http://127.0.0.1:8790/mcp
```

Clients must send:

```http
Authorization: Bearer <MCP_TOKEN>
```

Generic remote MCP configuration looks like:

```json
{
  "mcpServers": {
    "oh-my-favorites": {
      "url": "https://favorites.example.com/mcp",
      "headers": {
        "Authorization": "Bearer your-mcp-token"
      }
    }
  }
}
```

Exact field names vary by MCP client. Use Streamable HTTP when the client asks for the transport type.

### Docker

Remote MCP is an optional Compose profile. Set a separate `MCP_TOKEN` in `.env`, then run:

```bash
docker compose --profile mcp up -d --build
```

The MCP container talks to the OMF server over the private Compose network at `http://server:8787`. Port `8790` is published for MCP clients.

For access over the public internet, put the MCP endpoint behind HTTPS (for example Caddy, Nginx, or another TLS reverse proxy). Do not expose a plaintext HTTP MCP endpoint containing bearer credentials over an untrusted network.

## Tools

### `save_url`

Save a URL. Supports:

- `url` (required)
- `title`
- `tags`
- `favorite`

Newly saved URLs stay unread. If the URL already exists, an explicit title updates the existing title and supplied tags are added without deleting existing tags. Use `update_item` only when the user explicitly asks to change read state.

### `get_item`

Get one item by numeric ID, including tags.

### `list_items`

List items with optional filters:

- `status`: `unread` or `read`
- `favorite`: boolean
- `tag`: tag name

### `list_tags`

List currently used tags. Agents can use this before creating new tags to keep categorization consistent.

### `update_item`

Update one or more of:

- title
- read state
- favorite state

### `add_tags`

Add tags without replacing existing tags.

### `remove_tags`

Remove tags by name while preserving other tags.

## Development

Run directly from TypeScript:

```bash
OMF_BASE_URL=http://127.0.0.1:8787 \
OMF_API_TOKEN=your-server-api-token \
pnpm dev:mcp
```

Because this is an stdio MCP server, stdout is reserved for MCP protocol messages. Diagnostics are written only to stderr.
