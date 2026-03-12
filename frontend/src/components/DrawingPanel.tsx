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
import type { ExcalidrawElement } from "../types";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawElement = Record<string, any>;

// ============================================================
// Shared helpers (ported from excalidraw-mcp/src/mcp-app.tsx)
// ============================================================

/** Pseudo-element types emitted by the LLM that are not real Excalidraw elements. */
const PSEUDO_TYPES = new Set(["cameraUpdate", "delete", "restoreCheckpoint"]);

const LERP_SPEED = 0.03;
const EXPORT_PADDING = 20;

interface ViewportRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Parse a potentially-incomplete JSON array string into elements.
 * During streaming the last element may be truncated mid-JSON.
 *
 * @param str - Raw JSON string (may be incomplete).
 * @returns Parsed element array, or empty array on failure.
 */
function parsePartialElements(str: string | undefined): RawElement[] {
  if (!str?.trim().startsWith("[")) return [];
  try {
    return JSON.parse(str);
  } catch {
    /* partial */
  }
  const last = str.lastIndexOf("}");
  if (last < 0) return [];
  try {
    return JSON.parse(str.substring(0, last + 1) + "]");
  } catch {
    /* incomplete */
  }
  return [];
}

/**
 * Drop the last element from an array (it may be incomplete during streaming).
 *
 * @param arr - Array of elements.
 * @returns Array without the last item, or empty if <= 1 items.
 */
function excludeIncompleteLastItem<T>(arr: T[]): T[] {
  if (!arr || arr.length <= 1) return [];
  return arr.slice(0, -1);
}

/**
 * Convert raw LLM elements to Excalidraw format.
 * Handles label shorthand via convertToExcalidrawElements and
 * preserves pseudo-elements (cameraUpdate, delete, restoreCheckpoint).
 *
 * @param els - Raw elements from LLM output.
 * @returns Converted Excalidraw elements with pseudo-elements appended.
 */
function convertRawElements(els: RawElement[]): RawElement[] {
  const pseudos = els.filter((el) => PSEUDO_TYPES.has(el.type));
  const real = els.filter((el) => !PSEUDO_TYPES.has(el.type));

  // Skip skeleton API conversion if elements are already full Excalidraw objects
  // (e.g. from the editor). Re-processing would strip user-set styles.
  const needsConversion = real.some((el) => el.label != null);
  if (!needsConversion) {
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
    el.type === "text" && el.fontFamily == null ? { ...el, fontFamily: 1 } : el,
  );
  return [...converted, ...pseudos];
}

/**
 * Separate viewport/delete pseudo-elements from real drawing elements.
 *
 * @param elements - Mixed array of real + pseudo elements.
 * @returns Extracted viewport, drawing elements, and delete IDs.
 */
function extractViewportAndElements(elements: RawElement[]): {
  viewport: ViewportRect | null;
  drawElements: RawElement[];
  deleteIds: Set<string>;
} {
  let viewport: ViewportRect | null = null;
  const deleteIds = new Set<string>();
  const drawElements: RawElement[] = [];

  for (const el of elements) {
    if (el.type === "cameraUpdate") {
      viewport = { x: el.x, y: el.y, width: el.width, height: el.height };
    } else if (el.type === "delete") {
      for (const id of String(el.ids ?? el.id).split(",")) deleteIds.add(id.trim());
    } else if (el.type !== "restoreCheckpoint") {
      drawElements.push(el);
    }
  }

  // Hide deleted elements via near-zero opacity (preserves SVG group order for morphdom)
  const processedDraw =
    deleteIds.size > 0
      ? drawElements.map((el) =>
          deleteIds.has(el.id) || deleteIds.has(el.containerId)
            ? { ...el, opacity: 1 }
            : el,
        )
      : drawElements;

  return { viewport, drawElements: processedDraw, deleteIds };
}

/**
 * Fix SVG viewBox to 4:3 aspect ratio by expanding the smaller dimension.
 *
 * @param svg - The SVG element to fix.
 */
function fixViewBox4x3(svg: SVGSVGElement): void {
  const vb = svg.getAttribute("viewBox")?.split(" ").map(Number);
  if (!vb || vb.length !== 4) return;
  const [vx, vy, vw, vh] = vb;
  const r = vw / vh;
  if (Math.abs(r - 4 / 3) < 0.01) return;
  if (r > 4 / 3) {
    const h2 = Math.round((vw * 3) / 4);
    svg.setAttribute("viewBox", `${vx} ${vy - Math.round((h2 - vh) / 2)} ${vw} ${h2}`);
  } else {
    const w2 = Math.round((vh * 4) / 3);
    svg.setAttribute("viewBox", `${vx - Math.round((w2 - vw) / 2)} ${vy} ${w2} ${vh}`);
  }
}

