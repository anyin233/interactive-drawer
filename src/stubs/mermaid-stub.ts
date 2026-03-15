/**
 * Stub for @excalidraw/mermaid-to-excalidraw.
 * Excalidraw dynamically imports this package for mermaid diagram conversion,
 * but the server never uses that feature. Stubbing it avoids bundling the
 * 80MB+ mermaid dependency chain.
 */
export function parseMermaidToExcalidraw() {
  throw new Error("Mermaid support not available in server mode");
}
