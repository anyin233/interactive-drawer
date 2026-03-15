/**
 * CLI argument parser for the interactive-drawer server.
 *
 * @module cli
 */

/**
 * Parsed CLI arguments.
 */
export interface CliArgs {
  /** Whether to run in stdio (Studio) mode. */
  stdio: boolean;
  /** HTTP server port (web mode only). */
  port: number;
  /** Public-facing base URL override. */
  baseUrl?: string;
  /** Show help text and exit. */
  help: boolean;
  /** Show version and exit. */
  version: boolean;
}

/**
 * Parse CLI arguments from the given argv array.
 *
 * @param argv - Argument array (typically process.argv.slice(2)).
 * @returns Parsed CLI arguments.
 */
export function parseCliArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    stdio: false,
    port: parseInt(process.env.PORT ?? "3001", 10),
    help: false,
    version: false,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--stdio":
        args.stdio = true;
        break;
      case "--port":
        args.port = parseInt(argv[++i], 10);
        break;
      case "--base-url":
        args.baseUrl = argv[++i]?.replace(/\/+$/, "");
        break;
      case "--help":
        args.help = true;
        break;
      case "--version":
        args.version = true;
        break;
    }
  }

  return args;
}
