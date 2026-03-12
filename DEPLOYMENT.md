# Deployment Guide

From `git clone` to a fully deployed MCP service for LLMs.

## Prerequisites

| Requirement | Version | Check |
|-------------|---------|-------|
| Node.js | 18+ | `node -v` |
| npm | 9+ | `npm -v` |
| Python | 3.11+ | `python3 --version` |
| uv | latest | `uv --version` |
| Git | any | `git --version` |

Install uv if missing:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

## Quick Start (Sidecar MCP for External LLMs)

This is the simplest deployment — a single process serving the MCP endpoint, REST API, and browser viewer on one port.

```bash
# 1. Clone the project
git clone <repo-url> interactive_drawer
cd interactive_drawer

# 2. Build the MCP server
cd excalidraw-mcp
npm install
npm run build

# 3. Build the frontend viewer
cd ../frontend
npm install
npm run build

# 4. Start the sidecar server (single-domain mode)
cd ../excalidraw-mcp
node dist/index.js --static ../frontend/dist
```

The server starts on **http://localhost:3001** with:

| Endpoint | Purpose |
|----------|---------|
| `POST /mcp` | MCP Streamable HTTP (LLMs connect here) |
| `GET /api/sessions/:key/elements` | Elements JSON |
| `PUT /api/sessions/:key/elements` | Update elements |
| `GET /api/sessions/:key/svg` | Rendered SVG |
| `/view/:key` | Browser viewer + editor |
| `/` | Landing page with status and config |

## Full Stack (Chat UI + MCP)

The full stack adds a Python backend and React frontend for a chat-based diagram editing experience. Users configure any OpenAI-compatible API (base URL, key, model) in the browser — the backend has no hardcoded LLM credentials.

```bash
# 1. Clone and enter the project
git clone <repo-url> interactive_drawer
cd interactive_drawer

# 2. Build the MCP server
cd excalidraw-mcp
npm install
npm run build
cd ..

# 3. Install backend dependencies
cd backend
uv sync --all-extras
cd ..

# 4. Install frontend dependencies
cd frontend
npm install
cd ..
```

### Start services (3 terminals)

**Terminal 1 — MCP server (HTTP mode for sidecar, or let the backend manage stdio):**

If you want sidecar MCP alongside the chat UI:

```bash
cd excalidraw-mcp
node dist/index.js --static ../frontend/dist
# → http://localhost:3001
```

**Terminal 2 — Backend (manages its own MCP subprocess via stdio):**

```bash
cd backend
uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
# → http://localhost:8000
```

The backend spawns `node excalidraw-mcp/dist/index.js --stdio` as a child process automatically — no manual MCP startup needed for the chat feature.

**Terminal 3 — Frontend dev server:**

```bash
cd frontend
npm run dev
# → http://localhost:5173
```

Vite proxies `/api/sessions` and `/mcp` to port 3001, and `/api` to port 8000.

For production, build the frontend (`npm run build`) and serve with nginx or the MCP server's `--static` flag instead of the Vite dev server.

## Automated Setup

A setup script is included for convenience:

```bash
bash scripts/setup.sh
```

This clones the MCP submodule (if missing), builds it, installs backend and frontend dependencies, and sets up E2E test tooling.

## Connecting LLMs

### Claude Desktop

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "excalidraw": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

Claude Desktop connects via MCP Streamable HTTP. No API key or auth needed.

### Claude Code (CLI)

Use the included skill:

```bash
# Via the /draw skill command (if installed)
/draw http://localhost:3001

# Or via the CLI helper directly
node excalidraw-mcp/skill/scripts/mcp-client.mjs --server http://localhost:3001 create-session
```

You can also create a config file at the project root or `~/.excalidraw-mcp.json`:

```json
{
  "server": "http://localhost:3001"
}
```

### Other MCP Clients

