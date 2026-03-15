import { Routes, Route, Navigate } from "react-router-dom";
import ViewerPage from "./components/ViewerPage";

/**
 * Root application component — viewer-only routing.
 *
 * /view/:sessionKey — Viewer page for remote MCP sessions.
 * All other paths redirect to root.
 *
 * @returns The routed application element.
 */
export default function App() {
  return (
    <Routes>
      <Route path="/view/:sessionKey" element={<ViewerPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
