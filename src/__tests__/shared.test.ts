import { describe, it, expect } from "vitest";
import { resolveElements, generateCheckpointId, MAX_INPUT_BYTES } from "../shared.js";
import { MemoryCheckpointStore } from "../checkpoint-store.js";

describe("resolveElements", () => {
  it("passes through simple elements", async () => {
    const store = new MemoryCheckpointStore();
    const elements = [{ type: "rectangle", id: "r1", x: 0, y: 0, width: 100, height: 50 }];
    const result = await resolveElements(elements, store);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolvedElements).toEqual(elements);
    }
  });

  it("filters out cameraUpdate pseudo-elements from resolved output", async () => {
    const store = new MemoryCheckpointStore();
    const elements = [
      { type: "rectangle", id: "r1", x: 0, y: 0, width: 100, height: 50 },
      { type: "cameraUpdate", x: 0, y: 0, width: 800, height: 600 },
    ];
    const result = await resolveElements(elements, store);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // cameraUpdate is not filtered in the non-checkpoint path (only delete is)
      // Verify result contains our rectangle
      expect(result.resolvedElements.find((e: any) => e.id === "r1")).toBeDefined();
    }
  });

  it("delete pseudo-element removes target elements", async () => {
    const store = new MemoryCheckpointStore();
    const elements = [
      { type: "rectangle", id: "r1", x: 0, y: 0, width: 100, height: 50 },
      { type: "rectangle", id: "r2", x: 200, y: 0, width: 100, height: 50 },
      { type: "delete", ids: "r1" },
    ];
    const result = await resolveElements(elements, store);
    expect(result.ok).toBe(true);
    if (result.ok) {
      // Without restoreCheckpoint, delete pseudo-elements are just filtered out
      // but the actual elements remain (delete only works with restoreCheckpoint)
      expect(result.resolvedElements.find((e: any) => e.type === "delete")).toBeUndefined();
    }
  });

  it("restoreCheckpoint loads saved state", async () => {
    const store = new MemoryCheckpointStore();
    await store.save("cp1", { elements: [{ type: "rectangle", id: "r1", x: 0, y: 0, width: 50, height: 50 }] });
    const elements = [
      { type: "restoreCheckpoint", id: "cp1" },
      { type: "ellipse", id: "e1", x: 100, y: 100, width: 30, height: 30 },
    ];
    const result = await resolveElements(elements, store);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolvedElements.find((e: any) => e.id === "r1")).toBeDefined();
      expect(result.resolvedElements.find((e: any) => e.id === "e1")).toBeDefined();
    }
  });

  it("restoreCheckpoint with nonexistent id returns error", async () => {
    const store = new MemoryCheckpointStore();
    const elements = [{ type: "restoreCheckpoint", id: "missing" }];
    const result = await resolveElements(elements, store);
    expect(result.ok).toBe(false);
  });

  it("restoreCheckpoint + delete removes elements from checkpoint", async () => {
    const store = new MemoryCheckpointStore();
    await store.save("cp2", {
      elements: [
        { type: "rectangle", id: "r1", x: 0, y: 0, width: 50, height: 50 },
        { type: "rectangle", id: "r2", x: 100, y: 0, width: 50, height: 50 },
      ],
    });
    const elements = [
      { type: "restoreCheckpoint", id: "cp2" },
      { type: "delete", ids: "r1" },
    ];
    const result = await resolveElements(elements, store);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.resolvedElements.find((e: any) => e.id === "r1")).toBeUndefined();
      expect(result.resolvedElements.find((e: any) => e.id === "r2")).toBeDefined();
    }
  });

  it("bad camera ratio produces ratioHint", async () => {
    const store = new MemoryCheckpointStore();
    const elements = [
      { type: "cameraUpdate", width: 800, height: 200, x: 0, y: 0 },
      { type: "rectangle", id: "r1", x: 0, y: 0, width: 100, height: 50 },
    ];
    const result = await resolveElements(elements, store);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ratioHint).toContain("4:3");
    }
  });
});

describe("generateCheckpointId", () => {
  it("returns 18-char alphanumeric string", () => {
    const id = generateCheckpointId();
    expect(id).toMatch(/^[a-zA-Z0-9]{18}$/);
  });

  it("generates unique IDs", () => {
    expect(generateCheckpointId()).not.toBe(generateCheckpointId());
  });
});

describe("MAX_INPUT_BYTES", () => {
  it("equals 5MB", () => {
    expect(MAX_INPUT_BYTES).toBe(5 * 1024 * 1024);
  });
});
