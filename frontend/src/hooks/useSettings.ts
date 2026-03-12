import { useState, useCallback } from "react";
import type { ApiConfig } from "../types";

const STORAGE_KEY = "interactive-drawer-config";

const DEFAULT_CONFIG: ApiConfig = {
  baseUrl: "",
  apiKey: "",
  model: "gpt-4o",
};

/**
 * Hook that manages API configuration backed by localStorage.
 *
 * Reads an initial config from localStorage on mount and provides
 * an updateConfig callback that persists changes. Also exposes a
 * hasConfig boolean indicating whether the user has provided a
 * non-empty baseUrl and apiKey.
 *
 * @returns config - The current ApiConfig state.
 * @returns updateConfig - Callback to update and persist the config.
 * @returns hasConfig - Whether both baseUrl and apiKey are non-empty.
 */
export function useSettings() {
  const [config, setConfig] = useState<ApiConfig>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(stored) };
      } catch {
        return DEFAULT_CONFIG;
      }
    }
    return DEFAULT_CONFIG;
  });

  const updateConfig = useCallback((newConfig: ApiConfig) => {
    setConfig(newConfig);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfig));
  }, []);

  const hasConfig =
    config.baseUrl.trim() !== "" && config.apiKey.trim() !== "";

  return { config, updateConfig, hasConfig };
}
