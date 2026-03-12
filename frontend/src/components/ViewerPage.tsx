/**
 * Viewer page for remote MCP drawing sessions.
 * Accessible at /view/:sessionKey.
 *
 * Fetches session elements from the REST API, renders them as SVG,
 * and provides an Excalidraw editor for user edits that sync back.
 */
import {
  Excalidraw,
  exportToSvg,
  exportToBlob,
  convertToExcalidrawElements,
  restore,
  CaptureUpdateAction,
} from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import morphdom from "morphdom";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawElement = Record<string, any>;

/** Pseudo-element types that are not real Excalidraw elements. */
const PSEUDO_TYPES = new Set(["cameraUpdate", "delete", "restoreCheckpoint"]);
const EXPORT_PADDING = 20;

/** Polling interval for checking if elements have been updated externally. */
const POLL_INTERVAL_MS = 5000;

interface SessionMeta {
  sessionKey: string;
  expiresAt: string;
  hasElements: boolean;
}

/**
 * Convert raw elements using Excalidraw's skeleton API for label support.
 * Elements that already have full Excalidraw properties (e.g. from the editor)
 * are passed through without re-processing to preserve user-set styles.
 *
 * @param els - Raw elements from the session.
 * @returns Converted Excalidraw elements.
 */
function convertRawElements(els: RawElement[]): RawElement[] {
  const pseudos = els.filter((el) => PSEUDO_TYPES.has(el.type));
  const real = els.filter((el) => !PSEUDO_TYPES.has(el.type));

  // Only elements with `label` shorthand need skeleton API conversion.
  // Elements from the Excalidraw editor are already full elements and
  // re-processing them would strip user-set styles (font, roughness, etc.).
  const needsConversion = real.some((el) => el.label != null);

  if (!needsConversion) {
    // Already full Excalidraw elements — pass through as-is
    return [...real, ...pseudos];
  }

  const withDefaults = real.map((el) =>
    el.label
      ? { ...el, label: { textAlign: "center", verticalAlign: "middle", ...el.label } }
      : el,
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const converted = convertToExcalidrawElements(withDefaults as any, {
    regenerateIds: false,
  } as any).map((el: RawElement) =>
    // Only default fontFamily for text created by the skeleton API (no explicit fontFamily)
    el.type === "text" && el.fontFamily == null ? { ...el, fontFamily: 1 } : el,
  );
  return [...converted, ...pseudos];
}

/**
 * Viewer page component for remote MCP sessions.
 *
 * @returns The viewer page element.
 */
/** Inject keyframes for the loading spinner (once). */
const styleId = "viewer-page-keyframes";
if (typeof document !== "undefined" && !document.getElementById(styleId)) {
  const style = document.createElement("style");
  style.id = styleId;
  style.textContent = `@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`;
  document.head.appendChild(style);
}

export default function ViewerPage() {
  const { sessionKey } = useParams<{ sessionKey: string }>();
  const [meta, setMeta] = useState<SessionMeta | null>(null);
  const [elements, setElements] = useState<RawElement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editorSettled, setEditorSettled] = useState(false);
  const [editorReady, setEditorReady] = useState(false);

  const svgRef = useRef<HTMLDivElement | null>(null);
  const svgContainerRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const excalidrawApiRef = useRef<any>(null);
  const convertedElementsRef = useRef<RawElement[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ============================================================
  // Pan & Zoom state
  // ============================================================
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    // Only handle primary button (left click)
    if (e.button !== 0) return;
    setDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, [pan]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setPan({ x: panStartRef.current.x + dx, y: panStartRef.current.y + dy });
  }, [dragging]);

  const handlePointerUp = useCallback(() => {
    setDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.92 : 1 / 0.92;
    setZoom((z) => Math.min(Math.max(z * factor, 0.2), 8));
  }, []);

  /** Double-click resets to default fit view. */
  const handleDoubleClick = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // ============================================================
  // Download helpers
  // ============================================================

  /**
   * Trigger a browser download for a Blob with the given filename.
   *
   * @param blob - Data to download.
   * @param filename - Suggested filename.
   */
  const triggerDownload = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  /**
   * Download the current diagram as an SVG file.
   */
  const handleDownloadSvg = useCallback(async () => {
    const els = convertedElementsRef.current;
    if (els.length === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const svg = await exportToSvg({
      elements: els as any,
      appState: {
        viewBackgroundColor: "transparent",
        exportBackground: false,
      } as any,
      files: null,
      exportPadding: EXPORT_PADDING,
    });

    const svgString = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    triggerDownload(blob, `diagram-${sessionKey ?? "export"}.svg`);
  }, [sessionKey, triggerDownload]);

  /**
   * Download the current diagram as a transparent-background PNG file.
   */
  const handleDownloadPng = useCallback(async () => {
    const els = convertedElementsRef.current;
    if (els.length === 0) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blob = await exportToBlob({
      elements: els as any,
      appState: {
        viewBackgroundColor: "transparent",
        exportBackground: false,
      } as any,
      files: null,
      exportPadding: EXPORT_PADDING,
      mimeType: "image/png",
    });

    triggerDownload(blob, `diagram-${sessionKey ?? "export"}.png`);
  }, [sessionKey, triggerDownload]);

  // ============================================================
  // Fetch session data
  // ============================================================
  const fetchSession = useCallback(async () => {
    if (!sessionKey) return;
    try {
      const metaRes = await fetch(`/api/sessions/${sessionKey}`);
      if (!metaRes.ok) {
        const data = await metaRes.json().catch(() => null);
        setError(data?.error ?? (metaRes.status === 404 ? "Session not found or expired" : "Failed to load session"));
        setLoading(false);
        return;
      }
      const metaData: SessionMeta = await metaRes.json();
      setMeta(metaData);

      if (metaData.hasElements) {
        const elemsRes = await fetch(`/api/sessions/${sessionKey}/elements`);
        if (elemsRes.ok) {
          const { elements: els } = await elemsRes.json();
          setElements(els ?? []);
        }
      }
      setLoading(false);
    } catch {
      setError("Network error — could not connect to server");
      setLoading(false);
    }
  }, [sessionKey]);

  // Initial load
  useEffect(() => {
    fetchSession();
  }, [fetchSession]);

  // Poll for external updates (when not editing)
  useEffect(() => {
    if (isEditing || !sessionKey || error) return;

    const abortController = new AbortController();

    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionKey}/elements`, {
          signal: abortController.signal,
        });
        if (res.ok) {
          const { elements: els } = await res.json();
          if (els && els.length > 0) {
            setElements(els);
          }
        }
      } catch {
        // Polling is best-effort; AbortError on unmount is expected
      }
    }, POLL_INTERVAL_MS);

    return () => {
      abortController.abort();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isEditing, sessionKey, error]);

  // ============================================================
  // SVG rendering
  // ============================================================
  const renderSvgPreview = useCallback(async (els: RawElement[]) => {
    if (els.length === 0 || !svgRef.current) return;

    try {
      const convertedEls = convertRawElements(els);
      const excalidrawEls = convertedEls.filter((el) => !PSEUDO_TYPES.has(el.type));
      if (excalidrawEls.length === 0) return;

      convertedElementsRef.current = excalidrawEls;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const svg = await exportToSvg({
        elements: excalidrawEls as any,
        appState: {
          viewBackgroundColor: "#ffffff",
          exportBackground: true,
        } as any,
        files: null,
        exportPadding: EXPORT_PADDING,
        skipInliningFonts: true,
      });
      if (!svgRef.current) return;

      svg.removeAttribute("height");
      svg.style.width = "100%";
      svg.style.height = "auto";
      svg.style.maxHeight = "100%";
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

      const existing = svgRef.current.querySelector("svg");
      if (existing) {
        morphdom(existing, svg, { childrenOnly: false });
        // Re-apply styles after morphdom
        const rendered = svgRef.current.querySelector("svg") as SVGSVGElement | null;
        if (rendered) {
          rendered.removeAttribute("height");
          rendered.style.width = "100%";
          rendered.style.height = "auto";
          rendered.style.maxHeight = "100%";
          rendered.setAttribute("preserveAspectRatio", "xMidYMid meet");
        }
      } else {
        svgRef.current.appendChild(svg);
      }
    } catch {
      // SVG rendering is best-effort
    }
  }, []);

  // Re-render SVG when elements change
  useEffect(() => {
    if (!isEditing && elements.length > 0) {
      renderSvgPreview(elements);
    }
  }, [elements, isEditing, renderSvgPreview]);

  // ============================================================
  // Editor
  // ============================================================

  /** Sync edits back to the server. */
  const syncEdits = useCallback(async () => {
    const api = excalidrawApiRef.current;
    if (!api || !sessionKey) return;

    const sceneEls = api.getSceneElements() as RawElement[];
    const live = sceneEls.filter((el: RawElement) => !el.isDeleted);
    if (live.length === 0) return;

    setElements(live);
    convertedElementsRef.current = live;

    // PUT to server
    try {
      await fetch(`/api/sessions/${sessionKey}/elements`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ elements: live }),
      });
    } catch {
      // Best-effort sync
    }
  }, [sessionKey]);

  const handleExitEditor = useCallback(() => {
    syncEdits();
    setIsEditing(false);
  }, [syncEdits]);

  /** Prepare elements for the Excalidraw editor. */
  const getEditorElements = useCallback(() => {
    const els = convertedElementsRef.current;
    if (els.length === 0) return [];
    const { elements: restored } = restore(
      { elements: els as any },
      null,
      null,
    );
    return restored;
  }, []);

  // Settle effect: after Excalidraw API is ready, load fonts, refresh dimensions
  useEffect(() => {
    if (!isEditing || !editorReady || editorSettled || !excalidrawApiRef.current) return;
    const api = excalidrawApiRef.current;

    const settle = async () => {
      try { await document.fonts.load("20px Excalifont"); } catch { /* best-effort */ }
      await document.fonts.ready;

      const sceneElements = api.getSceneElements();
      if (sceneElements?.length) {
        const { elements: fixed } = restore(
          { elements: sceneElements },
          null,
          null,
          { refreshDimensions: true },
        );
        api.updateScene({
          elements: fixed,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
      api.scrollToContent();
      requestAnimationFrame(() => setEditorSettled(true));
    };

    const timer = setTimeout(settle, 200);
    return () => clearTimeout(timer);
  }, [isEditing, editorReady, editorSettled]);

  // Reset editor state when exiting
  useEffect(() => {
    if (!isEditing) {
      setEditorSettled(false);
      setEditorReady(false);
    }
  }, [isEditing]);

  // Register non-passive wheel listener so preventDefault() works in Chrome
  useEffect(() => {
    const container = svgContainerRef.current;
    if (!container || isEditing || elements.length === 0) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.92 : 1 / 0.92;
      setZoom((z) => Math.min(Math.max(z * factor, 0.2), 8));
    };

    container.addEventListener("wheel", onWheel, { passive: false });
    return () => container.removeEventListener("wheel", onWheel);
  }, [isEditing, elements.length]);

  // Escape key exits editor
  useEffect(() => {
    if (!isEditing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleExitEditor();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isEditing, handleExitEditor]);

  // ============================================================
  // Render
  // ============================================================

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.center}>
          <div style={styles.spinner} />
          <p style={styles.text}>Loading session...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.center}>
          <h2 style={styles.errorTitle}>Session Unavailable</h2>
          <p style={styles.errorText}>{error}</p>
          <a href="/" style={styles.link}>Go to Interactive Drawer</a>
        </div>
      </div>
    );
  }

  const hasElements = elements.length > 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <a href="/" style={styles.logoLink}>Interactive Drawer</a>
          <span style={styles.separator}>|</span>
          <span style={styles.sessionLabel}>Session Viewer</span>
        </div>
        <div style={styles.headerRight}>
          {meta && (
            <span style={styles.expiry}>
              Expires: {new Date(meta.expiresAt).toLocaleString()}
            </span>
          )}
          {hasElements && !isEditing && (
            <>
              <button style={styles.downloadButton} onClick={handleDownloadSvg}>
                SVG
              </button>
              <button style={styles.downloadButton} onClick={handleDownloadPng}>
                PNG
              </button>
              <button style={styles.editButton} onClick={() => setIsEditing(true)}>
                Edit Diagram
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {!isEditing && (
        <div
          ref={svgContainerRef}
          style={{
            ...styles.svgContainer,
            cursor: dragging ? "grabbing" : "grab",
          }}
          onPointerDown={hasElements ? handlePointerDown : undefined}
          onPointerMove={hasElements ? handlePointerMove : undefined}
          onPointerUp={hasElements ? handlePointerUp : undefined}
          onPointerCancel={hasElements ? handlePointerUp : undefined}
          onDoubleClick={hasElements ? handleDoubleClick : undefined}
        >
          {hasElements ? (
            <div
              ref={svgRef}
              style={{
                ...styles.svgWrapper,
                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                transformOrigin: "center center",
                transition: dragging ? "none" : "transform 0.1s ease-out",
              }}
            />
          ) : (
            <div style={{ ...styles.center, cursor: "default" }}>
              <p style={styles.text}>Waiting for diagram...</p>
              <p style={styles.subtext}>
                An external LLM is creating this diagram via MCP.
                It will appear here automatically.
              </p>
            </div>
          )}
          {/* Zoom indicator */}
          {hasElements && zoom !== 1 && (
            <div style={styles.zoomBadge}>
              {Math.round(zoom * 100)}%
            </div>
          )}
        </div>
      )}

      {/* Excalidraw editor overlay */}
      {isEditing && (
        <div style={styles.editorOverlay}>
          <div style={styles.editorToolbar}>
            <button style={styles.doneButton} onClick={handleExitEditor}>
              Done Editing
            </button>
          </div>
          <div style={{ flex: 1, visibility: editorSettled ? "visible" : "hidden" }}>
            <Excalidraw
              excalidrawAPI={(api: any) => { excalidrawApiRef.current = api; setEditorReady(true); }}
              initialData={{
                elements: getEditorElements() as any,
                scrollToContent: true,
              }}
              theme="light"
            />
          </div>
        </div>
      )}
    </div>
  );
}

/** Inline styles for the viewer page. */
const styles: Record<string, React.CSSProperties> = {
  container: {
    width: "100vw",
    height: "100vh",
    display: "flex",
    flexDirection: "column",
    backgroundColor: "#fafafa",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  },
  center: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    flex: 1,
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 20px",
    borderBottom: "1px solid #e5e7eb",
    backgroundColor: "#fff",
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
  },
  logoLink: {
    color: "#1e1e1e",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: "14px",
  },
  separator: {
    color: "#d1d5db",
  },
  sessionLabel: {
    color: "#6b7280",
    fontSize: "14px",
  },
  expiry: {
    color: "#9ca3af",
    fontSize: "12px",
  },
  downloadButton: {
    padding: "6px 12px",
    backgroundColor: "#fff",
    color: "#374151",
    border: "1px solid #d1d5db",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 500,
  },
  editButton: {
    padding: "6px 16px",
    backgroundColor: "#4a9eed",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 500,
  },
  svgContainer: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    overflow: "hidden",
    position: "relative" as const,
    touchAction: "none",
  },
  svgWrapper: {
    maxWidth: "100%",
    maxHeight: "100%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  text: {
    color: "#6b7280",
    fontSize: "16px",
    margin: 0,
  },
  subtext: {
    color: "#9ca3af",
    fontSize: "14px",
    marginTop: "8px",
    textAlign: "center" as const,
    maxWidth: "400px",
  },
  errorTitle: {
    color: "#ef4444",
    fontSize: "20px",
    marginBottom: "8px",
  },
  errorText: {
    color: "#6b7280",
    fontSize: "16px",
    marginBottom: "16px",
  },
  link: {
    color: "#4a9eed",
    textDecoration: "none",
    fontSize: "14px",
  },
  spinner: {
    width: "24px",
    height: "24px",
    border: "3px solid #e5e7eb",
    borderTopColor: "#4a9eed",
    borderRadius: "50%",
    animation: "spin 0.8s linear infinite",
    marginBottom: "12px",
  },
  editorOverlay: {
    position: "fixed" as const,
    inset: 0,
    zIndex: 100,
    display: "flex",
    flexDirection: "column" as const,
    backgroundColor: "#fff",
  },
  editorToolbar: {
    display: "flex",
    justifyContent: "flex-end",
    padding: "8px 16px",
    borderBottom: "1px solid #e5e7eb",
    zIndex: 101,
  },
  doneButton: {
    padding: "6px 16px",
    backgroundColor: "#22c55e",
    color: "#fff",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "13px",
    fontWeight: 500,
  },
  zoomBadge: {
    position: "absolute" as const,
    bottom: "12px",
    right: "12px",
    padding: "4px 10px",
    backgroundColor: "rgba(0,0,0,0.6)",
    color: "#fff",
    borderRadius: "4px",
    fontSize: "12px",
    fontWeight: 500,
    pointerEvents: "none" as const,
    userSelect: "none" as const,
  },
};
