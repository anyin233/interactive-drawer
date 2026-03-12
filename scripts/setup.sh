#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Interactive Excalidraw Drawer Setup ==="

# 1. Clone and build excalidraw-mcp
if [ ! -d "$PROJECT_DIR/excalidraw-mcp" ]; then
  echo "Cloning excalidraw-mcp..."
  git clone https://github.com/peng-shawn/excalidraw-mcp.git "$PROJECT_DIR/excalidraw-mcp"
fi

echo "Building excalidraw-mcp..."
cd "$PROJECT_DIR/excalidraw-mcp"
npm install
npm run build

# 2. Install backend deps
echo "Installing backend dependencies..."
cd "$PROJECT_DIR/backend"
uv sync --all-extras

# 3. Install frontend deps
echo "Installing frontend dependencies..."
cd "$PROJECT_DIR/frontend"
npm install

# 4. Install e2e deps
echo "Installing E2E test dependencies..."
cd "$PROJECT_DIR/e2e"
npm install
npx playwright install chromium

echo "=== Setup complete! ==="
echo ""
echo "To start the app:"
echo "  Backend:  cd backend && uv run uvicorn app.main:app --reload --port 8000"
echo "  Frontend: cd frontend && npm run dev"
echo "  Open:     http://localhost:5173"
