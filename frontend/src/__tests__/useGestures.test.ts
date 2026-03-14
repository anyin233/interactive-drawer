/**
 * Unit tests for the useGestures hook.
 *
 * Tests the gesture state machine: drag, pinch, double-tap, wheel,
 * transitions, and disabled mode.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useGestures, type GestureCallbacks } from "../hooks/useGestures";

/** Create a mock container element with event listener tracking. */
function createMockContainer() {
  const listeners = new Map<string, EventListener[]>();
  const el = {
    addEventListener: vi.fn((type: string, handler: EventListener, _opts?: unknown) => {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type)!.push(handler);
    }),
    removeEventListener: vi.fn((type: string, handler: EventListener) => {
      const handlers = listeners.get(type);
      if (handlers) {
        const idx = handlers.indexOf(handler);
        if (idx >= 0) handlers.splice(idx, 1);
      }
    }),
    setPointerCapture: vi.fn(),
    releasePointerCapture: vi.fn(),
    getBoundingClientRect: vi.fn(() => ({
      left: 0, top: 0, width: 800, height: 600, right: 800, bottom: 600, x: 0, y: 0, toJSON: () => {},
    })),
    clientWidth: 800,
    clientHeight: 600,
  } as unknown as HTMLElement;

  const dispatch = (type: string, props: Record<string, unknown> = {}) => {
    const event = {
      type,
      pointerId: 1,
      clientX: 0,
      clientY: 0,
      button: 0,
      deltaX: 0,
      deltaY: 0,
      ctrlKey: false,
      metaKey: false,
      preventDefault: vi.fn(),
      currentTarget: el,
      ...props,
    };
    for (const handler of listeners.get(type) ?? []) {
      handler(event as unknown as Event);
    }
    return event;
  };

  return { el, dispatch, listeners };
}

