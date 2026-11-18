# PRD: Interactive Drawer 重构 —— 移除 Submodule，统一为纯 Node.js MCP Server

**日期：** 2026-03-15
**状态：** Draft

---

## 1. 背景

Interactive Drawer 当前是一个基于 Excalidraw 的全栈绘图平台，包含三个主要模块：

- **excalidraw-mcp**（Git submodule）：Node.js MCP server，提供绘图工具
- **frontend**：React SPA，包含 Chat UI 和 Viewer 两个页面
- **backend**：Python FastAPI，编排 LLM ↔ MCP 的 tool loop

这种架构存在以下问题：

1. **Submodule 管理成本高** —— 版本同步、CI 构建、新贡献者 clone 都需要额外步骤
2. **Chat UI 已不再需要** —— 项目定位已转向纯 MCP server，由外部 LLM 客户端（Claude Desktop、Cursor 等）直接调用
3. **Python backend 仅服务于 Chat** —— 移除 Chat 后无存在必要
4. **缺少 studio style 本地调用支持** —— 无法通过 `npx` 一键启动

---

## 2. 目标

- 将 excalidraw-mcp 代码内联，消除 submodule 依赖
- 移除 Chat UI 和 Python backend，简化为纯 Node.js 项目
- 保留并内置 Interactive Viewer，web 模式下自动可用
- 支持双模式运行：web（默认）和 stdio（本地 MCP）
- 发布为 npm 包，支持 `npx` 调用

## 3. 非目标

- 不重写 MCP server 核心逻辑（session store、SVG renderer、checkpoint 等）
- 不更换前端框架（Viewer 继续使用 React + Excalidraw）
- 不引入新的持久化方案（继续使用内存存储）
- 不提供独立的 REST API 文档站点

---

## 4. 目标架构

```
┌─────────────────────────────────────────────────┐
│              interactive-drawer                  │
│                                                  │
│  ┌───────────┐   ┌───────────┐   ┌───────────┐  │
│  │  MCP Core │   │  HTTP /   │   │  Viewer   │  │
│  │           │   │  Stdio    │   │  (React)  │  │
│  │ - tools   │   │  Transport│   │  SPA      │  │
│  │ - session │   │           │   │           │  │
│  │ - render  │   │           │   │           │  │
│  └─────┬─────┘   └─────┬─────┘   └─────┬─────┘  │
│        │               │               │        │
│        └───────────┬────┘               │        │
│                    │                    │        │
│              ┌─────▼─────┐              │        │
│              │  main.ts   │◄─────built-in│        │
│              │  入口      │   static serve│       │
│              └─────┬──────┘              │        │
│                    │                              │
│         ┌─────────┴──────────┐                   │
│         ▼                    ▼                   │
│   Web Mode (default)    Studio Mode             │
│   - HTTP MCP endpoint   - stdin/stdout          │
│   - REST API            - 无 HTTP server        │
│   - Viewer 自动可用      - 无 Viewer             │
│   - Port 3001           - Claude Desktop 等      │
└─────────────────────────────────────────────────┘
```

---

## 5. 目标目录结构

```
interactive-drawer/
├── src/                        # 核心源码（原 excalidraw-mcp/src/ 内联）
│   ├── main.ts                 # 入口：解析 CLI 参数，启动对应模式
│   ├── server.ts               # Stdio MCP server（Studio 模式）
│   ├── remote-server.ts        # Web MCP server（Web 模式）
│   ├── session-store.ts        # Session 生命周期管理
│   ├── checkpoint-store.ts     # Checkpoint 持久化
│   ├── svg-renderer.ts         # JSDOM SVG 渲染
│   └── shared.ts               # 常量、元素解析、RECALL_CHEAT_SHEET
├── viewer/                     # Viewer 前端（从 frontend/ 精简）
│   ├── src/
│   │   ├── App.tsx             # 仅 Viewer 路由，无 Chat
│   │   ├── components/
│   │   │   └── ViewerPage.tsx  # 核心 viewer 组件
│   │   ├── hooks/
│   │   │   └── useGestures.ts  # 手势交互
│   │   └── index.tsx           # 入口
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json            # Viewer 构建依赖
│   └── tsconfig.json
├── dist/                       # 构建产物
│   ├── index.js                # Server 编译产物
│   └── viewer/                 # Viewer 静态文件（构建时自动生成）
├── package.json                # 项目根配置 + npm 发布配置
├── tsconfig.json
├── vite.config.ts              # Server 构建配置
├── README.md
└── CLAUDE.md
```

**关键变化：**

