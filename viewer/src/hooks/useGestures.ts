/**
 * Shared gesture hook for multi-touch support (pinch, drag, double-tap, wheel).
 *
 * Implements a pointer-based state machine: IDLE -> DRAGGING (1 pointer) -> PINCHING (2 pointers) -> IDLE.
 * Uses the latest-ref pattern for callbacks to avoid re-registering DOM listeners.
 *
 * @module useGestures
 */
import { useCallback, useEffect, useRef, type RefObject } from "react";

/** Callbacks invoked by the gesture recognizer. */
export interface GestureCallbacks {
  /** Called when a drag gesture begins. */
  onDragStart?: () => void;
  /** Called during drag with cumulative (dx, dy) from start and incremental deltas. */
  onDrag?: (dx: number, dy: number, incrementalDx: number, incrementalDy: number) => void;
  /** Called when a drag gesture ends. */
  onDragEnd?: () => void;
  /** Called during a two-finger pinch with scale factor, center point, and pan deltas. */
  onPinch?: (scaleFactor: number, centerX: number, centerY: number, dx: number, dy: number) => void;
  /** Called on double-tap (two taps within 300ms, <10px movement). */
  onDoubleTap?: () => void;
  /** Called on wheel events. isZoomGesture is true when Ctrl/Meta is held. */
  onWheel?: (deltaX: number, deltaY: number, isZoomGesture: boolean, clientX: number, clientY: number) => void;
}

interface GestureOptions {
  /** Whether gesture detection is active. Defaults to true. */
  enabled?: boolean;
}

interface PointerInfo {
  id: number;
  x: number;
  y: number;
}

type GestureState = "IDLE" | "DRAGGING" | "PINCHING";

/**
 * Compute the distance between two points.
 *
 * @param a - First point.
 * @param b - Second point.
 * @returns Euclidean distance.
 */
function dist(a: PointerInfo, b: PointerInfo): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Compute the midpoint between two points.
 *
 * @param a - First point.
 * @param b - Second point.
 * @returns Midpoint coordinates.
 */
function midpoint(a: PointerInfo, b: PointerInfo): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/**
 * Hook that attaches multi-touch gesture detection to a container element.
 *
 * @param containerRef - Ref to the DOM element to attach listeners to.
 * @param callbacks - Gesture callbacks.
 * @param options - Optional configuration (enabled flag).
 * @returns Object with isDragging state.
 */
