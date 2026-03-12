import type { ApiConfig, Message, SSEEvent } from "../types";

/**
 * Parses a single SSE event from its event type and raw data string.
 *
 * @param eventType - The event type string (e.g., "text", "elements", "done").
 * @param rawData - The raw JSON string from the "data:" field.
 * @returns A parsed SSEEvent, or null if the data is malformed JSON.
 */
export function parseSSELine(
  eventType: string,
  rawData: string,
): SSEEvent | null {
  try {
    const data = JSON.parse(rawData);
    return { event: eventType as SSEEvent["event"], data };
  } catch {
    // Skip malformed JSON payloads
    return null;
  }
}

/**
 * Streams a chat request to the backend SSE endpoint and invokes
 * the onEvent callback for each parsed server-sent event.
 *
 * @param messages - The conversation history to send.
 * @param config - API connection configuration (base URL, key, model).
 * @param onEvent - Callback invoked once per parsed SSE event.
 * @param signal - Optional AbortSignal for cancellation.
 * @throws Error if the HTTP response is not OK or has no body.
 */
export async function streamChat(
  messages: Message[],
  config: ApiConfig,
  onEvent: (event: SSEEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      config: {
        base_url: config.baseUrl,
        api_key: config.apiKey,
        model: config.model,
      },
    }),
    signal,
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (!response.body) throw new Error("No response body");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    let currentEvent = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ") && currentEvent) {
        const parsed = parseSSELine(currentEvent, line.slice(6));
        if (parsed) {
          onEvent(parsed);
        }
        currentEvent = "";
      }
    }
  }
}
