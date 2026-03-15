import { describe, it, expect, afterEach, beforeAll } from "vitest";
import request from "supertest";
import { createApp } from "../http-app.js";
import { SessionStore } from "../session-store.js";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

// Minimal mock MCP server factory (MCP endpoint not tested here)
const mockServerFn = () => ({ close: async () => {} }) as any;

describe("Session REST API", () => {
  let store: SessionStore;
  afterEach(() => store.destroy());

  it("GET /api/sessions/:key returns 400 for invalid UUID", async () => {
    store = new SessionStore();
    const app = createApp(mockServerFn, store);
    await request(app).get("/api/sessions/not-a-uuid").expect(400);
  });

  it("GET /api/sessions/:key returns 404 for nonexistent UUID", async () => {
    store = new SessionStore();
    const app = createApp(mockServerFn, store);
    await request(app).get("/api/sessions/00000000-0000-0000-0000-000000000000").expect(404);
  });

  it("GET /api/sessions/:key returns session metadata", async () => {
    store = new SessionStore();
    const session = store.createSession();
    const app = createApp(mockServerFn, store);
    const res = await request(app).get(`/api/sessions/${session.sessionKey}`).expect(200);
    expect(res.body.sessionKey).toBe(session.sessionKey);
    expect(res.body.hasElements).toBe(false);
  });

  it("GET /api/sessions/:key/elements returns elements", async () => {
    store = new SessionStore();
    const session = store.createSession();
    store.updateElements(session.sessionKey, [{ id: "1", type: "rect" }]);
    const app = createApp(mockServerFn, store);
    const res = await request(app).get(`/api/sessions/${session.sessionKey}/elements`).expect(200);
    expect(res.body.elements).toHaveLength(1);
  });

  it("PUT /api/sessions/:key/elements updates elements", async () => {
    store = new SessionStore();
    const session = store.createSession();
    const app = createApp(mockServerFn, store);
    await request(app)
      .put(`/api/sessions/${session.sessionKey}/elements`)
      .send({ elements: [{ id: "2", type: "ellipse" }] })
      .expect(200);
    expect(store.getSession(session.sessionKey)!.elements).toHaveLength(1);
  });

  it("PUT /api/sessions/:key/elements returns 400 without elements array", async () => {
    store = new SessionStore();
    const session = store.createSession();
    const app = createApp(mockServerFn, store);
    await request(app)
      .put(`/api/sessions/${session.sessionKey}/elements`)
      .send({ data: "wrong" })
      .expect(400);
  });

  it("GET /api/sessions/:key/svg returns 404 when no elements", async () => {
    store = new SessionStore();
    const session = store.createSession();
    const app = createApp(mockServerFn, store);
    await request(app).get(`/api/sessions/${session.sessionKey}/svg`).expect(404);
  });
});

describe("Landing page", () => {
  let store: SessionStore;
  afterEach(() => store.destroy());

  it("GET / returns landing page even without viewerDir", async () => {
    store = new SessionStore();
    const app = createApp(mockServerFn, store);
    const res = await request(app).get("/").expect(200);
    expect(res.text).toContain("Server running");
  });
});

describe("Static file serving + SPA fallback", () => {
  let store: SessionStore;
  let viewerDir: string;

  beforeAll(() => {
    viewerDir = mkdtempSync(join(tmpdir(), "viewer-test-"));
    writeFileSync(join(viewerDir, "index.html"), "<html>viewer</html>");
    writeFileSync(join(viewerDir, "test.js"), "console.log('test')");
  });
  afterEach(() => store.destroy());

  it("GET / returns landing page HTML (not index.html)", async () => {
    store = new SessionStore();
    const app = createApp(mockServerFn, store, viewerDir);
    const res = await request(app).get("/").expect(200);
    expect(res.text).toContain("Server running");
  });

  it("GET /view/:key returns SPA index.html", async () => {
    store = new SessionStore();
    const app = createApp(mockServerFn, store, viewerDir);
    const res = await request(app).get("/view/some-session-key").expect(200);
    expect(res.text).toContain("viewer");
  });

  it("serves static files from viewerDir", async () => {
    store = new SessionStore();
    const app = createApp(mockServerFn, store, viewerDir);
    const res = await request(app).get("/test.js").expect(200);
    expect(res.text).toContain("console.log");
  });
});