describe("useGestures hook", () => {
  let container: ReturnType<typeof createMockContainer>;
  let containerRef: { current: HTMLElement | null };
  let callbacks: GestureCallbacks;

  beforeEach(() => {
    container = createMockContainer();
    containerRef = { current: container.el };
    callbacks = {
      onDragStart: vi.fn(),
      onDrag: vi.fn(),
      onDragEnd: vi.fn(),
      onPinch: vi.fn(),
      onDoubleTap: vi.fn(),
      onWheel: vi.fn(),
    };
  });

  /**
   * Verify that single-pointer drag fires onDragStart, onDrag, onDragEnd
   * with correct cumulative and incremental deltas.
   */
  it("detects single-pointer drag", () => {
    renderHook(() => useGestures(containerRef as any, callbacks));

    container.dispatch("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);

    container.dispatch("pointermove", { pointerId: 1, clientX: 150, clientY: 120 });
    expect(callbacks.onDrag).toHaveBeenCalledWith(50, 20, 50, 20);

    container.dispatch("pointermove", { pointerId: 1, clientX: 170, clientY: 130 });
    expect(callbacks.onDrag).toHaveBeenCalledWith(70, 30, 20, 10);

    container.dispatch("pointerup", { pointerId: 1, clientX: 170, clientY: 130 });
    expect(callbacks.onDragEnd).toHaveBeenCalledTimes(1);
  });

  /**
   * Verify that two-pointer gestures fire onPinch with scale factor,
   * center coordinates, and pan deltas.
   */
  it("detects two-pointer pinch", () => {
    renderHook(() => useGestures(containerRef as any, callbacks));

    // First finger down — starts drag
    container.dispatch("pointerdown", { pointerId: 1, clientX: 100, clientY: 200 });
    expect(callbacks.onDragStart).toHaveBeenCalledTimes(1);

    // Second finger down — transitions to pinch
    container.dispatch("pointerdown", { pointerId: 2, clientX: 200, clientY: 200 });
    expect(callbacks.onDragEnd).toHaveBeenCalledTimes(1);

    // Move fingers apart (pinch out)
    container.dispatch("pointermove", { pointerId: 1, clientX: 50, clientY: 200 });
    container.dispatch("pointermove", { pointerId: 2, clientX: 250, clientY: 200 });
    expect(callbacks.onPinch).toHaveBeenCalled();

    const calls = (callbacks.onPinch as ReturnType<typeof vi.fn>).mock.calls;
    const lastCall = calls[calls.length - 1]!;
    const scaleFactor = lastCall[0] as number;
    // Fingers moved from 100px apart to 200px apart → scale ~2.0
    expect(scaleFactor).toBeGreaterThan(1);
  });

  /**
   * Verify double-tap detection: two taps within 300ms, <10px movement.
   */
  it("detects double-tap", () => {
    vi.useFakeTimers();
    renderHook(() => useGestures(containerRef as any, callbacks));

    // First tap
    container.dispatch("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    container.dispatch("pointerup", { pointerId: 1, clientX: 100, clientY: 100 });
    expect(callbacks.onDoubleTap).not.toHaveBeenCalled();

    // Second tap within 300ms
    vi.advanceTimersByTime(200);
    container.dispatch("pointerdown", { pointerId: 1, clientX: 102, clientY: 101 });
    container.dispatch("pointerup", { pointerId: 1, clientX: 102, clientY: 101 });
    expect(callbacks.onDoubleTap).toHaveBeenCalledTimes(1);

    vi.useRealTimers();
  });

  /**
   * Verify that transitioning from drag to pinch (adding second finger)
   * correctly fires onDragEnd and then onPinch, not continued onDrag.
   */
  it("transitions from drag to pinch correctly", () => {
    renderHook(() => useGestures(containerRef as any, callbacks));

    // Start drag
    container.dispatch("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    container.dispatch("pointermove", { pointerId: 1, clientX: 120, clientY: 110 });
    expect(callbacks.onDrag).toHaveBeenCalled();

    // Add second finger → should end drag, start pinch
    container.dispatch("pointerdown", { pointerId: 2, clientX: 200, clientY: 200 });
    expect(callbacks.onDragEnd).toHaveBeenCalledTimes(1);

    // Move with two fingers → should fire pinch, not drag
    (callbacks.onDrag as ReturnType<typeof vi.fn>).mockClear();
    container.dispatch("pointermove", { pointerId: 1, clientX: 90, clientY: 90 });
    container.dispatch("pointermove", { pointerId: 2, clientX: 210, clientY: 210 });
    expect(callbacks.onPinch).toHaveBeenCalled();
    expect(callbacks.onDrag).not.toHaveBeenCalled();
  });

  /**
   * When disabled, no gesture events should fire.
   */
  it("does not fire events when disabled", () => {
    renderHook(() => useGestures(containerRef as any, callbacks, { enabled: false }));

    container.dispatch("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    container.dispatch("pointermove", { pointerId: 1, clientX: 150, clientY: 120 });
    container.dispatch("pointerup", { pointerId: 1, clientX: 150, clientY: 120 });

    expect(callbacks.onDragStart).not.toHaveBeenCalled();
    expect(callbacks.onDrag).not.toHaveBeenCalled();
    expect(callbacks.onDragEnd).not.toHaveBeenCalled();
  });

  /**
   * Double-tap should not fire right after a pinch gesture ends.
   */
  it("suppresses double-tap after pinch", () => {
    vi.useFakeTimers();
    renderHook(() => useGestures(containerRef as any, callbacks));

    // Pinch gesture
    container.dispatch("pointerdown", { pointerId: 1, clientX: 100, clientY: 200 });
    container.dispatch("pointerdown", { pointerId: 2, clientX: 200, clientY: 200 });
    container.dispatch("pointerup", { pointerId: 2, clientX: 200, clientY: 200 });
    container.dispatch("pointerup", { pointerId: 1, clientX: 100, clientY: 200 });

    // Quick taps after pinch — should NOT trigger double-tap
    vi.advanceTimersByTime(100);
    container.dispatch("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    container.dispatch("pointerup", { pointerId: 1, clientX: 100, clientY: 100 });
    vi.advanceTimersByTime(100);
    container.dispatch("pointerdown", { pointerId: 1, clientX: 100, clientY: 100 });
    container.dispatch("pointerup", { pointerId: 1, clientX: 100, clientY: 100 });

    expect(callbacks.onDoubleTap).not.toHaveBeenCalled();

    vi.useRealTimers();
  });

  /**
   * Wheel events with ctrlKey should pass isZoomGesture=true.
   */
  it("passes wheel events with ctrlKey as zoom gesture", () => {
    renderHook(() => useGestures(containerRef as any, callbacks));

    const event = container.dispatch("wheel", {
      deltaX: 0,
      deltaY: -100,
      ctrlKey: true,
      clientX: 400,
      clientY: 300,
    });

    expect(callbacks.onWheel).toHaveBeenCalledWith(0, -100, true, 400, 300);
    expect(event.preventDefault).toHaveBeenCalled();
  });

  /**
   * Wheel events without ctrlKey should pass isZoomGesture=false.
   */
  it("passes wheel events without ctrlKey as non-zoom gesture", () => {
    renderHook(() => useGestures(containerRef as any, callbacks));

    container.dispatch("wheel", {
      deltaX: 0,
      deltaY: 50,
      ctrlKey: false,
      metaKey: false,
      clientX: 400,
      clientY: 300,
    });

    expect(callbacks.onWheel).toHaveBeenCalledWith(0, 50, false, 400, 300);
  });

  /**
   * When one finger lifts during pinch, state should go to IDLE (not DRAG)
   * to prevent view jumps.
   */
  it("goes to IDLE when finger lifts during pinch", () => {
    renderHook(() => useGestures(containerRef as any, callbacks));

    // Start pinch
    container.dispatch("pointerdown", { pointerId: 1, clientX: 100, clientY: 200 });
    container.dispatch("pointerdown", { pointerId: 2, clientX: 200, clientY: 200 });

    // Lift one finger — should go to IDLE, not start dragging
    (callbacks.onDragStart as ReturnType<typeof vi.fn>).mockClear();
    container.dispatch("pointerup", { pointerId: 2, clientX: 200, clientY: 200 });

    // Move remaining finger — should NOT fire drag events
    container.dispatch("pointermove", { pointerId: 1, clientX: 150, clientY: 250 });
    expect(callbacks.onDragStart).not.toHaveBeenCalled();
    expect(callbacks.onDrag).not.toHaveBeenCalled();
  });
});
