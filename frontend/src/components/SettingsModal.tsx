import { useState, type FormEvent } from "react";
import type { ApiConfig } from "../types";

/**
 * Props for the SettingsModal component.
 *
 * @property config - The current API configuration to populate form fields.
 * @property onSave - Callback invoked with the updated config when the user saves.
 * @property onClose - Callback invoked when the modal is cancelled or dismissed.
 */
interface SettingsModalProps {
  config: ApiConfig;
  onSave: (config: ApiConfig) => void;
  onClose: () => void;
}

/**
 * Modal overlay containing a form for editing API configuration.
 *
 * Displays fields for Base URL, API Key (masked as password), and Model.
 * Validates that all fields are non-empty before saving.
 *
 * @param props - SettingsModal properties.
 * @returns A modal overlay element with the settings form.
 */
export default function SettingsModal({
  config,
  onSave,
  onClose,
}: SettingsModalProps) {
  const [baseUrl, setBaseUrl] = useState(config.baseUrl);
  const [apiKey, setApiKey] = useState(config.apiKey);
  const [model, setModel] = useState(config.model);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!baseUrl.trim() || !apiKey.trim() || !model.trim()) return;
    onSave({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim(), model: model.trim() });
  };

  const labelStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    gap: "4px",
    fontSize: "14px",
    fontWeight: 500,
  };

  const inputStyle: React.CSSProperties = {
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #ccc",
    fontSize: "14px",
    outline: "none",
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          backgroundColor: "#fff",
          borderRadius: "12px",
          padding: "24px",
          width: "400px",
          maxWidth: "90vw",
          boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
        }}
      >
        <h2 style={{ margin: "0 0 16px", fontSize: "18px" }}>Settings</h2>
        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "12px" }}
        >
          <label style={labelStyle}>
            Base URL
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            API Key
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={labelStyle}>
            Model
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              style={inputStyle}
            />
          </label>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "8px",
              marginTop: "8px",
            }}
          >
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "1px solid #ccc",
                backgroundColor: "#fff",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: "#4a90d9",
                color: "#fff",
                cursor: "pointer",
                fontSize: "14px",
              }}
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
