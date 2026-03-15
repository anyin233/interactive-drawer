/**
 * Express application factory for the HTTP MCP server.
 * Extracted from main.ts for testability with supertest.
 *
 * @module http-app
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { hostHeaderValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import cors from "cors";
import express from "express";
import type { Request, Response } from "express";
import { resolve } from "node:path";
import type { SessionStore } from "./session-store.js";

/**
 * Render a simple landing page for web mode.
 * Shows server status, endpoints, and links to documentation.
 *
 * @param baseUrl - Base URL for links.
 * @returns HTML string.
 */
export function renderLandingPage(baseUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Excalidraw Sidecar MCP</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
         background: #fafafa; color: #1e1e1e; min-height: 100vh;
         display: flex; align-items: center; justify-content: center; }
  .container { max-width: 640px; padding: 40px; }
  h1 { font-size: 28px; margin-bottom: 8px; }
  .subtitle { color: #6b7280; font-size: 16px; margin-bottom: 32px; }
  .status { display: flex; align-items: center; gap: 8px; margin-bottom: 24px;
            padding: 12px 16px; background: #ecfdf5; border-radius: 8px; border: 1px solid #d1fae5; }
  .dot { width: 10px; height: 10px; border-radius: 50%; background: #22c55e; }
  .status span { color: #15803d; font-size: 14px; font-weight: 500; }
  .section { margin-bottom: 24px; }
  .section h2 { font-size: 16px; color: #374151; margin-bottom: 12px; }
  .endpoint { display: flex; justify-content: space-between; align-items: center;
              padding: 10px 14px; background: #fff; border: 1px solid #e5e7eb;
              border-radius: 6px; margin-bottom: 8px; font-size: 14px; }
  .endpoint .path { font-family: 'SF Mono', Monaco, monospace; color: #4a9eed; font-weight: 500; }
  .endpoint .desc { color: #6b7280; }
  .config { background: #1e1e1e; color: #e5e7eb; padding: 16px; border-radius: 8px;
            font-family: 'SF Mono', Monaco, monospace; font-size: 13px;
            line-height: 1.6; overflow-x: auto; white-space: pre; }
  .config .key { color: #7dd3fc; }
  .config .str { color: #86efac; }
  a { color: #4a9eed; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .footer { margin-top: 32px; color: #9ca3af; font-size: 13px; text-align: center; }
</style>
</head>
<body>
<div class="container">
  <h1>Excalidraw Sidecar MCP</h1>
  <p class="subtitle">Remote MCP server for diagram creation by external LLMs</p>

  <div class="status"><div class="dot"></div><span>Server running</span></div>

  <div class="section">
    <h2>Endpoints</h2>
    <div class="endpoint"><span class="path">POST /mcp</span><span class="desc">MCP Streamable HTTP</span></div>
    <div class="endpoint"><span class="path">GET /api/sessions/:key</span><span class="desc">Session metadata</span></div>
    <div class="endpoint"><span class="path">GET /api/sessions/:key/elements</span><span class="desc">Elements JSON</span></div>
    <div class="endpoint"><span class="path">PUT /api/sessions/:key/elements</span><span class="desc">Update elements</span></div>
    <div class="endpoint"><span class="path">GET /api/sessions/:key/svg</span><span class="desc">Rendered SVG</span></div>
    <div class="endpoint"><span class="path">/view/:key</span><span class="desc">Viewer + editor page</span></div>
  </div>

  <div class="section">
    <h2>Connect from Claude Desktop</h2>
    <div class="config">{
  <span class="key">"mcpServers"</span>: {
    <span class="key">"excalidraw"</span>: {
      <span class="key">"url"</span>: <span class="str">"${baseUrl}/mcp"</span>
    }
  }
}</div>
  </div>

  <div class="section">
    <h2>Connect via CLI</h2>
    <div class="config">node mcp-client.mjs --server ${baseUrl} create-session</div>
  </div>

  <div class="footer">
    <a href="https://github.com/anyin233/excalidraw-sidecar-mcp">GitHub</a>
    &nbsp;&middot;&nbsp; No LLM configuration needed &mdash; this server provides tools, external LLMs connect to it.
  </div>
</div>
</body>
</html>`;
}

/**
 * Detect the public-facing base URL from request headers.
 * Supports reverse proxy headers (X-Forwarded-Host, X-Forwarded-Proto).
 * Falls back to the Host header, then to the configured BASE_URL env var.
 *
 * @param req - Express request object.
 * @param fallbackPort - Local server port for localhost fallback.
 * @returns Resolved base URL string (no trailing slash).
 */
export function detectBaseUrl(req: Request, fallbackPort: number): string {
  if (process.env.BASE_URL) return process.env.BASE_URL;

  const fwdHost = req.headers["x-forwarded-host"];
  const host = (Array.isArray(fwdHost) ? fwdHost[0] : fwdHost) ?? req.headers.host;
  if (host) {
    const fwdProto = req.headers["x-forwarded-proto"];
    const proto = (Array.isArray(fwdProto) ? fwdProto[0] : fwdProto) ?? "http";
    return `${proto}://${host}`;
  }

  return `http://localhost:${fallbackPort}`;
}

/**
 * Create Express application with all MCP and REST API routes.
 * Does NOT call listen() — the caller is responsible for that.
 *
 * @param createServerFn - Factory that creates a new McpServer per request.
 * @param sessionStore - Session store for the viewer REST API.
 * @param viewerDir - Optional path to viewer build directory for static serving.
 * @param port - Port number for base URL detection fallback (default 3001).
 * @returns Configured Express application.
 */
export function createApp(
  createServerFn: (baseUrl: string) => McpServer,
  sessionStore: SessionStore,
  viewerDir?: string,
  port: number = 3001,
): express.Express {
  const app = express();
  app.use(express.json());

  // DNS rebinding protection
  const allowedHosts = ["localhost", "127.0.0.1", "::1"];
  if (process.env.BASE_URL) {
    try {
      allowedHosts.push(new URL(process.env.BASE_URL).hostname);
    } catch { /* invalid URL, ignore */ }
    app.use(hostHeaderValidation(allowedHosts));
  }
  app.use(cors());

  // JSON body parser for session REST API routes (5 MB to match MAX_INPUT_BYTES)
  app.use("/api/sessions", express.json({ limit: "5mb" }));

  // ============================================================
  // MCP endpoint (Streamable HTTP transport)
  // ============================================================
  app.all("/mcp", async (req: Request, res: Response) => {
    const server = createServerFn(detectBaseUrl(req, port));
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close().catch(() => {});
      server.close().catch(() => {});
    });

    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // ============================================================
  // Session REST API routes (for the frontend viewer page)
  // ============================================================

  /** UUID regex for validating session keys. */
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /** Extract and validate session key from Express params. */
  function getKey(req: Request, res: Response): string | null {
    const k = Array.isArray(req.params.key) ? req.params.key[0] : req.params.key;
    if (!UUID_RE.test(k)) {
      res.status(400).json({ error: "Invalid session key format" });
      return null;
    }
    return k;
  }

  /**
   * GET /api/sessions/:key — Session metadata (existence, expiry).
   */
  app.get("/api/sessions/:key", (req: Request, res: Response) => {
    const key = getKey(req, res);
    if (!key) return;
    const session = sessionStore.getSession(key);
    if (!session) {
      res.status(404).json({ error: "Session not found or expired" });
      return;
    }
    res.json({
      sessionKey: session.sessionKey,
      expiresAt: session.expiresAt.toISOString(),
      hasElements: session.elements.length > 0,
    });
  });

  /**
   * GET /api/sessions/:key/elements — Current elements JSON.
   */
  app.get("/api/sessions/:key/elements", (req: Request, res: Response) => {
    const key = getKey(req, res);
    if (!key) return;
    const session = sessionStore.getSession(key);
    if (!session) {
      res.status(404).json({ error: "Session not found or expired" });
      return;
    }
    res.json({ elements: session.elements });
  });

  /**
   * PUT /api/sessions/:key/elements — Update elements (user edits from viewer).
   */
  app.put("/api/sessions/:key/elements", (req: Request, res: Response) => {
    const key = getKey(req, res);
    if (!key) return;
    const { elements } = req.body;
    if (!Array.isArray(elements)) {
      res.status(400).json({ error: "Request body must contain an 'elements' array" });
      return;
    }
    const updated = sessionStore.updateElements(key, elements);
    if (!updated) {
      res.status(404).json({ error: "Session not found or expired" });
      return;
    }
    res.json({ ok: true });
  });

  /**
   * GET /api/sessions/:key/svg — Current SVG image.
   */
  app.get("/api/sessions/:key/svg", async (req: Request, res: Response) => {
    const key = getKey(req, res);
    if (!key) return;
    const session = sessionStore.getSession(key);
    if (!session) {
      res.status(404).json({ error: "Session not found or expired" });
      return;
    }
    if (session.elements.length === 0) {
      res.status(404).json({ error: "Session has no diagram yet" });
      return;
    }

    let svg = session.svgCache;
    if (!svg) {
      try {
        const { renderSvg } = await import("./svg-renderer.js");
        svg = await renderSvg(session.elements);
        sessionStore.updateSvgCache(key, svg);
      } catch (err) {
        console.error("SVG rendering error:", err);
        res.status(500).json({ error: "SVG rendering failed" });
        return;
      }
    }

    res.setHeader("Content-Type", "image/svg+xml");
    res.send(svg);
  });

  // ============================================================
  // Landing page (always available in web mode)
  // ============================================================
  app.get("/", (_req: Request, res: Response) => {
    const baseUrl = process.env.BASE_URL ?? `http://localhost:${port}`;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(renderLandingPage(baseUrl));
  });

  // ============================================================
  // Static file serving + SPA fallback (when viewer is available)
  // ============================================================
  if (viewerDir) {
    const absDir = resolve(viewerDir);

    app.use(express.static(absDir, { index: false }));

    // SPA fallback: any GET that didn't match an API route or static file
    // serves index.html so client-side routing (e.g. /view/:key) works.
    // Express 5 requires the { root } option for sendFile to work.
    app.get("/{*path}", (_req: Request, res: Response) => {
      res.sendFile("index.html", { root: absDir });
    });
  }

  return app;
}
