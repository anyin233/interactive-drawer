# Interactive Excalidraw Drawer

Chat with an LLM that generates and edits Excalidraw diagrams in real time. Split layout: chat on the left, live Excalidraw rendering on the right.

## Architecture

```
Frontend (React/Vite)          Backend (FastAPI)           MCP Server
┌──────────┬──────────┐       ┌──────────────────┐       ┌──────────────┐
│ ChatPanel│ Drawing  │ SSE   │ POST /api/chat   │ stdio │ excalidraw-  │
│          │ Panel    │◄──────│ tool_loop()      │◄─────►│ mcp (Node)   │
│ Input    │ Excali-  │       │ LLM ↔ MCP loop   │       │              │
│          │ draw     │       └──────────────────┘       └──────────────┘
└──────────┴──────────┘
```

- **Frontend** owns conversation state, sends full history per request
- **Backend** is stateless per-request; MCP subprocess is persistent (singleton)
- **API credentials** are stored in localStorage and sent per request

## Quick Start

```bash
# 1. Clone and build excalidraw-mcp
git clone https://github.com/peng-shawn/excalidraw-mcp.git
cd excalidraw-mcp && npm install && npm run build && cd ..

# 2. Install backend
cd backend && uv sync --all-extras && cd ..

# 3. Install frontend
cd frontend && npm install && cd ..

# 4. Run
# Terminal 1:
cd backend && uv run uvicorn app.main:app --reload --port 8000
# Terminal 2:
cd frontend && npm run dev

# 5. Open http://localhost:5173
```

Or use the setup script: `./scripts/setup.sh`

## Usage

1. Open `http://localhost:5173`
2. Configure API settings (base URL, API key, model) in the settings modal
3. Describe what you want to draw (e.g., "Draw a flowchart with 3 boxes connected by arrows")
4. The LLM calls excalidraw-mcp tools, and the diagram renders live

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
  services/api.ts         # SSE stream consumer
  hooks/useChat.ts        # Chat state + streaming
  hooks/useSettings.ts    # localStorage-backed API config
  components/             # ChatPanel, DrawingPanel, ChatInput, MessageBubble, SettingsModal

e2e/tests/                # Playwright E2E tests
```