- `excalidraw-mcp/` 子目录消失，`src/` 直接位于根目录
- `frontend/` 重命名为 `viewer/`，仅保留 ViewerPage 相关代码
- `backend/` 完全删除
- `e2e/` 删除（Chat 相关测试不再适用，后续按需重建）
- `.gitmodules` 删除
- 构建流程统一：`npm run build` 同时构建 server + viewer

---

## 6. 运行模式详细设计

### 6.1 Studio 模式（`--stdio`）

Studio 模式下，行为与原版 excalidraw-mcp 的 stdio 模式完全一致：

```bash
# npx 调用
npx interactive-drawer --stdio

# 本地调用
node dist/index.js --stdio
```

**行为规范：**

- 通过 stdin/stdout 进行 JSON-RPC 通信
- **不启动** HTTP server，不提供 Viewer
- 暴露的 MCP 工具与原版一致：`read_me`、`create_view`
- `create_session` 和 `get_current_view` **不可用**（无 HTTP 端，无 session 概念）
- SVG 渲染结果直接作为 tool response 返回（base64 image）
- 适用于 Claude Desktop、Claude Code、Cursor 等本地 MCP 客户端

**Claude Desktop 配置示例：**

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

### 6.2 Web 模式（默认）

```bash
# npx 调用
npx interactive-drawer

# 本地调用
node dist/index.js

# 自定义端口和 URL
PORT=8080 BASE_URL=https://draw.example.com node dist/index.js
```

**行为规范：**

- 启动 HTTP server（默认端口 3001）
- MCP endpoint：`POST /mcp`（Streamable HTTP Transport）
- Viewer **自动内置**，无需 `--static` 参数
- 暴露全部 4 个 MCP 工具：`create_session`、`read_me`、`create_view`、`get_current_view`
- REST API 保留：`/api/sessions/:key/elements`、`/api/sessions/:key/svg` 等
- Viewer 路由：`/view/:sessionKey`
- 根路径 `/` 显示 landing page（简要说明 + 最近 session 列表）

### 6.3 工具可用性矩阵

| MCP Tool | Studio (`--stdio`) | Web (默认) |
|----------|:------------------:|:----------:|
| `read_me` | ✅ | ✅ |
| `create_view` | ✅（返回 SVG） | ✅（返回 SVG + viewer link） |
| `create_session` | ❌ | ✅ |
| `get_current_view` | ❌ | ✅ |

---

## 7. 需移除的功能清单

### 7.1 Chat 前端（frontend/）

| 文件/组件 | 说明 |
|-----------|------|
| `ChatPanel.tsx` | 聊天消息面板 |
| `ChatInput.tsx` | 用户输入框 |
| `MessageBubble.tsx` | 消息气泡组件 |
| `DrawingPanel.tsx` | Chat 模式下的绘图面板 |
| `SettingsModal.tsx` | LLM API 配置弹窗 |
| `useChat.ts` | Chat 状态管理 + SSE 流式处理 |
| `useSettings.ts` | LLM API 配置持久化 |
| `services/api.ts` | `streamChat()` SSE 连接 |
| `types/index.ts` | `Message`、`ApiConfig`、`SSEEvent` 类型 |

Chat 相关路由（`/` 路径的 ChatLayout）从 `App.tsx` 中移除。

### 7.2 Python Backend（backend/）

| 目录/文件 | 说明 |
|-----------|------|
| `backend/app/main.py` | FastAPI 入口 |
| `backend/app/routers/chat.py` | SSE Chat 端点 |
| `backend/app/services/mcp_client.py` | MCP 子进程管理 |
| `backend/app/services/tool_loop.py` | LLM ↔ MCP agentic loop |
| `backend/app/services/llm_service.py` | OpenAI 客户端工厂 |
| `backend/app/models/schemas.py` | Pydantic 数据模型 |
| `backend/app/tests/` | 全部后端测试 |
| `backend/pyproject.toml` | Python 项目配置 |

整个 `backend/` 目录删除，不保留任何 Python 依赖。

### 7.3 其他清理

| 项目 | 处理方式 |
|------|----------|
| `.gitmodules` | 删除 |
| `excalidraw-mcp/` | 代码内联至 `src/` 后删除子目录 |
| `e2e/` | 删除（Chat 测试不再适用） |
| `scripts/setup.sh` | 删除（不再需要 submodule init + Python 环境） |
| `Dockerfile` | 重写（纯 Node.js，不再需要 Python） |
| `docker-compose.yml` | 简化为单服务 |
| `DEPLOYMENT.md` | 重写（移除 Python/多进程相关内容） |

---

## 8. 需保留的功能清单

### 8.1 MCP Server 核心

