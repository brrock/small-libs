import { expect, test } from "bun:test";
import { parseArgs, runCli } from "./index";

test("prints help output successfully", async () => {
  const messages: string[] = [];
  const originalLog = console.log;

  console.log = (...args: unknown[]) => {
    messages.push(args.join(" "));
  };

  try {
    const exitCode = await runCli(["--help"]);

    expect(exitCode).toBe(0);
    expect(messages.join("\n")).toContain("Usage:");
    expect(messages.join("\n")).toContain("--no-tsconfig-path");
  } finally {
    console.log = originalLog;
  }
});

test("rejects unknown options", () => {
  expect(() => parseArgs(["--wat"])).toThrow(
    'Unknown option "--wat". Use --help to see supported options.',
  );
});
