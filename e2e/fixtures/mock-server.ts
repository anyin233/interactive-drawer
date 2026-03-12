import { type Page } from "@playwright/test";

/**
 * Creates a canned SSE response body for the mock /api/chat endpoint.
 *
 * @param events - Array of SSE events to emit as {event, data} objects.
 * @returns A string in SSE wire format.
 */
function buildSSEBody(events: Array<{ event: string; data: object }>): string {
  return events
    .map((e) => `event: ${e.event}\ndata: ${JSON.stringify(e.data)}\n\n`)
    .join("");
}

/**
 * Mock a simple text response from the LLM.
 * Intercepts POST /api/chat and returns SSE with a text + done event.
 */
export async function mockTextResponse(page: Page, text: string) {
  await page.route("**/api/chat", (route) => {
    const body = buildSSEBody([
      { event: "text", data: { content: text } },
      { event: "done", data: {} },
    ]);
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body,
    });
  });
}

/**
 * Mock a response that includes tool execution and elements.
 * Intercepts POST /api/chat and returns SSE with tool_start, elements, tool_end, text, done.
 */
export async function mockToolAndElementsResponse(
  page: Page,
  elements: object[],
  text: string,
) {
  await page.route("**/api/chat", (route) => {
    const body = buildSSEBody([
      { event: "tool_start", data: { tool: "create_view" } },
      { event: "elements", data: { elements } },
      { event: "tool_end", data: { tool: "create_view", success: true } },
      { event: "text", data: { content: text } },
      { event: "done", data: {} },
    ]);
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body,
    });
  });
}

/**
 * Configure localStorage with API settings so the settings modal doesn't block interaction.
 */
export async function setApiConfig(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem(
      "interactive-drawer-config",
      JSON.stringify({
        baseUrl: "http://localhost:8000",
        apiKey: "sk-test-key",
        model: "gpt-4o",
      }),
    );
  });
}
