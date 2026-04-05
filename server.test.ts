import { expect, test } from "bun:test";
import path from "path";
import { resolveFile } from "./server";

test("resolves testLibs library files", () => {
  const hmm = resolveFile("/testLibs/hmm.ts");
  const hello = resolveFile("/testLibs/test/hello.ts");

  expect(hmm).toBe(path.join(import.meta.dir, "testLibs/hmm/index.ts"));
  expect(hello).toBe(path.join(import.meta.dir, "testLibs/test/hello.ts"));
});

test("resolves @libs aliases", () => {
  const hmm = resolveFile("/@libs/hmm/");

  expect(hmm).toBe(path.join(import.meta.dir, "libs/hmm/index.ts"));
});