Any client supporting [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-03-26/basic/transports#streamable-http) can connect to `http://localhost:3001/mcp`.

**Protocol handshake:**

```bash
# Step 1: Initialize (save the mcp-session-id header)
curl -s -D- -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "jsonrpc": "2.0",
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {"name": "my-client", "version": "1.0"}
    },
    "id": 1
  }'

# Step 2: Call a tool (use mcp-session-id from step 1)
curl -s -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "Mcp-Session-Id: <session-id-from-step-1>" \
  -d '[
    {"jsonrpc":"2.0","method":"notifications/initialized"},
    {"jsonrpc":"2.0","method":"tools/call",
     "params":{"name":"create_session","arguments":{}}, "id":2}
  ]'
```

## MCP Tools Available to LLMs

Once connected, LLMs have access to these tools:

| Tool | Purpose |
|------|---------|
| `create_session` | Create a new 24h drawing session → returns session key + viewer URL |
| `read_me` | Get the Excalidraw element format reference (call once before drawing) |
| `create_view` | Render a diagram from JSON elements → returns SVG + checkpoint ID |
| `get_current_view` | Get latest SVG (includes any browser edits by the user) |

**Typical LLM workflow:**

1. `create_session` → get session key and viewer URL
2. `read_me` → learn the element format
3. `create_view` with elements JSON → render the diagram
4. Share the viewer URL with the user
5. `get_current_view` → check for user edits
6. `create_view` with `restoreCheckpoint` → incremental updates

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | MCP server port |
| `BASE_URL` | auto (`http://localhost:PORT` when `--static` is used) | Base URL for viewer links in tool responses |

No LLM API keys are needed on the server side. The MCP server provides drawing tools — external LLMs connect to it, not the other way around.

For the chat UI backend, users configure their own OpenAI-compatible API credentials in the browser settings modal.

## Production Deployment

### With PM2

```bash
npm install -g pm2

# Build everything
cd excalidraw-mcp && npm install && npm run build && cd ..
cd frontend && npm install && npm run build && cd ..

# Start
pm2 start excalidraw-mcp/dist/index.js \
  --name excalidraw-mcp \
  -- --static frontend/dist

pm2 save
pm2 startup
```

### With systemd

```ini
[Unit]
Description=Excalidraw Sidecar MCP
After=network.target

[Service]
Type=simple
User=deploy
WorkingDirectory=/opt/interactive_drawer
ExecStart=/usr/bin/node excalidraw-mcp/dist/index.js --static frontend/dist
Restart=always
RestartSec=5
Environment=PORT=3001

[Install]
WantedBy=multi-user.target
```

```bash
sudo cp excalidraw-mcp.service /etc/systemd/system/
sudo systemctl enable --now excalidraw-mcp
```

### With Docker

```dockerfile
FROM node:20-slim

WORKDIR /app

# Build MCP server
COPY excalidraw-mcp/package*.json excalidraw-mcp/
RUN cd excalidraw-mcp && npm ci
COPY excalidraw-mcp/ excalidraw-mcp/
RUN cd excalidraw-mcp && npm run build

# Build frontend
COPY frontend/package*.json frontend/
RUN cd frontend && npm ci
COPY frontend/ frontend/
RUN cd frontend && npm run build

EXPOSE 3001
CMD ["node", "excalidraw-mcp/dist/index.js", "--static", "frontend/dist"]
```

```bash
docker build -t excalidraw-mcp .
docker run -d -p 3001:3001 --name excalidraw-mcp excalidraw-mcp
```

### With nginx (reverse proxy)

If you need TLS or want to expose the service on port 443:

```nginx
server {
    listen 443 ssl;
    server_name draw.example.com;

    ssl_certificate     /etc/ssl/certs/draw.pem;
    ssl_certificate_key /etc/ssl/private/draw.key;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # SSE support (required for MCP Streamable HTTP)
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}
```

With a public URL, set `BASE_URL` so viewer links use the correct domain:

```bash
BASE_URL=https://draw.example.com node excalidraw-mcp/dist/index.js --static frontend/dist
```

## Troubleshooting

**"Cannot find module 'dist/index.js'"** — Run `npm run build` in `excalidraw-mcp/` first.

**"Static directory not found"** — Run `npm run build` in `frontend/` to generate `frontend/dist/`.

**Viewer shows blank page at `/view/:key`** — Ensure the frontend was built after the latest code changes (`cd frontend && npm run build`).

**"Not Acceptable" from `/mcp`** — The client must send `Accept: application/json, text/event-stream` header.

**Sessions expire** — Sessions have a 24h TTL. Create a new session if expired. Max 100 concurrent sessions.

**Port already in use** — Set `PORT=3002` (or any free port) before starting the server.
