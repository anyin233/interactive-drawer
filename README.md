# Interactive Drawer

> Excalidraw MCP server — let any LLM create and share interactive diagrams

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green)](https://nodejs.org)
[![MCP](https://img.shields.io/badge/Protocol-MCP%202025--03--26-blue)](https://modelcontextprotocol.io)

## What It Does

Interactive Drawer gives LLMs an MCP tool to draw [Excalidraw](https://excalidraw.com) diagrams. The LLM calls `create_view`, a live viewer link is returned, and the user can open, edit, and export the diagram in their browser — no manual drawing required.

Works with **Claude Desktop, Cursor, Goose, Claude Code**, and any MCP-compatible client.

## Architecture

```
interactive-drawer/
├── src/                    # MCP server source
│   ├── main.ts             # Entry: CLI args, mode selection
│   ├── http-app.ts         # Express app factory (web mode)
│   ├── cli.ts              # CLI argument parser
│   ├── server.ts           # Studio mode MCP server
│   ├── remote-server.ts    # Web mode MCP server
│   ├── session-store.ts    # In-memory sessions (24h TTL, 100 max)
│   ├── checkpoint-store.ts # Checkpoint persistence
│   ├── svg-renderer.ts     # Server-side SVG via JSDOM + Excalidraw
│   ├── shared.ts           # Element resolution, constants
│   └── __tests__/          # 46 tests (vitest + supertest)
├── viewer/                 # Viewer SPA (React + Excalidraw)
│   └── src/
│       ├── components/ViewerPage.tsx
│       └── hooks/useGestures.ts
├── dist/                   # Build output
│   ├── index.js            # Server entry (with shebang)
│   ├── server.js           # Importable server module
│   └── viewer/             # Built viewer SPA
├── scripts/build.mjs       # esbuild-based build script
├── package.json
├── Dockerfile
└── docker-compose.yml
```

**Two modes:**
- **Web** (default) — HTTP MCP + REST API + built-in viewer on one port
- **Studio** (`--stdio`) — stdin/stdout MCP for Claude Desktop, Cursor, etc.

---

## Quick Start

```bash
git clone https://github.com/anyin233/interactive-drawer
cd interactive-drawer
npm install
cd viewer && npm install && cd ..
npm run build
node dist/index.js
# → http://localhost:3001
```

---

## Connect Your LLM

### Web Mode (remote MCP)

Start the server, then point your client to the MCP endpoint:

**Claude Desktop / Cursor / any MCP client:**

```json
{
  "mcpServers": {
    "excalidraw": {
      "url": "http://localhost:3001/mcp"
    }
  }
}
```

### Studio Mode (local MCP)

No server needed — the LLM client runs the process directly:

**Claude Desktop:**

```json
{
  "mcpServers": {
    "excalidraw": {
      "command": "node",
      "args": ["/path/to/interactive-drawer/dist/index.js", "--stdio"]
    }
  }
}
```

**npx (after npm publish):**

```json
{
  "mcpServers": {
    "excalidraw": {
      "command": "npx",
      "args": ["interactive-drawer", "--stdio"]
    }
  }
}
```

---

## MCP Tools

| Tool | Studio | Web | Description |
|------|:------:|:---:|-------------|
| `read_me` | yes | yes | Excalidraw element format reference + drawing style picker |
| `create_view` | yes | yes | Render elements → SVG (+ viewer link in web mode) |
| `create_session` | - | yes | New drawing session → session key + viewer URL |
| `get_current_view` | - | yes | Latest SVG including user edits from the browser |

**Workflow (web mode):**
```
create_session → read_me → ask user for drawing style → create_view → share viewer URL → iterate
```

### Drawing Style Picker

After calling `read_me`, the LLM asks users to choose a **font** and **sloppiness**:

| Font | Style |
|------|-------|
| Excalifont | Hand-drawn, casual (default) |
| Nunito | Clean, rounded sans-serif |
| Comic Shanns | Comic/playful |

| Sloppiness | Style |
|------------|-------|
| Architect | Precise, clean lines |
| Artist | Slightly rough (default) |
| Cartoonist | Very rough, wobbly |

---

## Viewer

Each `/view/:key` link is a full Excalidraw editor:

- Pan (drag), zoom (scroll), edit with full toolbar
- SVG and PNG export
- Edits are saved back to the session (LLM can read them via `get_current_view`)
- Sessions expire after **24 hours**

---

## REST API (Web Mode)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/mcp` | MCP Streamable HTTP |
| `GET` | `/view/:key` | Browser viewer + editor |
| `GET` | `/api/sessions/:key` | Session metadata |
| `GET` | `/api/sessions/:key/elements` | Raw elements JSON |
| `PUT` | `/api/sessions/:key/elements` | Replace elements |
| `GET` | `/api/sessions/:key/svg` | Rendered SVG |
| `GET` | `/` | Status page |

---

## CLI Options

```
interactive-drawer [options]

Options:
  --stdio          Studio mode (stdin/stdout MCP transport)
  --port <number>  HTTP server port (default: 3001, web mode only)
  --base-url <url> Public URL for viewer links (web mode only)
  --help           Show help
  --version        Show version

Environment Variables:
  PORT             Same as --port
  BASE_URL         Same as --base-url
```

---

## Development

```bash
npm install
cd viewer && npm install && cd ..

# Run tests
npm test                    # 46 server tests
cd viewer && npm test       # 9 viewer tests

# Dev mode (watch + serve)
npm run dev
```

---

## Deployment

<details>
<summary>Docker</summary>

```bash
docker build -t interactive-drawer .
docker run -d -p 3001:3001 -e BASE_URL=https://draw.example.com interactive-drawer
```

Or with docker-compose:

```bash
docker compose up -d
```

</details>

<details>
<summary>systemd</summary>

```ini
[Service]
WorkingDirectory=/opt/interactive-drawer
ExecStart=node dist/index.js
Environment=PORT=3001
Environment=BASE_URL=https://draw.example.com
Restart=always
```

</details>

<details>
<summary>nginx (TLS reverse proxy)</summary>

```nginx
location / {
    proxy_pass http://127.0.0.1:3001;
    proxy_set_header Connection '';
    proxy_buffering off;   # required for SSE / MCP Streamable HTTP
}
```

</details>

---

## License

MIT