| 模块 | 来源 | 保留原因 |
|------|------|----------|
| `remote-server.ts` | excalidraw-mcp | Web 模式 MCP 工具实现 |
| `server.ts` | excalidraw-mcp | Studio 模式 MCP 工具实现 |
| `session-store.ts` | excalidraw-mcp | Session 生命周期（24h TTL、最多 100 个） |
| `checkpoint-store.ts` | excalidraw-mcp | 增量绘图 checkpoint 支持 |
| `svg-renderer.ts` | excalidraw-mcp | JSDOM 服务端 SVG 渲染 |
| `shared.ts` | excalidraw-mcp | 元素解析、颜色常量、RECALL_CHEAT_SHEET |
| `main.ts` | excalidraw-mcp | 入口 + CLI 参数解析（需修改，移除 `--static`） |

### 8.2 Interactive Viewer

| 模块 | 来源 | 保留原因 |
|------|------|----------|
| `ViewerPage.tsx` | frontend | 核心 viewer：SVG 渲染、pan/zoom、编辑器覆盖层 |
| `useGestures.ts` | frontend | 触摸手势交互（拖拽、缩放、双击重置） |
| Excalidraw 编辑器集成 | frontend | "Edit Diagram" 全屏编辑 + 同步回 server |
| 导出功能 | frontend | 下载 Excalidraw JSON / SVG / PNG |
| 字体预加载 | frontend | Excalifont 预加载保证文字渲染准确 |

### 8.3 REST API（Web 模式）

| Endpoint | 方法 | 说明 |
|----------|------|------|
| `/mcp` | POST | MCP Streamable HTTP Transport |
| `/api/sessions/:key` | GET | Session 元数据 |
| `/api/sessions/:key/elements` | GET | 当前元素 JSON |
| `/api/sessions/:key/elements` | PUT | 更新元素（用户编辑） |
| `/api/sessions/:key/svg` | GET | 渲染 SVG |
| `/view/:key` | GET | Viewer SPA 页面（前端路由） |
| `/` | GET | Landing page |

---

## 9. 新增功能

### 9.1 npm 包发布支持

**package.json 关键配置：**

```json
{
  "name": "interactive-drawer",
  "bin": {
    "interactive-drawer": "dist/index.js"
  },
  "files": [
    "dist/"
  ],
  "scripts": {
    "build": "npm run build:server && npm run build:viewer",
    "build:server": "vite build",
    "build:viewer": "cd viewer && npm run build && cp -r dist ../dist/viewer",
    "prepublishOnly": "npm run build"
  }
}
```

**要点：**

- `bin` 字段确保 `npx interactive-drawer` 可执行
- `files` 仅包含 `dist/`，发布体积最小化
- `dist/viewer/` 包含预构建的 Viewer 静态文件
- `prepublishOnly` 确保发布前自动构建

### 9.2 CLI 参数设计

```
interactive-drawer [options]

Options:
  --stdio          以 Studio 模式启动（stdin/stdout MCP transport）
  --port <number>  HTTP server 端口（默认 3001，仅 Web 模式）
  --base-url <url> 公开访问 URL（用于生成 viewer 链接，仅 Web 模式）
  --help           显示帮助信息
  --version        显示版本号

Environment Variables:
  PORT             等同于 --port
  BASE_URL         等同于 --base-url
```

**与原版 excalidraw-mcp CLI 的差异：**

| 参数 | 原版 | 重构后 |
|------|------|--------|
| `--stdio` | ✅ | ✅（保留，重命名概念为 Studio 模式） |
| `--static <dir>` | ✅ | ❌（移除，Viewer 自动内置） |
| `--base-url` | ✅ | ✅（保留） |
| `--port` | ❌（仅环境变量） | ✅（新增 CLI 参数，兼容环境变量） |

### 9.3 main.ts 入口逻辑修改

```typescript
// 伪代码
const args = parseArgs(process.argv);

if (args.stdio) {
  // Studio 模式：继承原版 stdio 行为
  startStdioServer();
} else {
  // Web 模式（默认）
  const app = express();

  // MCP endpoint
  app.post('/mcp', mcpHandler);

  // REST API
  app.get('/api/sessions/:key', ...);
  app.get('/api/sessions/:key/elements', ...);
  app.put('/api/sessions/:key/elements', ...);
  app.get('/api/sessions/:key/svg', ...);

  // Viewer 静态文件（自动内置）
  const viewerDir = path.join(__dirname, 'viewer');
  app.use(express.static(viewerDir));

  // SPA fallback（/view/:key 等前端路由）
  app.get('/view/*', (req, res) => {
    res.sendFile(path.join(viewerDir, 'index.html'));
  });

  app.listen(port);
}
```

