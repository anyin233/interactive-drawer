/**
 * Represents a single chat message in the conversation.
 *
 * @property id - Unique identifier for the message.
 * @property role - Whether the message is from the user or the assistant.
 * @property content - The text content of the message.
 */
export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

/**
 * Configuration for the LLM API connection.
 *
 * @property baseUrl - The base URL of the API endpoint.
 * @property apiKey - The authentication key for API access.
 * @property model - The model identifier to use (e.g., "gpt-4o").
 */
export interface ApiConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * A server-sent event from the streaming chat endpoint.
 *
 * @property event - The type of SSE event received.
 * @property data - The JSON-parsed payload of the event.
 */
export interface SSEEvent {
  event: "text" | "elements" | "tool_start" | "tool_end" | "error" | "done";
  data: Record<string, unknown>;
}

/**
 * A loosely-typed Excalidraw element, allowing arbitrary properties
 * so we remain compatible with various Excalidraw versions.
 */
export interface ExcalidrawElement {
  [key: string]: unknown;
}
