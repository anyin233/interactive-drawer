import type { Message } from "../types";

/**
 * Props for the MessageBubble component.
 *
 * @property message - The chat message to display.
 */
interface MessageBubbleProps {
  message: Message;
}

/**
 * Renders a single chat message as a styled bubble.
 *
 * User messages are right-aligned with a blue background.
 * Assistant messages are left-aligned with a gray background.
 *
 * @param props - MessageBubble properties.
 * @returns A div element styled as a message bubble.
 */
export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div
      style={{
        alignSelf: isUser ? "flex-end" : "flex-start",
        backgroundColor: isUser ? "#4a90d9" : "#e8e8e8",
        color: isUser ? "#fff" : "#333",
        padding: "8px 14px",
        borderRadius: "12px",
        maxWidth: "80%",
        wordBreak: "break-word",
        whiteSpace: "pre-wrap",
        fontSize: "14px",
        lineHeight: "1.4",
      }}
    >
      {message.content}
    </div>
  );
}
