import type { Message } from "../types";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";

/**
 * Props for the ChatPanel component.
 *
 * @property messages - The list of chat messages to display.
 * @property isStreaming - Whether the assistant is currently streaming a response.
 * @property toolStatus - Description of the active tool, or null if idle.
 * @property onSend - Callback invoked when the user sends a new message.
 * @property onStop - Callback invoked when the user stops streaming.
 * @property onSettingsClick - Callback invoked when the settings button is clicked.
 */
interface ChatPanelProps {
  messages: Message[];
  isStreaming: boolean;
  toolStatus: string | null;
  onSend: (content: string) => void;
  onStop: () => void;
  onSettingsClick: () => void;
}

/**
 * Left-side chat panel containing the message list, tool status indicator,
 * and chat input area.
 *
 * Displays a gear icon button in the top-right corner for accessing settings.
 * Shows an empty state message when no messages are present.
 *
 * @param props - ChatPanel properties.
 * @returns The chat panel element.
 */
export default function ChatPanel({
  messages,
  isStreaming,
  toolStatus,
  onSend,
  onStop,
  onSettingsClick,
}: ChatPanelProps) {
  return (
    <div
      style={{
        width: "400px",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        borderRight: "1px solid #e0e0e0",
        backgroundColor: "#fafafa",
      }}
    >
      {/* Header with settings button */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 16px",
          borderBottom: "1px solid #e0e0e0",
        }}
      >
        <span style={{ fontWeight: 600, fontSize: "16px" }}>Chat</span>
        <button
          onClick={onSettingsClick}
          aria-label="Settings"
          style={{
            background: "none",
            border: "none",
            fontSize: "20px",
            cursor: "pointer",
            padding: "4px",
            lineHeight: 1,
          }}
        >
          {"\u2699"}
        </button>
      </div>

      {/* Messages area */}
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px",
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        {messages.length === 0 ? (
          <div
            style={{
              color: "#999",
              textAlign: "center",
              marginTop: "40px",
              fontSize: "14px",
            }}
          >
            No messages yet. Describe what you want to draw!
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
      </div>

      {/* Tool status indicator */}
      {toolStatus && (
        <div
          style={{
            padding: "8px 16px",
            fontSize: "13px",
            color: "#666",
            backgroundColor: "#f0f0f0",
            borderTop: "1px solid #e0e0e0",
          }}
        >
          {toolStatus}
        </div>
      )}

      {/* Input area */}
      {isStreaming ? (
        <div style={{ padding: "12px", borderTop: "1px solid #e0e0e0" }}>
          <button
            onClick={onStop}
            style={{
              width: "100%",
              padding: "10px",
              borderRadius: "8px",
              border: "1px solid #e74c3c",
              backgroundColor: "#fff",
              color: "#e74c3c",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 500,
            }}
          >
            Stop Generating
          </button>
        </div>
      ) : (
        <ChatInput onSend={onSend} disabled={false} />
      )}
    </div>
  );
}