/**
 * Compute the bounding box origin of all elements in scene coordinates.
 * Matches the offset exportToSvg applies internally.
 *
 * @param elements - Excalidraw elements in scene coordinates.
 * @returns The minimum x and y across all elements.
 */
function computeSceneBounds(elements: RawElement[]): { minX: number; minY: number } {
  let minX = Infinity;
  let minY = Infinity;
  for (const el of elements) {
    if (el.x != null) {
      minX = Math.min(minX, el.x);
      minY = Math.min(minY, el.y);
      if (el.points && Array.isArray(el.points)) {
        for (const pt of el.points) {
          minX = Math.min(minX, el.x + pt[0]);
          minY = Math.min(minY, el.y + pt[1]);
        }
      }
    }
  }
  return { minX: isFinite(minX) ? minX : 0, minY: isFinite(minY) ? minY : 0 };
}

/**
 * Convert a scene-space viewport rect to SVG-space viewBox values.
 *
 * @param vp - Viewport rectangle in scene coordinates.
 * @param sceneMinX - Scene bounding box min X.
 * @param sceneMinY - Scene bounding box min Y.
 * @returns SVG viewBox x, y, w, h.
 */
function sceneToSvgViewBox(
  vp: ViewportRect,
  sceneMinX: number,
  sceneMinY: number,
): { x: number; y: number; w: number; h: number } {
  return {
    x: vp.x - sceneMinX + EXPORT_PADDING,
    y: vp.y - sceneMinY + EXPORT_PADDING,
    w: vp.width,
    h: vp.height,
  };
}

// ============================================================
// DrawingPanel component
// ============================================================

interface DrawingPanelProps {
  elements: ExcalidrawElement[];
  isStreaming: boolean;
  onScreenshot?: (base64: string) => void;
  onElementsChange?: (elements: ExcalidrawElement[]) => void;
}

/**
 * SVG-based Excalidraw renderer with an interactive editor overlay.
 *
 * Default mode: SVG preview using exportToSvg + morphdom (read-only, animated).
 * Edit mode: Full <Excalidraw> canvas overlay for interactive editing.
 * Toggle via the "Edit" button (top-right on hover) or Escape to exit.
 *
 * @param elements - Excalidraw elements from the LLM (via SSE).
 * @param isStreaming - Whether elements are still being streamed.
 * @param onScreenshot - Callback invoked with base64 PNG after final render.
 */
