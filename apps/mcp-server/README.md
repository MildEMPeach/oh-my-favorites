# Oh My Favorites MCP Server

Stdio MCP adapter for Oh My Favorites. It lets an MCP-capable agent save and manage URLs through the existing self-hosted REST API.

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

The executable entry point is:

```text
apps/mcp-server/dist/index.js
```

## Configuration

The process requires two environment variables:

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

## Tools

### `save_url`

Save a URL. Supports:

- `url` (required)
- `title`
- `tags`
- `read`
- `favorite`

If the URL already exists, an explicit title updates the existing title and supplied tags are added without deleting existing tags.

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
