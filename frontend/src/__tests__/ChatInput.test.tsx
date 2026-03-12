import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ChatInput from "../components/ChatInput";

describe("ChatInput", () => {
  it("test_renders_input_and_send_button", () => {
    render(<ChatInput onSend={vi.fn()} disabled={false} />);
    expect(screen.getByPlaceholderText(/describe/i)).toBeInTheDocument();
    expect(screen.getByRole("button")).toBeInTheDocument();
  });

  it("test_calls_onSend_on_submit", async () => {
    const onSend = vi.fn();
    const user = userEvent.setup();
    render(<ChatInput onSend={onSend} disabled={false} />);

    const input = screen.getByPlaceholderText(/describe/i);
    await user.type(input, "draw a box");
    await user.click(screen.getByRole("button"));

    expect(onSend).toHaveBeenCalledWith("draw a box");
  });

  it("test_disables_when_streaming", () => {
    render(<ChatInput onSend={vi.fn()} disabled={true} />);
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("test_clears_input_after_send", async () => {
    const user = userEvent.setup();
    render(<ChatInput onSend={vi.fn()} disabled={false} />);

    const input = screen.getByPlaceholderText(/describe/i) as HTMLTextAreaElement;
    await user.type(input, "draw a box");
    await user.click(screen.getByRole("button"));

    expect(input.value).toBe("");
  });
});