export default function DrawingPanel({ elements, isStreaming, onScreenshot, onElementsChange }: DrawingPanelProps) {
  const svgRef = useRef<HTMLDivElement | null>(null);
  const latestCountRef = useRef(0);
  const prevElementsRef = useRef<ExcalidrawElement[]>([]);
  const screenshotTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Edit mode state
  const [isEditing, setIsEditing] = useState(false);
  const [editorSettled, setEditorSettled] = useState(false);
  const [editorReady, setEditorReady] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const excalidrawApiRef = useRef<any>(null);
  // Store the converted elements for the editor
  const convertedElementsRef = useRef<RawElement[]>([]);

  // Font preloading
  const fontsReady = useRef<Promise<void> | null>(null);
  const ensureFontsLoaded = useCallback(() => {
    if (!fontsReady.current) {
      fontsReady.current = document.fonts.load("20px Excalifont").then(() => {});
    }
    return fontsReady.current;
  }, []);

  // Animated viewport state (scene coordinates)
  const animatedVP = useRef<ViewportRect | null>(null);
  const targetVP = useRef<ViewportRect | null>(null);
  const sceneBoundsRef = useRef<{ minX: number; minY: number }>({ minX: 0, minY: 0 });
  const animFrameRef = useRef(0);

  // User zoom state
  const zoomRef = useRef({ scale: 1, panX: 0, panY: 0 });
  const baseViewBoxRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);

  /** Apply user zoom on top of the stored base viewBox. */
  const applyZoom = useCallback(() => {
    if (!svgRef.current || !baseViewBoxRef.current) return;
    const svg = svgRef.current.querySelector("svg");
    if (!svg) return;
    const { x, y, w, h } = baseViewBoxRef.current;
    const { scale, panX, panY } = zoomRef.current;
    const zw = w / scale;
    const zh = h / scale;
    svg.setAttribute(
      "viewBox",
      `${x + (w - zw) / 2 + panX} ${y + (h - zh) / 2 + panY} ${zw} ${zh}`,
    );
  }, []);

  /** Apply current animated scene-space viewport to the SVG, then user zoom. */
  const applyViewBox = useCallback(() => {
    if (!animatedVP.current || !svgRef.current) return;
    const svg = svgRef.current.querySelector("svg");
    if (!svg) return;
    const { minX, minY } = sceneBoundsRef.current;
    const vp = animatedVP.current;
    const ratio = vp.width / vp.height;
    const vp4x3: ViewportRect =
      Math.abs(ratio - 4 / 3) < 0.01
        ? vp
        : ratio > 4 / 3
          ? { ...vp, height: Math.round((vp.width * 3) / 4) }
          : { ...vp, width: Math.round((vp.height * 4) / 3) };
    const vb = sceneToSvgViewBox(vp4x3, minX, minY);
    baseViewBoxRef.current = { x: vb.x, y: vb.y, w: vb.w, h: vb.h };
    applyZoom();
  }, [applyZoom]);

  /** Lerp scene-space viewport toward target each frame. */
  const animateViewBox = useCallback(() => {
    if (!animatedVP.current || !targetVP.current) return;
    const a = animatedVP.current;
    const t = targetVP.current;
    a.x += (t.x - a.x) * LERP_SPEED;
    a.y += (t.y - a.y) * LERP_SPEED;
    a.width += (t.width - a.width) * LERP_SPEED;
    a.height += (t.height - a.height) * LERP_SPEED;
    applyViewBox();
    const delta =
      Math.abs(t.x - a.x) +
      Math.abs(t.y - a.y) +
      Math.abs(t.width - a.width) +
      Math.abs(t.height - a.height);
    if (delta > 0.5) {
      animFrameRef.current = requestAnimationFrame(animateViewBox);
    }
  }, [applyViewBox]);

  // Cleanup animation on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  /**
   * Core render pipeline: convert elements, export to SVG, diff with morphdom.
   *
   * @param els - Elements to render.
   * @param viewport - Optional camera viewport for animated framing.
   */
  const renderSvgPreview = useCallback(
    async (els: RawElement[], viewport: ViewportRect | null) => {
      if (els.length === 0 || !svgRef.current) return;
      try {
        await ensureFontsLoaded();

        const convertedEls = convertRawElements(els);
        const excalidrawEls = convertedEls.filter((el) => !PSEUDO_TYPES.has(el.type));

        if (excalidrawEls.length === 0) return;

        // Store converted elements for the editor
        convertedElementsRef.current = excalidrawEls;

        sceneBoundsRef.current = computeSceneBounds(excalidrawEls);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const svg = await exportToSvg({
          elements: excalidrawEls as any,
          appState: {
            viewBackgroundColor: "transparent",
            exportBackground: false,
          } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          files: null,
          exportPadding: EXPORT_PADDING,
          skipInliningFonts: true,
        });
        if (!svgRef.current) return;

        let wrapper = svgRef.current.querySelector(".svg-wrapper") as HTMLDivElement | null;
        if (!wrapper) {
          wrapper = document.createElement("div");
          wrapper.className = "svg-wrapper";
          svgRef.current.appendChild(wrapper);
        }

        // Let SVG scale based on its intrinsic aspect ratio while fitting the container.
        // max-width/max-height constrain it; width/height auto preserves aspect ratio.
        svg.removeAttribute("width");
        svg.removeAttribute("height");
        svg.style.maxWidth = "100%";
        svg.style.maxHeight = "100%";
        svg.style.width = "auto";
        svg.style.height = "auto";
        svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
        svg.style.overflow = "hidden";

        const existing = wrapper.querySelector("svg");
        if (existing) {
          morphdom(existing, svg, { childrenOnly: false });
        } else {
          wrapper.appendChild(svg);
        }

        // Compute the actual bounding box of all rendered content and set a
        // viewBox that fully contains it — exportToSvg's viewBox can be stale
        // when morphdom reuses the old SVG element.
        const renderedSvg = wrapper.querySelector("svg") as SVGSVGElement | null;
        if (renderedSvg) {
          // Force styles on the rendered SVG (morphdom may not sync them)
          renderedSvg.removeAttribute("width");
          renderedSvg.removeAttribute("height");
          renderedSvg.style.maxWidth = "100%";
          renderedSvg.style.maxHeight = "100%";
          renderedSvg.style.width = "auto";
          renderedSvg.style.height = "auto";
          renderedSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
          renderedSvg.style.overflow = "hidden";

          // Compute viewBox from the actual bounding box of ALL rendered content.
          // exportToSvg's viewBox can be stale when morphdom reuses the old SVG.
          renderedSvg.style.overflow = "visible";
          try {
            const bbox = renderedSvg.getBBox();
            if (bbox && bbox.width > 0 && bbox.height > 0) {
              const pad = EXPORT_PADDING;
              const vb = `${bbox.x - pad} ${bbox.y - pad} ${bbox.width + pad * 2} ${bbox.height + pad * 2}`;
              renderedSvg.setAttribute("viewBox", vb);
            }
          } catch {
            // getBBox may fail; fall back to exportToSvg viewBox
          }
          renderedSvg.style.overflow = "hidden";

          const vbAttr = renderedSvg.getAttribute("viewBox")?.split(" ").map(Number);
          if (vbAttr && vbAttr.length === 4) {
            baseViewBoxRef.current = {
              x: vbAttr[0],
              y: vbAttr[1],
              w: vbAttr[2],
              h: vbAttr[3],
            };
          }
        }

        // Animate viewport only when an explicit cameraUpdate is present.
        // Otherwise keep the viewBox that exportToSvg produced (after 4:3 fix).
        if (viewport) {
          targetVP.current = { ...viewport };
          if (!animatedVP.current) {
            animatedVP.current = { ...viewport };
          }
          applyViewBox();
          if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
          animFrameRef.current = requestAnimationFrame(animateViewBox);
        } else {
          // No explicit viewport — use the viewBox from exportToSvg as-is
          applyZoom();
        }
      } catch {
        // exportToSvg can fail on partial/malformed elements — silently ignore
      }
    },
    [applyViewBox, animateViewBox, applyZoom, ensureFontsLoaded],
  );

  /**
   * Capture a PNG screenshot of the current elements and pass it
   * to the onScreenshot callback as a base64 string.
   *
   * @param els - The Excalidraw elements to capture.
   */
  const captureScreenshot = useCallback(
    async (els: RawElement[]) => {
      if (!onScreenshot || els.length === 0) return;
      try {
        const convertedEls = convertRawElements(els);
        const excalidrawEls = convertedEls.filter((el) => !PSEUDO_TYPES.has(el.type));
        if (excalidrawEls.length === 0) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const blob = await exportToBlob({
          elements: excalidrawEls as any,
          appState: {
            viewBackgroundColor: "#ffffff",
            exportBackground: true,
          } as any, // eslint-disable-line @typescript-eslint/no-explicit-any
          files: null,
          exportPadding: EXPORT_PADDING,
          maxWidthOrHeight: 512,
        });

        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          // Strip the data:image/png;base64, prefix
          const base64 = result.split(",")[1];
          if (base64) {
            onScreenshot(base64);
          }
        };
        reader.readAsDataURL(blob);
      } catch {
        // Screenshot capture is best-effort
      }
    },
    [onScreenshot],
  );

  /**
   * Read back elements from the Excalidraw editor, update local state,
   * propagate to parent, and re-render SVG preview + capture screenshot.
   */
  const syncEditedElements = useCallback(() => {
    const api = excalidrawApiRef.current;
    if (!api) return;
    const sceneEls = api.getSceneElements() as RawElement[];
    const live = sceneEls.filter((el: RawElement) => !el.isDeleted);
    if (live.length === 0) return;
    convertedElementsRef.current = live;
    if (onElementsChange) {
      onElementsChange(live as ExcalidrawElement[]);
    }
    renderSvgPreview(live, null);
    captureScreenshot(live);
  }, [onElementsChange, renderSvgPreview, captureScreenshot]);

  /**
   * Exit the editor: sync changes back, then close.
   */
  const handleExitEditor = useCallback(() => {
    syncEditedElements();
    setIsEditing(false);
  }, [syncEditedElements]);

  // Main render effect — responds to element/streaming changes
  useEffect(() => {
    if (!elements || elements.length === 0) return;

    const rawEls = elements as RawElement[];

    if (isStreaming) {
      // Streaming mode: parse partial, drop last incomplete, randomize seeds
      const { viewport, drawElements } = extractViewportAndElements(rawEls);

      // Only re-render when element count changes
      if (drawElements.length > 0 && drawElements.length !== latestCountRef.current) {
        latestCountRef.current = drawElements.length;
        // Randomize seeds for hand-drawn animation effect during streaming
        const jittered = drawElements.map((el) => ({
          ...el,
          seed: Math.floor(Math.random() * 1e9),
        }));
        renderSvgPreview(jittered, viewport);
      }
    } else {
      // Final render: use original seeds for stable output
      const { viewport, drawElements } = extractViewportAndElements(rawEls);

      if (drawElements.length > 0) {
        latestCountRef.current = drawElements.length;
        renderSvgPreview(drawElements, viewport);

        // Debounced screenshot capture (500ms after final render)
        if (screenshotTimerRef.current) {
          clearTimeout(screenshotTimerRef.current);
        }
        screenshotTimerRef.current = setTimeout(() => {
          captureScreenshot(drawElements);
        }, 500);
      }
    }

    prevElementsRef.current = elements;
  }, [elements, isStreaming, renderSvgPreview, captureScreenshot]);

  // Exit edit mode when new streaming starts (sync edits first)
  useEffect(() => {
    if (isStreaming && isEditing) {
      syncEditedElements();
      setIsEditing(false);
    }
  }, [isStreaming, isEditing, syncEditedElements]);

  // Cleanup screenshot timer on unmount
  useEffect(() => {
    return () => {
      if (screenshotTimerRef.current) clearTimeout(screenshotTimerRef.current);
    };
  }, []);

  // Zoom: pinch-to-zoom / Ctrl+scroll, pan when zoomed, double-click to reset
  useEffect(() => {
    const container = svgRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      const isZoomGesture = e.ctrlKey || e.metaKey;
      const isZoomedIn = Math.abs(zoomRef.current.scale - 1) > 0.01;

      if (!isZoomGesture && !isZoomedIn) return;
      e.preventDefault();

      const zoom = zoomRef.current;
      if (isZoomGesture) {
        const factor = e.deltaY > 0 ? 0.97 : 1.03;
        const newScale = Math.max(0.25, Math.min(8, zoom.scale * factor));
        if (baseViewBoxRef.current) {
          const rect = container.getBoundingClientRect();
          const mx = (e.clientX - rect.left) / rect.width;
          const my = (e.clientY - rect.top) / rect.height;
          const { w, h } = baseViewBoxRef.current;
          zoom.panX += w * (1 / newScale - 1 / zoom.scale) * (0.5 - mx);
          zoom.panY += h * (1 / newScale - 1 / zoom.scale) * (0.5 - my);
        }
        zoom.scale = newScale;
      } else if (baseViewBoxRef.current) {
        const { w, h } = baseViewBoxRef.current;
        zoom.panX += (e.deltaX / container.clientWidth) * (w / zoom.scale);
        zoom.panY += (e.deltaY / container.clientHeight) * (h / zoom.scale);
      }
      applyZoom();
    };

    const handleDblClick = () => {
      zoomRef.current = { scale: 1, panX: 0, panY: 0 };
      applyZoom();
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    container.addEventListener("dblclick", handleDblClick);
    return () => {
      container.removeEventListener("wheel", handleWheel);
      container.removeEventListener("dblclick", handleDblClick);
    };
  }, [applyZoom]);

  // Keyboard shortcut: Escape to exit edit mode (with sync)
  useEffect(() => {
    if (!isEditing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleExitEditor();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [isEditing, handleExitEditor]);

  // Prepare elements for the Excalidraw editor (no refreshDimensions —
  // the settle effect handles that after fonts load)
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

  // Settle effect: after Excalidraw API is ready, load fonts, refresh dimensions, then reveal
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

  // Reset editor state when exiting edit mode
  useEffect(() => {
    if (!isEditing) {
      setEditorSettled(false);
      setEditorReady(false);
    }
  }, [isEditing]);

  const hasElements = elements && elements.length > 0;

  return (
    <div className="drawing-panel">
      {/* SVG Preview (always present behind editor) */}
      <div
        ref={svgRef}
        className="svg-preview-container"
        style={{
          display: isEditing ? "none" : "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      />

      {/* Edit button — shown on hover when there are elements and not streaming */}
      {hasElements && !isStreaming && !isEditing && (
        <div className="edit-toolbar">
          <button
            className="edit-button"
            onClick={() => setIsEditing(true)}
            title="Edit diagram in Excalidraw"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8.5 1.5H12.5V5.5" />
              <path d="M5.5 12.5H1.5V8.5" />
              <path d="M12.5 1.5L8 6" />
              <path d="M1.5 12.5L6 8" />
            </svg>
            <span>Edit</span>
          </button>
        </div>
      )}

      {/* Fullscreen Excalidraw editor overlay */}
      {isEditing && (
        <div className="editor-overlay">
          <div className="editor-toolbar">
            <button
              className="edit-button"
              onClick={handleExitEditor}
              title="Back to preview (Esc)"
            >
              Done
            </button>
          </div>
          <div className="editor-canvas" style={{ visibility: editorSettled ? "visible" : "hidden" }}>
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
