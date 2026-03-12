import { Excalidraw, restoreElements } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useEffect, useRef } from "react";
import type { ExcalidrawElement } from "../types";

// Non-drawing element types emitted by excalidraw-mcp that should be filtered out
const NON_ELEMENT_TYPES = new Set(["cameraUpdate", "delete"]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RawElement = Record<string, any>;

/**
 * Convert non-standard `label` properties on shapes into separate
 * centered text elements that Excalidraw can render.
 *
 * The MCP cheat sheet instructs the LLM to use `label: { text, fontSize }`
 * on rectangles/ellipses/diamonds. This is a convenience shorthand that
 * the MCP widget handles internally, but the raw Excalidraw component
 * does not understand it. We expand each label into a standalone text
 * element positioned at the center of the parent shape.
 *
 * @param elements - Raw elements from the LLM (may contain `label` props).
 * @returns Expanded elements with labels converted to text elements.
 */
function expandLabels(elements: RawElement[]): RawElement[] {
  const result: RawElement[] = [];

  for (const el of elements) {
    const label = el.label;
    if (label && typeof label === "object" && label.text) {
      // Push the shape without the label property
      const { label: _removed, ...shape } = el;
      result.push(shape);

      // Create a centered text element
      const fontSize = label.fontSize || 20;
      const text = String(label.text);
      // Estimate text width: chars * fontSize * 0.5
      const estimatedWidth = text.length * fontSize * 0.5;
      const estimatedHeight = fontSize * 1.2;
      const cx = (el.x ?? 0) + (el.width ?? 0) / 2;
      const cy = (el.y ?? 0) + (el.height ?? 0) / 2;

      result.push({
        type: "text",
        id: `${el.id}_label`,
        x: cx - estimatedWidth / 2,
        y: cy - estimatedHeight / 2,
        width: estimatedWidth,
        height: estimatedHeight,
        text,
        fontSize,
        fontFamily: 1, // Virgil (hand-drawn)
        textAlign: "center",
        verticalAlign: "middle",
        strokeColor: el.strokeColor || "#1e1e1e",
        backgroundColor: "transparent",
        fillStyle: "solid",
        opacity: 100,
      });
    } else {
      result.push(el);
    }
  }

  return result;
}

interface DrawingPanelProps {
  elements: ExcalidrawElement[];
}

/**
 * Wrapper around the Excalidraw canvas component.
 *
 * Converts skeleton elements from the LLM (which may be missing required
 * Excalidraw properties) into full elements using restoreElements, then
 * renders them via updateScene.
 *
 * Also expands `label` shorthand on shapes into separate text elements,
 * since the raw Excalidraw component does not support labels natively.
 *
 * Note: We intentionally do NOT use Excalidraw's onChange to sync back
 * to React state. The LLM elements (via SSE) are the source of truth.
 */
export default function DrawingPanel({
  elements,
}: DrawingPanelProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const excalidrawRef = useRef<any>(null);

  useEffect(() => {
    if (excalidrawRef.current && elements && elements.length > 0) {
      try {
        // Filter out non-drawing types (e.g. cameraUpdate)
        const drawingElements = elements.filter(
          (el) => !NON_ELEMENT_TYPES.has((el as { type?: string }).type ?? ""),
        );

        if (drawingElements.length === 0) return;

        // Expand label shorthand into separate text elements
        const expanded = expandLabels(drawingElements as RawElement[]);

        // Use restoreElements to fill in missing defaults (seed, version, etc.)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const restored = restoreElements(expanded as any, null);

        excalidrawRef.current.updateScene({ elements: restored });

        // Scroll to content so the user can see the drawing
        setTimeout(() => {
          if (excalidrawRef.current) {
            excalidrawRef.current.scrollToContent(restored, { fitToContent: true });
          }
        }, 100);
      } catch (e) {
        console.warn("Failed to update Excalidraw scene:", e);
      }
    }
  }, [elements]);

  return (
    <div className="excalidraw-wrapper">
      <Excalidraw
        excalidrawAPI={(api: unknown) => {
          excalidrawRef.current = api;
        }}
      />
    </div>
  );
}
