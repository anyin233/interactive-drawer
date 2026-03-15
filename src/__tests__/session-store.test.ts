import { describe, it, expect, vi, afterEach } from "vitest";
import { SessionStore } from "../session-store.js";

describe("SessionStore", () => {
  let store: SessionStore;
  afterEach(() => store.destroy());

  it("createSession returns session with UUID, empty elements, 24h TTL", () => {
    store = new SessionStore();
    const session = store.createSession();
    expect(session.sessionKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(session.elements).toEqual([]);
    expect(session.svgCache).toBeNull();
    const ttl = session.expiresAt.getTime() - session.createdAt.getTime();
    expect(ttl).toBe(24 * 60 * 60 * 1000);
  });

  it("getSession returns session for valid key", () => {
    store = new SessionStore();
    const s = store.createSession();
    expect(store.getSession(s.sessionKey)).toBe(s);
  });

  it("getSession returns null for nonexistent key", () => {
    store = new SessionStore();
    expect(store.getSession("nonexistent")).toBeNull();
  });

  it("getSession returns null for expired session", () => {
    store = new SessionStore();
    const s = store.createSession();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(s.expiresAt.getTime() + 1));
    expect(store.getSession(s.sessionKey)).toBeNull();
    vi.useRealTimers();
  });

  it("evicts oldest session when max 100 reached", () => {
    store = new SessionStore();
    const first = store.createSession();
    for (let i = 1; i < 100; i++) store.createSession();
    expect(store.getSession(first.sessionKey)).not.toBeNull();
    store.createSession(); // 101st
    expect(store.getSession(first.sessionKey)).toBeNull();
  });

  it("updateElements sets elements and invalidates svgCache", () => {
    store = new SessionStore();
    const s = store.createSession();
    store.updateSvgCache(s.sessionKey, "<svg/>");
    store.updateElements(s.sessionKey, [{ id: "1", type: "rectangle" }]);
    const updated = store.getSession(s.sessionKey)!;
    expect(updated.elements).toHaveLength(1);
    expect(updated.svgCache).toBeNull();
  });

  it("updateElements returns false for nonexistent key", () => {
    store = new SessionStore();
    expect(store.updateElements("bad", [])).toBe(false);
  });

  it("updateSvgCache stores SVG string", () => {
    store = new SessionStore();
    const s = store.createSession();
    store.updateSvgCache(s.sessionKey, "<svg>test</svg>");
    expect(store.getSession(s.sessionKey)!.svgCache).toBe("<svg>test</svg>");
  });
});
