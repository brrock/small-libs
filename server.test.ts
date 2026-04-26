import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "fs";
import path from "path";
import { resolveFile } from "./server";

test("resolves testLibs library files", () => {
  const hmm = resolveFile("/testLibs/hmm.ts");
  const hello = resolveFile("/testLibs/test/hello.ts");

  expect(hmm).toBe(path.join(import.meta.dir, "testLibs/hmm/index.ts"));
  expect(hello).toBe(path.join(import.meta.dir, "testLibs/test/hello.ts"));
});

test("resolves @libs aliases", () => {
  const libPath = path.join(import.meta.dir, "libs/hmm/index.ts");
  mkdirSync(path.dirname(libPath), { recursive: true });
  writeFileSync(libPath, "export const hmm = true;\n");

  try {
    const hmm = resolveFile("/@libs/hmm/");

    expect(hmm).toBe(path.join(import.meta.dir, "libs/hmm/index.ts"));
  } finally {
    rmSync(path.join(import.meta.dir, "libs"), { recursive: true, force: true });
  }
});
