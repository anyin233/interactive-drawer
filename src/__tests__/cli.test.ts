import { describe, it, expect } from "vitest";
import { parseCliArgs } from "../cli.js";

describe("parseCliArgs", () => {
  it("defaults to web mode on port 3001", () => {
    const args = parseCliArgs([]);
    expect(args.stdio).toBe(false);
    expect(args.port).toBe(3001);
  });

  it("--stdio enables studio mode", () => {
    const args = parseCliArgs(["--stdio"]);
    expect(args.stdio).toBe(true);
  });

  it("--port sets custom port", () => {
    const args = parseCliArgs(["--port", "8080"]);
    expect(args.port).toBe(8080);
  });

  it("--base-url sets base URL", () => {
    const args = parseCliArgs(["--base-url", "https://draw.example.com"]);
    expect(args.baseUrl).toBe("https://draw.example.com");
  });

  it("strips trailing slashes from --base-url", () => {
    const args = parseCliArgs(["--base-url", "https://draw.example.com///"]);
    expect(args.baseUrl).toBe("https://draw.example.com");
  });

  it("does NOT recognize --static", () => {
    const args = parseCliArgs(["--static", "/some/dir"]);
    expect((args as any).staticDir).toBeUndefined();
  });

  it("--help sets help flag", () => {
    const args = parseCliArgs(["--help"]);
    expect(args.help).toBe(true);
  });

  it("--version sets version flag", () => {
    const args = parseCliArgs(["--version"]);
    expect(args.version).toBe(true);
  });

  it("PORT env var is used as default when no --port", () => {
    const origPort = process.env.PORT;
    process.env.PORT = "9999";
    try {
      const args = parseCliArgs([]);
      expect(args.port).toBe(9999);
    } finally {
      if (origPort === undefined) delete process.env.PORT;
      else process.env.PORT = origPort;
    }
  });

  it("--port overrides PORT env var", () => {
    const origPort = process.env.PORT;
    process.env.PORT = "9999";
    try {
      const args = parseCliArgs(["--port", "4000"]);
      expect(args.port).toBe(4000);
    } finally {
      if (origPort === undefined) delete process.env.PORT;
      else process.env.PORT = origPort;
    }
  });
});
