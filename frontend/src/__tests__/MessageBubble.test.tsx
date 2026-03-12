import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import MessageBubble from "../components/MessageBubble";
import type { Message } from "../types";

describe("MessageBubble", () => {
  it("test_renders_user_message_content", () => {
    const message: Message = { id: "1", role: "user", content: "Hello world" };
    render(<MessageBubble message={message} />);
    expect(screen.getByText("Hello world")).toBeInTheDocument();
  });

  it("test_renders_assistant_message_content", () => {
    const message: Message = {
      id: "2",
      role: "assistant",
      content: "I can help with that",
    };
    render(<MessageBubble message={message} />);
    expect(screen.getByText("I can help with that")).toBeInTheDocument();
  });

  it("test_user_message_has_user_styling", () => {
    const message: Message = { id: "1", role: "user", content: "User text" };
    const { container } = render(<MessageBubble message={message} />);
    const bubble = container.firstElementChild as HTMLElement;
    // User messages should be right-aligned
    expect(bubble.style.alignSelf).toBe("flex-end");
  });

  it("test_assistant_message_has_assistant_styling", () => {
    const message: Message = {
      id: "2",
      role: "assistant",
      content: "Bot text",
    };
    const { container } = render(<MessageBubble message={message} />);
    const bubble = container.firstElementChild as HTMLElement;
    // Assistant messages should be left-aligned
    expect(bubble.style.alignSelf).toBe("flex-start");
  });
});
