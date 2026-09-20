#!/usr/bin/env node
import { startRemoteMcpHttpServer } from "./http-server.js";

const baseUrl = process.env.OMF_BASE_URL?.trim();
const apiToken = process.env.OMF_API_TOKEN?.trim();
const mcpToken = process.env.MCP_TOKEN?.trim();
const host = process.env.MCP_HOST?.trim() || "0.0.0.0";
const port = Number(process.env.MCP_PORT || "8790");

if (!baseUrl || !apiToken || !mcpToken) {
  console.error("OMF_BASE_URL, OMF_API_TOKEN, and MCP_TOKEN are required");
  process.exit(1);
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  console.error("MCP_PORT must be a valid TCP port");
  process.exit(1);
}

const server = await startRemoteMcpHttpServer({ host, port, baseUrl, apiToken, mcpToken });
console.error(`Oh My Favorites remote MCP listening on http://${host}:${port}/mcp`);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => server.close(() => process.exit(0)));
}
