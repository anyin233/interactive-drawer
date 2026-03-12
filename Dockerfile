# Sidecar MCP mode: serves MCP endpoint + REST API + browser viewer on a single port.
# Usage:
#   docker build -t excalidraw-mcp .
#   docker run -d -p 3001:3001 excalidraw-mcp
#
# LLM connects to: http://localhost:3001/mcp (Streamable HTTP)
# Browser viewer:  http://localhost:3001/view/:key
#
# Environment variables:
#   PORT      - listen port (default: 3001)
#   BASE_URL  - public URL for viewer links (auto-detected if unset)

# ── Stage 1: Build MCP server ────────────────────────────────────────────────
FROM node:20-slim AS mcp-builder

WORKDIR /app/excalidraw-mcp

# Copy package files + postinstall scripts so bun gets set up during install
COPY excalidraw-mcp/package.json excalidraw-mcp/package-lock.json ./
COPY excalidraw-mcp/scripts/ scripts/
RUN npm install

# Copy source and build
COPY excalidraw-mcp/ .
RUN npm run build

# ── Stage 2: Build frontend ─────────────────────────────────────────────────
FROM node:20-slim AS frontend-builder

WORKDIR /app/frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ .
RUN npm run build

# ── Stage 3: Production runtime ─────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Install production-only dependencies (no bun, no devDeps)
COPY excalidraw-mcp/package.json excalidraw-mcp/package-lock.json excalidraw-mcp/
RUN cd excalidraw-mcp && npm install --omit=dev --no-optional --ignore-scripts

# Copy built artifacts
COPY --from=mcp-builder /app/excalidraw-mcp/dist  excalidraw-mcp/dist
COPY --from=frontend-builder /app/frontend/dist    frontend/dist

ENV PORT=3001
EXPOSE 3001

CMD ["node", "excalidraw-mcp/dist/index.js", "--static", "frontend/dist"]
