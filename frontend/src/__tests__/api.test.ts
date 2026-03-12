import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SSEEvent, ApiConfig, Message } from "../types";
import { parseSSELine, streamChat } from "../services/api";

describe("SSE stream parser", () => {
  /**
   * Verifies that a well-formed text SSE event is parsed into
   * an SSEEvent with event="text" and the correct content payload.
   */
  it("test_parses_text_events", () => {
    const raw = 'event: text\ndata: {"content":"hello"}\n\n';
    const lines = raw.split("\n");

    let currentEvent = "";
    const events: SSEEvent[] = [];

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ") && currentEvent) {
        const parsed = parseSSELine(currentEvent, line.slice(6));
        if (parsed) events.push(parsed);
        currentEvent = "";
      }
    }

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("text");
    expect(events[0].data).toEqual({ content: "hello" });
  });

  /**
   * Verifies that an elements SSE event carrying a JSON array
   * is parsed correctly with the array in the data payload.
   */
  it("test_parses_elements_events", () => {
    const raw =
      'event: elements\ndata: {"elements":[{"type":"rectangle","x":0,"y":0}]}\n\n';
    const lines = raw.split("\n");

    let currentEvent = "";
    const events: SSEEvent[] = [];

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ") && currentEvent) {
        const parsed = parseSSELine(currentEvent, line.slice(6));
        if (parsed) events.push(parsed);
        currentEvent = "";
      }
    }

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("elements");
    expect(events[0].data).toEqual({
      elements: [{ type: "rectangle", x: 0, y: 0 }],
    });
  });

  /**
   * Verifies that a done event is parsed and recognized.
   */
  it("test_handles_done_event", () => {
    const raw = 'event: done\ndata: {}\n\n';
    const lines = raw.split("\n");

    let currentEvent = "";
    const events: SSEEvent[] = [];

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ") && currentEvent) {
        const parsed = parseSSELine(currentEvent, line.slice(6));
        if (parsed) events.push(parsed);
        currentEvent = "";
      }
    }

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("done");
    expect(events[0].data).toEqual({});
  });

  /**
   * Verifies that streamChat calls the onEvent callback once per
   * parsed SSE event from the stream.
   */
  it("test_calls_callbacks_for_each_event", async () => {
    // Build a fake ReadableStream that emits two SSE events
    const ssePayload =
      'event: text\ndata: {"content":"hi"}\n\nevent: done\ndata: {}\n\n';
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(ssePayload));
        controller.close();
      },
    });

    // Mock global fetch to return a Response with the stream body
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(stream, { status: 200 }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const onEvent = vi.fn();
    const config: ApiConfig = {
      baseUrl: "http://localhost:8000",
      apiKey: "test-key",
      model: "gpt-4o",
    };
    const messages: Message[] = [
      { id: "1", role: "user", content: "hello" },
    ];

    await streamChat(messages, config, onEvent);

    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenCalledWith({
      event: "text",
      data: { content: "hi" },
    });
    expect(onEvent).toHaveBeenCalledWith({
      event: "done",
      data: {},
    });

    vi.unstubAllGlobals();
  });
});
