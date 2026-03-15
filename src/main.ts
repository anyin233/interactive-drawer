/**
 * Entry point for running the MCP server.
 * Run with: npx interactive-drawer
 * Or: node dist/index.js [--stdio]
 *
 * Web mode (default): HTTP MCP server + REST API + built-in viewer.
 * Studio mode (--stdio): Local MCP server via stdin/stdout.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { FileCheckpointStore } from "./checkpoint-store.js";
import { parseCliArgs } from "./cli.js";
import { createApp } from "./http-app.js";
import { createRemoteServer } from "./remote-server.js";
import { createServer } from "./server.js";
import { SessionStore } from "./session-store.js";

/**
 * Starts an MCP server with stdio transport.
 * Used for local MCP clients (Claude Desktop, Claude Code, Cursor, etc.).
 *
 * @param createServerFn - Factory function that creates a new McpServer instance.
 */
export async function startStdioServer(
  createServerFn: () => McpServer,
): Promise<void> {
  await createServerFn().connect(new StdioServerTransport());
}

/**
 * Starts the HTTP MCP server with viewer and REST API.
 *
 * @param createServerFn - Factory that creates a new McpServer per request.
 * @param sessionStore - Session store for the viewer REST API.
 * @param viewerDir - Optional path to viewer build directory.
 * @param port - HTTP server port.
 */
export async function startStreamableHTTPServer(
  createServerFn: (baseUrl: string) => McpServer,
  sessionStore: SessionStore,
  viewerDir?: string,
  port: number = 3001,
): Promise<void> {
  const app = createApp(createServerFn, sessionStore, viewerDir, port);

  const httpServer = app.listen(port, (err) => {
    if (err) {
      console.error("Failed to start server:", err);
      process.exit(1);
    }
    console.log(`MCP server listening on http://localhost:${port}/mcp`);
    console.log(`Session API available at http://localhost:${port}/api/sessions/`);
    if (viewerDir) {
      console.log(`Viewer available at http://localhost:${port}/`);
    }
    if (process.env.BASE_URL) {
      console.log(`Viewer links will use base URL: ${process.env.BASE_URL}`);
    }
  });

  const shutdown = () => {
    console.log("\nShutting down...");
    sessionStore.destroy();
    httpServer.close(() => process.exit(0));
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));

  if (args.help) {
    console.log(`Usage: interactive-drawer [options]

Options:
  --stdio          Studio mode (stdin/stdout MCP transport)
  --port <number>  HTTP server port (default: 3001, web mode only)
  --base-url <url> Public URL for viewer links (web mode only)
  --help           Show this help
  --version        Show version

Environment Variables:
  PORT             Same as --port
  BASE_URL         Same as --base-url`);
    process.exit(0);
  }

  if (args.version) {
    console.log("0.4.1");
    process.exit(0);
  }

  const checkpointStore = new FileCheckpointStore();

  if (args.stdio) {
    const factory = () => createServer(checkpointStore);
    await startStdioServer(factory);
  } else {
    const sessionStore = new SessionStore();
    if (args.baseUrl) process.env.BASE_URL = args.baseUrl;

    // Auto-detect viewer directory relative to this file
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const viewerDir = resolve(__dirname, "viewer");
    const hasViewer = existsSync(resolve(viewerDir, "index.html"));

    if (!process.env.BASE_URL && hasViewer) {
      process.env.BASE_URL = `http://localhost:${args.port}`;
    }

    const factory = (baseUrl: string) => createRemoteServer(sessionStore, checkpointStore, baseUrl);
    await startStreamableHTTPServer(factory, sessionStore, hasViewer ? viewerDir : undefined, args.port);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
