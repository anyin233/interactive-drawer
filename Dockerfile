# Pure Node.js build — serves MCP endpoint + REST API + viewer on a single port.
# Usage:
#   docker build -t interactive-drawer .
#   docker run -d -p 3001:3001 interactive-drawer
#
# LLM connects to: http://localhost:3001/mcp (Streamable HTTP)
# Browser viewer:  http://localhost:3001/view/:key
#
# Environment variables:
#   PORT      - listen port (default: 3001)
#   BASE_URL  - public URL for viewer links (auto-detected if unset)

# ── Stage 1: Build server + viewer ─────────────────────────────────────────
FROM node:20-slim AS builder
WORKDIR /app

# Install root deps (includes devDeps for build: esbuild, vite, typescript)
COPY package.json package-lock.json ./
RUN npm ci

# Install viewer deps
COPY viewer/package.json viewer/package-lock.json ./viewer/
RUN cd viewer && npm ci

# Copy source and build everything (server + viewer)
COPY src/ ./src/
COPY scripts/ ./scripts/
COPY viewer/ ./viewer/
COPY tsconfig.json tsconfig.server.json vite.config.ts ./
RUN npm run build

# ── Stage 2: Production runtime ───────────────────────────────────────────
FROM node:20-slim
WORKDIR /app

# Install production deps only
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Copy built artifacts (server + viewer SPA)
COPY --from=builder /app/dist ./dist

ENV PORT=3001
EXPOSE 3001
CMD ["node", "dist/index.js"]
