import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useChat } from "../hooks/useChat";
import type { ApiConfig, ExcalidrawElement } from "../types";

// Mock the streamChat service so tests control SSE events directly
vi.mock("../services/api", () => ({
  streamChat: vi.fn(),
}));

import { streamChat } from "../services/api";

const mockStreamChat = vi.mocked(streamChat);

const testConfig: ApiConfig = {
  baseUrl: "http://localhost:8000",
  apiKey: "sk-test",
  model: "gpt-4o",
};

describe("useChat hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: streamChat resolves immediately (no events)
    mockStreamChat.mockResolvedValue(undefined);
  });

  /**
   * On mount, messages should be empty, isStreaming false, and
   * elements should be an empty array.
   */
  it("test_initial_state", () => {
    const { result } = renderHook(() => useChat());

    expect(result.current.messages).toEqual([]);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.elements).toEqual([]);
  });

  /**
   * Calling sendMessage should append a user message to the messages array,
   * followed by an empty assistant message placeholder.
   */
  it("test_send_message_adds_user_message", async () => {
    const { result } = renderHook(() => useChat());

    await act(async () => {
      await result.current.sendMessage("Hello!", testConfig);
    });

    // After sendMessage completes, we should have at least a user message
    const userMsg = result.current.messages.find((m) => m.role === "user");
    expect(userMsg).toBeDefined();
    expect(userMsg!.content).toBe("Hello!");
  });

  /**
   * While streamChat is running, isStreaming should be true.
   * Once it resolves, isStreaming returns to false.
   */
  it("test_streaming_flag_set_during_fetch", async () => {
    // Make streamChat hang until we resolve it manually
    let resolveStream!: () => void;
    mockStreamChat.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveStream = resolve;
        }),
    );

    const { result } = renderHook(() => useChat());

    // Start sending (don't await yet)
    let sendPromise: Promise<void>;
    act(() => {
      sendPromise = result.current.sendMessage("Hi", testConfig);
    });

    // During the stream, isStreaming should be true
    expect(result.current.isStreaming).toBe(true);

    // Resolve the stream and await completion
    await act(async () => {
      resolveStream();
      await sendPromise!;
    });

    expect(result.current.isStreaming).toBe(false);
  });

  /**
   * The elements state should be updatable via setElements, allowing
   * external Excalidraw changes to be tracked.
   */
  it("test_elements_update", () => {
    const { result } = renderHook(() => useChat());

    const newElements: ExcalidrawElement[] = [
      { type: "rectangle", x: 10, y: 20 },
    ];

    act(() => {
      result.current.setElements(newElements);
    });

    expect(result.current.elements).toEqual(newElements);
  });
});
