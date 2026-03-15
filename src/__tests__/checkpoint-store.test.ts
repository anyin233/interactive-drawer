import { describe, it, expect } from "vitest";
import { MemoryCheckpointStore, FileCheckpointStore } from "../checkpoint-store.js";

describe("MemoryCheckpointStore", () => {
  it("round-trips save/load", async () => {
    const store = new MemoryCheckpointStore();
    await store.save("test-1", { elements: [{ id: "a" }] });
    const result = await store.load("test-1");
    expect(result).toEqual({ elements: [{ id: "a" }] });
  });

  it("returns null for nonexistent id", async () => {
    const store = new MemoryCheckpointStore();
    expect(await store.load("missing")).toBeNull();
  });

  it("rejects invalid id with path traversal", async () => {
    const store = new MemoryCheckpointStore();
    await expect(store.save("../evil", { elements: [] })).rejects.toThrow("Invalid checkpoint id");
  });

  it("rejects id longer than 64 chars", async () => {
    const store = new MemoryCheckpointStore();
    await expect(store.save("a".repeat(65), { elements: [] })).rejects.toThrow("64 character limit");
  });

  it("rejects data exceeding 5MB", async () => {
    const store = new MemoryCheckpointStore();
    const big = { elements: [{ data: "x".repeat(6 * 1024 * 1024) }] };
    await expect(store.save("big", big)).rejects.toThrow("byte limit");
  });
});

describe("FileCheckpointStore", () => {
  it("round-trips save/load via filesystem", async () => {
    const store = new FileCheckpointStore();
    await store.save("file-test-1", { elements: [{ id: "b" }] });
    const result = await store.load("file-test-1");
    expect(result).toEqual({ elements: [{ id: "b" }] });
  });

  it("returns null for nonexistent id", async () => {
    const store = new FileCheckpointStore();
    expect(await store.load("no-such-file-id")).toBeNull();
  });
});
