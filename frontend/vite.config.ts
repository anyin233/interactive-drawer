import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Session API routes → Node.js MCP server (port 3001)
      // Must come before the generic /api rule
      "/api/sessions": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      // MCP endpoint → Node.js MCP server (port 3001)
      "/mcp": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
      // All other API routes → Python backend (port 8000)
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});
