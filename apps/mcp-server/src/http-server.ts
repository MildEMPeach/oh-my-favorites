import { randomUUID, timingSafeEqual } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { OmfApiClient } from "./client.js";
import { createOmfMcpServer } from "./mcp.js";

export interface RemoteMcpConfig {
  host: string;
  port: number;
  baseUrl: string;
  apiToken: string;
  mcpToken: string;
}

interface Session {
  transport: StreamableHTTPServerTransport;
  server: ReturnType<typeof createOmfMcpServer>;
}

export function createRemoteMcpHttpServer(config: Omit<RemoteMcpConfig, "host" | "port">): Server {
  const sessions = new Map<string, Session>();
  const apiClient = new OmfApiClient(config.baseUrl, config.apiToken);

  const httpServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/health") {
        return sendJson(res, 200, { ok: true, transport: "streamable-http" });
      }

      if (url.pathname !== "/mcp") return sendJson(res, 404, { error: "not_found" });
      if (!authorized(req, config.mcpToken)) return unauthorized(res);
      if (!["GET", "POST", "DELETE"].includes(req.method ?? "")) {
        res.setHeader("allow", "GET, POST, DELETE");
        return sendJson(res, 405, { error: "method_not_allowed" });
      }

      const sessionId = header(req, "mcp-session-id");
      if (sessionId) {
        const session = sessions.get(sessionId);
        if (!session) return sendMcpError(res, 404, -32001, "Session not found");
        await session.transport.handleRequest(req, res);
        return;
      }

      if (req.method !== "POST") {
        return sendMcpError(res, 400, -32000, "Mcp-Session-Id header is required");
      }

      const server = createOmfMcpServer(apiClient);
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: randomUUID,
        enableJsonResponse: true,
        onsessioninitialized: (id) => {
          sessions.set(id, { server, transport });
        },
        onsessionclosed: async (id) => {
          const session = sessions.get(id);
          sessions.delete(id);
          await session?.server.close();
        }
      });

      transport.onerror = (error) => console.error("MCP HTTP transport error:", error);
      await server.connect(transport);
      await transport.handleRequest(req, res);

      if (!transport.sessionId) {
        await server.close();
      }
    } catch (error) {
      console.error("MCP HTTP request failed:", error);
      if (!res.headersSent) sendJson(res, 500, { error: "internal_error" });
      else res.end();
    }
  });

  httpServer.on("close", () => {
    for (const session of sessions.values()) {
      void session.transport.close();
      void session.server.close();
    }
    sessions.clear();
  });

  return httpServer;
}

export async function startRemoteMcpHttpServer(config: RemoteMcpConfig) {
  const server = createRemoteMcpHttpServer(config);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(config.port, config.host, () => {
      server.off("error", reject);
      resolve();
    });
  });
  return server;
}

function authorized(req: IncomingMessage, expectedToken: string) {
  const auth = header(req, "authorization");
  if (!auth?.startsWith("Bearer ")) return false;
  const provided = Buffer.from(auth.slice("Bearer ".length));
  const expected = Buffer.from(expectedToken);
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

function header(req: IncomingMessage, name: string) {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

function unauthorized(res: ServerResponse) {
  res.setHeader("www-authenticate", "Bearer");
  return sendJson(res, 401, { error: "unauthorized" });
}

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function sendMcpError(res: ServerResponse, status: number, code: number, message: string) {
  return sendJson(res, status, {
    jsonrpc: "2.0",
    error: { code, message },
    id: null
  });
}
