import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ChatPanel from "../components/ChatPanel";
import type { Message } from "../types";

describe("ChatPanel", () => {
  const defaultProps = {
    messages: [] as Message[],
    isStreaming: false,
    toolStatus: null as string | null,
    onSend: vi.fn(),
    onStop: vi.fn(),
    onSettingsClick: vi.fn(),
  };

  it("test_shows_empty_state_when_no_messages", () => {
    render(<ChatPanel {...defaultProps} />);
    expect(screen.getByText(/no messages/i)).toBeInTheDocument();
  });

  it("test_renders_messages_in_order", () => {
    const messages: Message[] = [
      { id: "1", role: "user", content: "First message" },
      { id: "2", role: "assistant", content: "Second message" },
      { id: "3", role: "user", content: "Third message" },
    ];
    render(<ChatPanel {...defaultProps} messages={messages} />);

    expect(screen.getByText("First message")).toBeInTheDocument();
    expect(screen.getByText("Second message")).toBeInTheDocument();
    expect(screen.getByText("Third message")).toBeInTheDocument();
  });

  it("test_displays_tool_status_when_active", () => {
    render(
      <ChatPanel {...defaultProps} toolStatus="Running: generate_diagram" />,
    );
    expect(screen.getByText(/Running: generate_diagram/)).toBeInTheDocument();
  });

  it("test_has_settings_button", () => {
    render(<ChatPanel {...defaultProps} />);
    // The settings gear button should be present
    expect(screen.getByLabelText(/settings/i)).toBeInTheDocument();
  });
});
