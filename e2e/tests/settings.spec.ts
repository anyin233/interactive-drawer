import { test, expect } from "@playwright/test";

test.describe("Settings", () => {
  test("settings modal appears on first visit", async ({ page }) => {
    await page.goto("/");
    // Modal should be visible since no config is stored
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  test("save API config closes modal", async ({ page }) => {
    await page.goto("/");

    // Fill settings form
    const baseUrlInput = page.getByLabel("Base URL");
    const apiKeyInput = page.getByLabel("API Key");
    const modelInput = page.getByLabel("Model");

    await baseUrlInput.fill("http://localhost:8000");
    await apiKeyInput.fill("sk-test-key");
    await modelInput.fill("gpt-4o");

    // Save
    await page.getByRole("button", { name: "Save" }).click();

    // Modal should close
    await expect(
      page.getByRole("heading", { name: "Settings" }),
    ).not.toBeVisible();
  });

  test("settings persist on reload", async ({ page }) => {
    await page.goto("/");

    // Fill and save settings
    await page.getByLabel("Base URL").fill("http://localhost:8000");
    await page.getByLabel("API Key").fill("sk-test-key");
    await page.getByLabel("Model").fill("gpt-4o");
    await page.getByRole("button", { name: "Save" }).click();

    // Reload
    await page.reload();

    // Modal should NOT appear since config is stored
    await expect(
      page.getByRole("heading", { name: "Settings" }),
    ).not.toBeVisible();

    // Open settings to verify values persisted
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByLabel("Base URL")).toHaveValue(
      "http://localhost:8000",
    );
    await expect(page.getByLabel("API Key")).toHaveValue("sk-test-key");
  });
});
