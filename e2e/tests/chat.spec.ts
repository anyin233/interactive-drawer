import { test, expect } from "@playwright/test";
import { mockTextResponse, setApiConfig } from "../fixtures/mock-server";

test.describe("Chat", () => {
  test.beforeEach(async ({ page }) => {
    await setApiConfig(page);
  });

  test("send message shows user bubble", async ({ page }) => {
    await mockTextResponse(page, "I will draw that for you.");
    await page.goto("/");

    // Type and send a message
    const input = page.getByPlaceholder(/describe/i);
    await input.fill("draw a box");
    await page.getByRole("button", { name: /▶/ }).click();

    // User message should appear
    await expect(page.getByText("draw a box")).toBeVisible();
  });

  test("streaming response appears as assistant message", async ({ page }) => {
    await mockTextResponse(page, "Here is your diagram!");
    await page.goto("/");

    // Send a message
    await page.getByPlaceholder(/describe/i).fill("draw something");
    await page.getByRole("button", { name: /▶/ }).click();

    // Wait for assistant response
    await expect(page.getByText("Here is your diagram!")).toBeVisible();
  });

  test("input clears after sending", async ({ page }) => {
    await mockTextResponse(page, "OK");
    await page.goto("/");

    const input = page.getByPlaceholder(/describe/i);
    await input.fill("draw a circle");
    await page.getByRole("button", { name: /▶/ }).click();

    // Input should be cleared
    await expect(input).toHaveValue("");
  });
});
