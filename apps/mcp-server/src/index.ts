#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { OmfApiClient } from "./client.js";
import { createOmfMcpServer } from "./mcp.js";

const baseUrl = process.env.OMF_BASE_URL?.trim();
const apiToken = process.env.OMF_API_TOKEN?.trim();

if (!baseUrl || !apiToken) {
  console.error("OMF_BASE_URL and OMF_API_TOKEN are required");
  process.exit(1);
}

const server = createOmfMcpServer(new OmfApiClient(baseUrl, apiToken));
await server.connect(new StdioServerTransport());
