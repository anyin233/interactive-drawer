import { useState, useCallback, useRef } from "react";
import type {
  Message,
  ApiConfig,
  ExcalidrawElement,
  SSEEvent,
} from "../types";
import { streamChat } from "../services/api";

/**
 * Hook that manages the chat conversation state and SSE streaming.
 *
 * Provides message history, streaming status, Excalidraw elements,
 * tool status, screenshot state, and actions to send messages or stop streaming.
 *
 * @returns messages - Array of conversation messages.
 * @returns isStreaming - Whether a streaming request is in progress.
 * @returns elements - The latest Excalidraw elements from the server.
 * @returns setElements - Setter to update elements externally.
 * @returns toolStatus - Description of the currently running tool, or null.
 * @returns lastScreenshot - Base64 PNG of the last rendered diagram, or null.
 * @returns setScreenshot - Setter for the screenshot (called by DrawingPanel).
 * @returns sendMessage - Sends a user message and streams the response.
 * @returns stopStreaming - Aborts the current streaming request.
 */
export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [elements, setElements] = useState<ExcalidrawElement[]>([]);
  const [toolStatus, setToolStatus] = useState<string | null>(null);
  const [lastScreenshot, setScreenshot] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string, config: ApiConfig) => {
      const userMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
      };

      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setIsStreaming(true);
      setToolStatus(null);

      const assistantId = crypto.randomUUID();
      let assistantContent = "";

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        setMessages([
          ...updatedMessages,
          { id: assistantId, role: "assistant", content: "" },
        ]);

        // Capture current screenshot and clear it for next round
        const screenshotToSend = lastScreenshot;
        setScreenshot(null);

        await streamChat(
          updatedMessages,
          config,
          (event: SSEEvent) => {
            switch (event.event) {
              case "text":
                assistantContent += (event.data as { content: string })
                  .content;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: assistantContent }
                      : m,
                  ),
                );
                break;
              case "elements":
                setElements(
                  (event.data as { elements: ExcalidrawElement[] }).elements,
                );
                break;
              case "tool_start":
                setToolStatus(
                  `Running: ${(event.data as { tool: string }).tool}`,
                );
                break;
              case "tool_end":
                setToolStatus(null);
                break;
              case "error":
                assistantContent += `\n\nError: ${(event.data as { message: string }).message}`;
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: assistantContent }
                      : m,
                  ),
                );
                break;
            }
          },
          controller.signal,
          screenshotToSend,
        );
      } catch (err) {
        if (!(err instanceof DOMException && err.name === "AbortError")) {
          assistantContent += `\n\nError: ${err instanceof Error ? err.message : "Unknown error"}`;
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantId
                ? { ...m, content: assistantContent }
                : m,
            ),
          );
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [messages, lastScreenshot],
  );

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  return {
    messages,
    isStreaming,
    elements,
    setElements,
    toolStatus,
    lastScreenshot,
    setScreenshot,
    sendMessage,
    stopStreaming,
  };
}
