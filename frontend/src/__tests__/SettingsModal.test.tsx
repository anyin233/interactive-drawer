import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SettingsModal from "../components/SettingsModal";
import type { ApiConfig } from "../types";

const defaultConfig: ApiConfig = {
  baseUrl: "https://api.example.com",
  apiKey: "sk-test-key",
  model: "gpt-4o",
};

describe("SettingsModal", () => {
  it("test_renders_form_fields", () => {
    render(
      <SettingsModal config={defaultConfig} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByLabelText(/base url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/api key/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/model/i)).toBeInTheDocument();
  });

  it("test_populates_fields_with_config_values", () => {
    render(
      <SettingsModal config={defaultConfig} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByLabelText(/base url/i)).toHaveValue(
      "https://api.example.com",
    );
    expect(screen.getByLabelText(/api key/i)).toHaveValue("sk-test-key");
    expect(screen.getByLabelText(/model/i)).toHaveValue("gpt-4o");
  });

  it("test_calls_onSave_with_updated_values", async () => {
    const onSave = vi.fn();
    const user = userEvent.setup();
    render(
      <SettingsModal config={defaultConfig} onSave={onSave} onClose={vi.fn()} />,
    );

    const modelInput = screen.getByLabelText(/model/i);
    await user.clear(modelInput);
    await user.type(modelInput, "gpt-3.5-turbo");

    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(onSave).toHaveBeenCalledWith({
      baseUrl: "https://api.example.com",
      apiKey: "sk-test-key",
      model: "gpt-3.5-turbo",
    });
  });

  it("test_calls_onClose_when_cancelled", async () => {
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(
      <SettingsModal config={defaultConfig} onSave={vi.fn()} onClose={onClose} />,
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onClose).toHaveBeenCalled();
  });

  it("test_api_key_field_is_password_type", () => {
    render(
      <SettingsModal config={defaultConfig} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(screen.getByLabelText(/api key/i)).toHaveAttribute(
      "type",
      "password",
    );
  });
});
