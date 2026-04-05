import { existsSync, statSync } from "fs";
import path from "path";
import logger from "./logger";

const root = import.meta.dir;
const port = Number(process.env.PORT ?? 3000);

export function resolveFile(requestPath: string) {
  const cleanPath = decodeURIComponent(requestPath).replace(/^\/+/, "");
  const aliasPath = cleanPath.startsWith("@libs/")
    ? cleanPath.replace(/^@libs\//, "libs/")
    : cleanPath;
  const roots = [root, path.join(root, "libs"), path.join(root, "testLibs")];
  const candidates = new Set<string>();

  if (cleanPath.startsWith("@libs/")) {
    const rest = cleanPath.slice("@libs/".length).replace(/^\/+/, "");
    const name = rest.split("/")[0]?.split(".")[0];

    if (name) {
      const explicit = path.join(root, "libs", name, "index.ts");

      if (existsSync(explicit) && statSync(explicit).isFile()) {
        logger.debug("server hit explicit alias", explicit);
        return explicit;
      }
    }
  }

  if (cleanPath.startsWith("testLibs/")) {
    const rest = cleanPath.slice("testLibs/".length).replace(/^\/+/, "");
    const name = rest.includes("/") ? null : rest.split(".")[0];

    if (name) {
      const explicit = path.join(root, "testLibs", name, "index.ts");

      if (existsSync(explicit) && statSync(explicit).isFile()) {
        logger.debug("server hit explicit testlib", explicit);
        return explicit;
      }
    }
  }

  for (const baseRoot of roots) {
    const direct = path.join(baseRoot, cleanPath);
    const alias = path.join(baseRoot, aliasPath);
    const directBase = direct.endsWith(".ts") ? direct.slice(0, -3) : direct;
    const aliasBase = alias.endsWith(".ts") ? alias.slice(0, -3) : alias;

    candidates.add(direct);
    candidates.add(`${direct}.ts`);
    candidates.add(path.join(direct, "index.ts"));
    candidates.add(path.join(directBase, "index.ts"));
    candidates.add(alias);
    candidates.add(`${alias}.ts`);
    candidates.add(path.join(alias, "index.ts"));
    candidates.add(path.join(aliasBase, "index.ts"));
  }

  logger.debug("server resolveFile", {
    requestPath,
    cleanPath,
    aliasPath,
    candidates: [...candidates],
  });

  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) {
      logger.debug("server hit", candidate);
      return candidate;
    }
  }

  logger.debug("server miss", requestPath);
  return null;
}

export function startServer() {
  Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      const filePath = resolveFile(url.pathname);

      logger.debug("server request", { method: req.method, pathname: url.pathname, filePath });

      if (!filePath) {
        return new Response("Not found", { status: 404 });
      }

      return new Response(Bun.file(filePath));
    },
  });

  logger.log(`Test server running on http://localhost:${port}`);
}

if (import.meta.main) {
  startServer();
}
