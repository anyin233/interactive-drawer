import { useState, type FormEvent } from "react";

/**
 * Props for the ChatInput component.
 *
 * @property onSend - Callback invoked with the trimmed message text on submit.
 * @property disabled - Whether the input and send button should be disabled (e.g., during streaming).
 */
interface ChatInputProps {
  onSend: (content: string) => void;
  disabled: boolean;
}

/**
 * Chat input area with a textarea and a round send button.
 *
 * On form submission, calls onSend with the current text and clears the textarea.
 * The button displays a right arrow character as its icon.
 *
 * @param props - ChatInput properties.
 * @returns The chat input form element.
 */
export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState("");

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <form
      onSubmit={handleSubmit}
      style={{
        display: "flex",
        gap: "8px",
        padding: "12px",
        borderTop: "1px solid #e0e0e0",
        alignItems: "flex-end",
      }}
    >
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Describe what you want to draw..."
        disabled={disabled}
        rows={2}
        style={{
          flex: 1,
          resize: "none",
          padding: "8px 12px",
          borderRadius: "8px",
          border: "1px solid #ccc",
          fontFamily: "inherit",
          fontSize: "14px",
          outline: "none",
        }}
      />
      <button
        type="submit"
        disabled={disabled}
        style={{
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          border: "none",
          backgroundColor: disabled ? "#ccc" : "#4a90d9",
          color: "#fff",
          fontSize: "16px",
          cursor: disabled ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {"\u25B6"}
      </button>
    </form>
  );
}