---

## 10. 构建流程

### 10.1 开发环境

```bash
git clone <repo>
cd interactive-drawer
npm install
cd viewer && npm install && cd ..

# 开发模式（server + viewer 热重载）
npm run dev
```

### 10.2 生产构建

```bash
npm run build
# 1. 编译 src/ → dist/index.js（Vite/tsc）
# 2. 编译 viewer/src/ → dist/viewer/（Vite）
# 产物全部在 dist/ 下，可直接 node dist/index.js 启动
```

### 10.3 Docker

```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
COPY viewer/package*.json ./viewer/
RUN npm ci && cd viewer && npm ci
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["node", "dist/index.js"]
```

单阶段构建，最终镜像仅包含 Node.js 运行时 + `dist/`。

---

## 11. 迁移计划

按以下顺序执行，每步完成后可独立验证：

### Phase 1: 代码内联（无功能变更）

1. 将 `excalidraw-mcp/src/` 复制到根目录 `src/`
2. 将 `excalidraw-mcp/package.json` 的依赖合并到根 `package.json`
3. 将 `excalidraw-mcp/vite.config.ts`、`tsconfig.json` 适配到根目录
4. 修改 `src/main.ts` 中的路径引用
5. 验证：`npm run build && node dist/index.js` 行为与原 submodule 一致
6. 删除 `excalidraw-mcp/` 目录和 `.gitmodules`

### Phase 2: 移除 Chat + Backend

1. 删除 `backend/` 目录
2. 将 `frontend/` 重命名为 `viewer/`
3. 从 `viewer/` 中移除 Chat 相关组件（ChatPanel、ChatInput、MessageBubble、DrawingPanel、SettingsModal）
4. 从 `viewer/` 中移除 Chat 相关 hooks（useChat、useSettings）和 services（api.ts）
5. 简化 `viewer/src/App.tsx`：仅保留 `/view/:sessionKey` 路由和根路径 landing page
6. 清理 `viewer/package.json` 中不再需要的依赖
7. 验证：`npm run build:viewer` 成功，Viewer 页面正常加载

### Phase 3: Viewer 自动内置

1. 修改 `src/main.ts`：移除 `--static` 参数
2. Web 模式启动时自动从 `dist/viewer/` 提供静态文件
3. 添加 SPA fallback 路由（`/view/*` → `index.html`）
4. 修改构建脚本：`npm run build` 同时构建 server + viewer，viewer 产物输出到 `dist/viewer/`
5. 验证：`node dist/index.js` 启动后，浏览器访问 `/view/:key` 正常工作

### Phase 4: npm 包发布配置

1. 更新 `package.json`：添加 `bin`、`files`、`prepublishOnly`
2. `dist/index.js` 顶部添加 `#!/usr/bin/env node` shebang
3. 编写 `.npmignore` 或确认 `files` 白名单覆盖正确
4. 本地测试：`npm pack && npx ./interactive-drawer-*.tgz --stdio`
5. 本地测试：`npm pack && npx ./interactive-drawer-*.tgz`（Web 模式）
6. 验证：两种模式均可通过 npx 正常启动

### Phase 5: 清理与文档更新

1. 删除 `e2e/`、`scripts/setup.sh`
2. 重写 `Dockerfile`（纯 Node.js）
3. 简化 `docker-compose.yml`
4. 重写 `README.md`（移除 Chat 相关内容，更新架构图）
5. 重写 `DEPLOYMENT.md`（移除 Python/多进程内容）
6. 更新 `CLAUDE.md`

---

## 12. 验收标准

### 功能验收

- [ ] `node dist/index.js --stdio` 启动 Studio 模式，可通过 MCP 客户端调用 `read_me` 和 `create_view`
- [ ] `node dist/index.js` 启动 Web 模式，`POST /mcp` 可调用全部 4 个工具
- [ ] Web 模式下浏览器访问 `/view/:key` 可查看图表、pan/zoom、编辑、导出
- [ ] `npx interactive-drawer --stdio` 可正常启动 Studio 模式
- [ ] `npx interactive-drawer` 可正常启动 Web 模式并访问 Viewer
- [ ] Docker 镜像构建成功，容器启动后两种模式均可用

### 非功能验收

- [ ] 项目无 Python 依赖
- [ ] 项目无 Git submodule
- [ ] `npm install` 后无需额外步骤即可构建
- [ ] `npm pack` 产物体积合理（< 10MB）
- [ ] 无 Chat 相关代码残留（组件、hooks、services、types）
