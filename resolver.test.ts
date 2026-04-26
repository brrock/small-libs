import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import { parseDeps, resolveSourceRef, rewriteDeps } from "./resolver";

test("resolves remote lib refs from the server root", () => {
  const resolved = resolveSourceRef("testLibs/hmm", "http://localhost:3000/testLibs/test/index.ts");

  expect(resolved).toBe("http://localhost:3000/testLibs/hmm/index.ts");
});

test("resolves raw githubusercontent refs from the repo root", () => {
  const resolved = resolveSourceRef(
    "testLibs/hmm",
    "https://raw.githubusercontent.com/acme/my-lib/main/testLibs/test/index.ts",
  );

  expect(resolved).toBe("https://raw.githubusercontent.com/acme/my-lib/main/testLibs/hmm/index.ts");
});

test("resolves raw githubusercontent refs/heads paths from the repo root", () => {
  const resolved = resolveSourceRef(
    "testLibs/hmm",
    "https://raw.githubusercontent.com/acme/my-lib/refs/heads/main/testLibs/test/index.ts",
  );

  expect(resolved).toBe(
    "https://raw.githubusercontent.com/acme/my-lib/refs/heads/main/testLibs/hmm/index.ts",
  );
});

test("keeps file urls intact", () => {
  const fileUrl = pathToFileURL(path.join(import.meta.dir, "testLibs/hmm/index.ts")).toString();

  expect(resolveSourceRef(fileUrl, path.join(import.meta.dir, "testLibs/test/index.ts"))).toBe(
    fileUrl,
  );
});

test("resolves relative refs from a local directory base", () => {
  const resolved = resolveSourceRef("./testLibs/hmm/index", import.meta.dir);

  expect(resolved).toBe(path.join(import.meta.dir, "testLibs/hmm/index.ts"));
});

test("parses both lib and file deps", () => {
  const file = readFileSync(path.join(import.meta.dir, "testLibs/test/index.ts"), "utf-8");
  const deps = parseDeps(file, path.join(import.meta.dir, "testLibs/test/index.ts"));

  expect(deps.libDeps).toContain(path.join(import.meta.dir, "testLibs/hmm/index.ts"));
  expect(deps.fileDeps).toContain(path.join(import.meta.dir, "testLibs/test/hello.ts"));
});

test("rewrites lib imports to installed folders", () => {
  const file = readFileSync(path.join(import.meta.dir, "testLibs/test/index.ts"), "utf-8");
  const rewritten = rewriteDeps(file, path.join(import.meta.dir, "testLibs/test/index.ts"), (ref) =>
    path.basename(path.dirname(ref)),
  );

  expect(rewritten.file).toContain('import { subtract } from "../hmm/index";');
  expect(rewritten.file).toContain('import hello from "./hello";');
});