export function useGestures(
  containerRef: RefObject<HTMLElement | null>,
  callbacks: GestureCallbacks,
  options?: GestureOptions,
): { isDragging: boolean } {
  const enabled = options?.enabled ?? true;

  // Latest-ref pattern: store callbacks in a ref so DOM listeners always call the latest version
  // without needing to re-register when callbacks change.
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  // Internal state
  const stateRef = useRef<GestureState>("IDLE");
  const pointersRef = useRef<Map<number, PointerInfo>>(new Map());
  const dragStartRef = useRef({ x: 0, y: 0 });
  const lastDragRef = useRef({ x: 0, y: 0 });
  const pinchDistRef = useRef(0);
  const pinchCenterRef = useRef({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);

  // Double-tap detection
  const lastTapRef = useRef({ time: 0, x: 0, y: 0 });
  const justPinchedRef = useRef(false);

  // Capture element ref for pointer capture release
  const captureElementRef = useRef<HTMLElement | null>(null);
  const capturePointerIdRef = useRef<number | null>(null);

  const handlePointerDown = useCallback((e: PointerEvent) => {
    const pointers = pointersRef.current;
    pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });

    if (pointers.size === 1 && stateRef.current === "IDLE") {
      // Start drag
      stateRef.current = "DRAGGING";
      isDraggingRef.current = true;
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      lastDragRef.current = { x: e.clientX, y: e.clientY };

      // Set pointer capture for single-pointer drag
      const target = e.currentTarget as HTMLElement;
      try {
        target.setPointerCapture(e.pointerId);
        captureElementRef.current = target;
        capturePointerIdRef.current = e.pointerId;
      } catch {
        // Pointer capture may fail in some environments
      }

      callbacksRef.current.onDragStart?.();
    } else if (pointers.size === 2) {
      // Transition to pinch
      if (stateRef.current === "DRAGGING") {
        // Release pointer capture when transitioning from drag to pinch
        if (captureElementRef.current && capturePointerIdRef.current !== null) {
          try {
            captureElementRef.current.releasePointerCapture(capturePointerIdRef.current);
          } catch {
            // May already be released
          }
          captureElementRef.current = null;
          capturePointerIdRef.current = null;
        }
        isDraggingRef.current = false;
        callbacksRef.current.onDragEnd?.();
      }

      stateRef.current = "PINCHING";
      justPinchedRef.current = true;

      const [p1, p2] = [...pointers.values()];
      pinchDistRef.current = dist(p1, p2);
      pinchCenterRef.current = midpoint(p1, p2);
    }
  }, []);

  const handlePointerMove = useCallback((e: PointerEvent) => {
    const pointers = pointersRef.current;
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY });

    if (stateRef.current === "DRAGGING" && pointers.size === 1) {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      const incDx = e.clientX - lastDragRef.current.x;
      const incDy = e.clientY - lastDragRef.current.y;
      lastDragRef.current = { x: e.clientX, y: e.clientY };
      callbacksRef.current.onDrag?.(dx, dy, incDx, incDy);
    } else if (stateRef.current === "PINCHING" && pointers.size === 2) {
      const [p1, p2] = [...pointers.values()];
      const newDist = dist(p1, p2);
      const newCenter = midpoint(p1, p2);

      const scaleFactor = pinchDistRef.current > 0 ? newDist / pinchDistRef.current : 1;
      const dx = newCenter.x - pinchCenterRef.current.x;
      const dy = newCenter.y - pinchCenterRef.current.y;

      callbacksRef.current.onPinch?.(scaleFactor, newCenter.x, newCenter.y, dx, dy);

      pinchDistRef.current = newDist;
      pinchCenterRef.current = newCenter;
    }
  }, []);

  const handlePointerUp = useCallback((e: PointerEvent) => {
    const pointers = pointersRef.current;
    pointers.delete(e.pointerId);

    if (stateRef.current === "DRAGGING") {
      stateRef.current = "IDLE";
      isDraggingRef.current = false;
      captureElementRef.current = null;
      capturePointerIdRef.current = null;
      callbacksRef.current.onDragEnd?.();

      // Double-tap detection: only for quick taps (small movement)
      const dx = Math.abs(e.clientX - dragStartRef.current.x);
      const dy = Math.abs(e.clientY - dragStartRef.current.y);
      if (dx < 10 && dy < 10 && !justPinchedRef.current) {
        const now = Date.now();
        const last = lastTapRef.current;
        if (now - last.time < 300 && Math.abs(e.clientX - last.x) < 10 && Math.abs(e.clientY - last.y) < 10) {
          callbacksRef.current.onDoubleTap?.();
          lastTapRef.current = { time: 0, x: 0, y: 0 };
        } else {
          lastTapRef.current = { time: now, x: e.clientX, y: e.clientY };
        }
      }
    } else if (stateRef.current === "PINCHING") {
      // When one finger lifts during pinch, go straight to IDLE to prevent jump
      if (pointers.size <= 1) {
        stateRef.current = "IDLE";
        isDraggingRef.current = false;
        // Clear remaining pointers to force a fresh start
        pointers.clear();
        // Keep justPinchedRef true briefly to suppress double-tap
        setTimeout(() => { justPinchedRef.current = false; }, 300);
      }
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;

    // Reset state when re-enabling
    stateRef.current = "IDLE";
    isDraggingRef.current = false;
    pointersRef.current.clear();

    const onWheel = (e: WheelEvent) => {
      const isZoomGesture = e.ctrlKey || e.metaKey;
      callbacksRef.current.onWheel?.(e.deltaX, e.deltaY, isZoomGesture, e.clientX, e.clientY);
      // Prevent browser zoom when the callback exists
      if (callbacksRef.current.onWheel) {
        e.preventDefault();
      }
    };

    container.addEventListener("pointerdown", handlePointerDown);
    container.addEventListener("pointermove", handlePointerMove);
    container.addEventListener("pointerup", handlePointerUp);
    container.addEventListener("pointercancel", handlePointerUp);
    container.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      container.removeEventListener("pointerdown", handlePointerDown);
      container.removeEventListener("pointermove", handlePointerMove);
      container.removeEventListener("pointerup", handlePointerUp);
      container.removeEventListener("pointercancel", handlePointerUp);
      container.removeEventListener("wheel", onWheel);
    };
  }, [containerRef, enabled, handlePointerDown, handlePointerMove, handlePointerUp]);

  return { isDragging: isDraggingRef.current };
}
