# Interactive Excalidraw Drawer

Chat with an LLM that generates and edits Excalidraw diagrams in real time. Split layout: chat on the left, live Excalidraw rendering on the right. Also supports **sidecar mode** where external LLMs (Claude Desktop, etc.) draw diagrams via a remote MCP server.

## Architecture

Two usage modes share the same frontend and MCP server:

**Chat mode** — embedded LLM chat with live diagram streaming:

```
Frontend (React/Vite)          Backend (FastAPI)           MCP Server (stdio)
┌──────────┬──────────┐       ┌──────────────────┐       ┌──────────────┐
│ ChatPanel│ Drawing  │ SSE   │ POST /api/chat   │ stdio │ excalidraw-  │
│          │ Panel    │◄──────│ tool_loop()      │◄─────►│ mcp (Node)   │
│ Input    │ Excali-  │       │ LLM ↔ MCP loop   │       │              │
│          │ draw     │       └──────────────────┘       └──────────────┘
└──────────┴──────────┘
```

**Sidecar mode** — external LLMs connect via HTTP, single-domain deployment:

```
External LLM                   MCP Server :3001 (--static)
(Claude Desktop, etc.)        ┌──────────────────────────────┐
        │  MCP HTTP           │ POST /mcp      (MCP tools)   │
        └────────────────────►│ /api/sessions  (REST API)    │
                              │ /view/:key     (ViewerPage)  │
User (Browser)                │ /              (landing page) │
        │  open viewer link   │ /* static      (frontend dist)│
        └────────────────────►└──────────────────────────────┘
```

- **Frontend** owns conversation state, sends full history per request
- **Backend** is stateless per-request; MCP subprocess is persistent (singleton)
- **API credentials** are stored in localStorage and sent per request

## Quick Start

### Chat Mode (3 terminals)

```bash
# 1. Install
cd excalidraw-mcp && npm install && npm run build && cd ..
cd backend && uv sync --all-extras && cd ..
cd frontend && npm install && cd ..

# 2. Run
# Terminal 1: Backend
cd backend && uv run uvicorn app.main:app --reload --port 8000
# Terminal 2: Frontend dev server
cd frontend && npm run dev
# Terminal 3 is optional — MCP subprocess starts automatically

# 3. Open http://localhost:5173
```

### Sidecar Mode (single domain, single port)

```bash
# 1. Build frontend
cd frontend && npm install && npm run build && cd ..

# 2. Build and start MCP server with --static flag
cd excalidraw-mcp && npm install && npm run build
node dist/index.js --static ../frontend/dist

# → Everything on http://localhost:3001
#   MCP endpoint:  POST /mcp
#   Viewer pages:  /view/:sessionKey
#   Landing page:  /
```

Point your external LLM (Claude Desktop, etc.) to `http://localhost:3001/mcp`. Viewer links returned by the MCP tools will point to the same origin — no separate frontend server needed.

Or use the setup script: `./scripts/setup.sh`

## Usage

### Chat Mode

1. Open `http://localhost:5173`
2. Configure API settings (base URL, API key, model) in the settings modal
3. Describe what you want to draw (e.g., "Draw a flowchart with 3 boxes connected by arrows")
4. The LLM calls excalidraw-mcp tools, and the diagram renders live

### Sidecar Mode

1. Start the MCP server with `--static ../frontend/dist` (see above)
2. Connect an external LLM to `http://localhost:3001/mcp`
3. Ask the LLM to draw — it calls `create_session` → `read_me` → `create_view`
4. Open the viewer URL (e.g. `http://localhost:3001/view/<key>`) to see and edit the diagram
5. The viewer supports pan (drag), zoom (scroll wheel), and double-click to reset

## Testing

```bash
# Backend (29 tests)
cd backend && uv run pytest -v

# Frontend (29 tests)
cd frontend && npx vitest run

# E2E (8 tests) — requires frontend dev server
cd e2e && npm install && npx playwright install chromium
cd frontend && npm run dev &
cd e2e && npx playwright test
```

## Project Structure

```
backend/app/
  models/schemas.py       # Pydantic models (ChatRequest, ApiConfig, Message)
  services/mcp_client.py  # McpManager: MCP subprocess lifecycle + tool bridge
  services/llm_service.py # OpenAI client factory
  services/tool_loop.py   # LLM ↔ MCP orchestration loop (async generator)
  routers/chat.py         # POST /api/chat SSE endpoint

frontend/src/
  components/             # ChatPanel, DrawingPanel, ViewerPage, SettingsModal, etc.
  hooks/useChat.ts        # Chat state + streaming
  hooks/useSettings.ts    # localStorage-backed API config
  services/api.ts         # SSE stream consumer

excalidraw-mcp/src/
  main.ts                 # Entry: HTTP mode (--static) or stdio mode (--stdio)
  remote-server.ts        # Remote MCP tools (create_session, create_view, etc.)
  server.ts               # Local MCP tools (stdio, used by Python backend)
  session-store.ts        # In-memory session store (24h TTL)
  svg-renderer.ts         # Server-side SVG rendering (JSDOM + Excalidraw)

e2e/tests/                # Playwright E2E tests
```
