import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { errorMessage, OmfApiClient } from "./client.js";

export function createOmfMcpServer(client: OmfApiClient) {
  const server = new McpServer({
    name: "oh-my-favorites",
    version: "0.2.0"
  });

  server.registerTool(
    "save_url",
    {
      title: "Save URL",
      description:
        "Save a web page to Oh My Favorites. When you have inspected the page, pass a concise human-readable title and useful semantic tags. Existing URLs are reused; an explicit title is updated and supplied tags are added without deleting existing tags.",
      inputSchema: {
        url: z.string().url().describe("HTTP or HTTPS URL to save"),
        title: z.string().trim().min(1).max(300).optional().describe("Custom title chosen after inspecting the page"),
        tags: z.array(z.string().trim().min(1).max(64)).max(30).optional().describe("Tags to add to the saved item"),
        read: z.boolean().optional().describe("Whether the item should immediately be marked read"),
        favorite: z.boolean().optional().describe("Whether the item should immediately be favorited")
      }
    },
    async (input) => runTool(() => client.saveUrl(input))
  );

  server.registerTool(
    "get_item",
    {
      title: "Get saved item",
      description: "Get one Oh My Favorites item, including its current tags, by numeric item ID.",
      inputSchema: { id: z.number().int().positive() }
    },
    async ({ id }) => runTool(() => client.getItem(id))
  );

  server.registerTool(
    "list_items",
    {
      title: "List saved items",
      description: "List saved items, optionally filtering by read status, favorite state, or tag.",
      inputSchema: {
        status: z.enum(["unread", "read"]).optional(),
        favorite: z.boolean().optional(),
        tag: z.string().trim().min(1).optional()
      }
    },
    async (input) => runTool(() => client.listItems(input))
  );

  server.registerTool(
    "list_tags",
    {
      title: "List existing tags",
      description: "List tags already in use. Use this before inventing a new tag when consistent categorization matters.",
      inputSchema: {}
    },
    async () => runTool(() => client.listTags())
  );

  server.registerTool(
    "update_item",
    {
      title: "Update saved item",
      description: "Update the title, read state, and/or favorite state of an existing item.",
      inputSchema: {
        id: z.number().int().positive(),
        title: z.string().trim().min(1).max(300).optional(),
        read: z.boolean().optional(),
        favorite: z.boolean().optional()
      }
    },
    async (input) => runTool(() => client.updateItem(input))
  );

  server.registerTool(
    "add_tags",
    {
      title: "Add tags",
      description: "Add one or more tags to an existing item without replacing its other tags.",
      inputSchema: {
        id: z.number().int().positive(),
        tags: z.array(z.string().trim().min(1).max(64)).min(1).max(30)
      }
    },
    async ({ id, tags }) => runTool(() => client.addTags(id, tags))
  );

  server.registerTool(
    "remove_tags",
    {
      title: "Remove tags",
      description: "Remove tags from an item by tag name. Other tags remain unchanged.",
      inputSchema: {
        id: z.number().int().positive(),
        tags: z.array(z.string().trim().min(1).max(64)).min(1).max(30)
      }
    },
    async ({ id, tags }) => runTool(() => client.removeTags(id, tags))
  );

  return server;
}

async function runTool<T>(operation: () => Promise<T>) {
  try {
    const result = await operation();
    const structured = asObject(result);
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
      ...(structured ? { structuredContent: structured } : {})
    };
  } catch (error) {
    return {
      isError: true,
      content: [{ type: "text" as const, text: errorMessage(error) }]
    };
  }
}

function asObject(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return undefined;
}
