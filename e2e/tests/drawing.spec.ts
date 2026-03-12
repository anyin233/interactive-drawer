import { test, expect } from "@playwright/test";
import {
  mockToolAndElementsResponse,
  setApiConfig,
} from "../fixtures/mock-server";

const SAMPLE_ELEMENTS = [
  {
    id: "rect1",
    type: "rectangle",
    x: 100,
    y: 100,
    width: 200,
    height: 100,
  },
];

test.describe("Drawing", () => {
  test.beforeEach(async ({ page }) => {
    await setApiConfig(page);
  });

  test("excalidraw canvas is present", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".excalidraw")).toBeVisible({ timeout: 10000 });
  });

  test("elements event triggers update and text response appears", async ({
    page,
  }) => {
    await mockToolAndElementsResponse(
      page,
      SAMPLE_ELEMENTS,
      "I drew a rectangle for you.",
    );
    await page.goto("/");

    // Wait for app to load
    await expect(page.getByText("Chat")).toBeVisible();

    // Send a message to trigger element rendering
    await page.getByPlaceholder(/describe/i).fill("draw a rectangle");
    await page.getByRole("button", { name: /▶/ }).click();

    // User message should appear
    await expect(page.getByText("draw a rectangle")).toBeVisible();

    // Assistant text response should appear (confirms full SSE processing including elements event)
    await expect(
      page.getByText("I drew a rectangle for you."),
    ).toBeVisible({ timeout: 10000 });
  });
});
