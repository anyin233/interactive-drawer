#!/usr/bin/env node
import { execSync } from "child_process";
import { renameSync, rmSync, cpSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

function run(cmd, env = {}) {
  console.log(`> ${cmd}`);
  execSync(cmd, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

// Packages that must remain external (needed at runtime, can't bundle):
// - Native/binary packages, or packages with dynamic requires
// - Large packages that are dynamically imported
const externalPkgs = [
  "@modelcontextprotocol/sdk", // MCP core SDK
  "cors",                      // Express middleware
  "express",                   // HTTP framework
  "jsdom",                     // Dynamic import in svg-renderer.ts, native
  "zod",                       // Schema validation
  "@upstash/redis",            // Optional, dynamic import
];

// Stub out mermaid (excalidraw imports it but we never use it)
const aliasFlags = '--alias:@excalidraw/mermaid-to-excalidraw=./src/stubs/mermaid-stub.ts';
const loaderFlags = '--loader:.css=empty';

const externalFlags = externalPkgs.map(p => `--external:${p}`).join(" ");

rmSync(join(root, "dist"), { recursive: true, force: true });

// 1. Type-check
run("npx tsc --noEmit");

// 2. Vite build (singlefile mcp-app.html)
run("npx vite build");

// 3. Move the HTML output to dist root (cross-platform)
renameSync(
  join(root, "dist", "src", "mcp-app.html"),
  join(root, "dist", "mcp-app.html"),
);
rmSync(join(root, "dist", "src"), { recursive: true, force: true });

// 4. Build server type declarations
run("npx tsc -p tsconfig.server.json");

// 5. Bundle server + entry with esbuild (selective externals)
// Packages NOT in externalPkgs get bundled in, eliminating runtime deps
// (e.g. @modelcontextprotocol/ext-apps — avoids 59MB Bun binary transitive deps)
run(`npx esbuild src/server.ts --bundle --platform=node --format=esm ${externalFlags} ${aliasFlags} ${loaderFlags} --outfile=dist/server.js`);
run(`npx esbuild src/main.ts --bundle --platform=node --format=esm ${externalFlags} ${aliasFlags} ${loaderFlags} --outfile=dist/index.js --banner:js="#!/usr/bin/env node"`);

// 6. Build viewer (if viewer/ exists)
if (existsSync(join(root, "viewer", "package.json"))) {
  run("cd viewer && npm run build");
  cpSync(join(root, "viewer", "dist"), join(root, "dist", "viewer"), { recursive: true });
  console.log("Viewer built and copied to dist/viewer/");
}

console.log("Build complete!");
