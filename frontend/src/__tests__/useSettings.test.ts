import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSettings } from "../hooks/useSettings";

const STORAGE_KEY = "interactive-drawer-config";

describe("useSettings hook", () => {
  beforeEach(() => {
    // jsdom localStorage may not have .clear() in some Node versions
    try {
      localStorage.clear();
    } catch {
      for (const key of Object.keys(localStorage)) {
        localStorage.removeItem(key);
      }
    }
  });

  /**
   * When localStorage has no stored config, the hook should
   * return the default values (empty baseUrl/apiKey, model "gpt-4o").
   */
  it("test_returns_default_config", () => {
    const { result } = renderHook(() => useSettings());

    expect(result.current.config.baseUrl).toBe("");
    expect(result.current.config.apiKey).toBe("");
    expect(result.current.config.model).toBe("gpt-4o");
  });

  /**
   * When localStorage already contains a config JSON string,
   * the hook should initialize from those stored values.
   */
  it("test_reads_from_localstorage", () => {
    const stored = {
      baseUrl: "http://localhost:8000",
      apiKey: "sk-test",
      model: "gpt-3.5-turbo",
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stored));

    const { result } = renderHook(() => useSettings());

    expect(result.current.config.baseUrl).toBe("http://localhost:8000");
    expect(result.current.config.apiKey).toBe("sk-test");
    expect(result.current.config.model).toBe("gpt-3.5-turbo");
  });

  /**
   * Calling updateConfig should persist the new config to localStorage.
   */
  it("test_saves_to_localstorage", () => {
    const { result } = renderHook(() => useSettings());

    const newConfig = {
      baseUrl: "https://api.example.com",
      apiKey: "sk-new",
      model: "gpt-4o",
    };

    act(() => {
      result.current.updateConfig(newConfig);
    });

    expect(result.current.config).toEqual(newConfig);

    const persisted = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    expect(persisted.baseUrl).toBe("https://api.example.com");
    expect(persisted.apiKey).toBe("sk-new");
  });

  /**
   * hasConfig should return false when baseUrl or apiKey is empty,
   * indicating the user has not yet configured the API connection.
   */
  it("test_has_config_returns_false_when_empty", () => {
    const { result } = renderHook(() => useSettings());

    // Default config has empty baseUrl and apiKey
    expect(result.current.hasConfig).toBe(false);

    // Set only baseUrl, apiKey still empty
    act(() => {
      result.current.updateConfig({
        baseUrl: "http://localhost:8000",
        apiKey: "",
        model: "gpt-4o",
      });
    });
    expect(result.current.hasConfig).toBe(false);

    // Set both → hasConfig should be true
    act(() => {
      result.current.updateConfig({
        baseUrl: "http://localhost:8000",
        apiKey: "sk-test",
        model: "gpt-4o",
      });
    });
    expect(result.current.hasConfig).toBe(true);
  });
});
