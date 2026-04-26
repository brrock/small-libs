import { expect, mock, test } from "bun:test";
import getRepoUrl, { getRepoData } from "./github";

test("extracts owner/repo from raw githubusercontent refs url", () => {
  const parsed = getRepoUrl(
    "https://raw.githubusercontent.com/brrock/small-libs/refs/heads/main/testLibs/test/index.ts",
  );

  expect(parsed.repo).toBe("brrock/small-libs");
  expect(parsed.url).toBe("https://github.com/brrock/small-libs");
});

test("throws if repo metadata endpoint responds with non-OK status", async () => {
  const fetchMock = mock(() =>
    Promise.resolve(new Response("forbidden", { status: 403, statusText: "Forbidden" })),
  );
  const originalFetch = globalThis.fetch;

  globalThis.fetch = fetchMock as typeof fetch;

  try {
    await expect(getRepoData("brrock/small-libs")).rejects.toThrow(
      "Unable to load repo metadata for brrock/small-libs: 403 Forbidden",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
