import { useState, Component, type ReactNode } from "react";
import { useChat } from "./hooks/useChat";
import { useSettings } from "./hooks/useSettings";
import ChatPanel from "./components/ChatPanel";
import DrawingPanel from "./components/DrawingPanel";
import SettingsModal from "./components/SettingsModal";
import "./App.css";

/**
 * Error boundary that catches render errors in the DrawingPanel.
 * Prevents Excalidraw internal errors from crashing the entire app.
 */
class DrawingErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.warn("DrawingPanel error caught:", error.message);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#999",
          }}
        >
          Drawing canvas encountered an error. It will recover on next update.
        </div>
      );
    }
    return this.props.children;
  }
}

/**
 * Root application component with a split-panel layout.
 *
 * Left panel: ChatPanel for conversation with the assistant.
 * Right panel: DrawingPanel wrapping Excalidraw for visual output.
 * Overlay: SettingsModal for API configuration (shown on first visit or on demand).
 *
 * @returns The top-level application element.
 */
export default function App() {
  const { config, updateConfig, hasConfig } = useSettings();
  const {
    messages,
    isStreaming,
    elements,
    toolStatus,
    sendMessage,
    stopStreaming,
  } = useChat();
  const [showSettings, setShowSettings] = useState(!hasConfig);

  const handleSend = (content: string) => {
    if (!hasConfig) {
      setShowSettings(true);
      return;
    }
    sendMessage(content, config);
  };

  return (
    <div className="app">
      <ChatPanel
        messages={messages}
        isStreaming={isStreaming}
        toolStatus={toolStatus}
        onSend={handleSend}
        onStop={stopStreaming}
        onSettingsClick={() => setShowSettings(true)}
      />
      <DrawingErrorBoundary>
        <DrawingPanel elements={elements} />
      </DrawingErrorBoundary>
      {showSettings && (
        <SettingsModal
          config={config}
          onSave={(c) => {
            updateConfig(c);
            setShowSettings(false);
          }}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
