import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import logger from "./logger";
function stripComments(jsonString: string): string {
  // tsconfigs use jsonc which fucks with JSON.parse, so we need to strip comments before parsing
  return jsonString
    .replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")
    .replace(/,\s*([}\]])/g, "$1")
    .trim();
}

function unique(values: string[]) {
  return [...new Set(values)];
}

function normalizePaths(paths: Record<string, string[]>) {
  for (const key in paths) {
    paths[key] = unique(paths[key]!);
  }
}

function addPath(paths: Record<string, string[]>, key: string, value: string) {
  const existing = paths[key] ?? [];
  paths[key] = unique(existing);

  if (!paths[key]!.includes(value)) {
    paths[key]!.push(value);
  }

  paths[key] = unique(paths[key]!);
}

function removePath(paths: Record<string, string[]>, key: string) {
  delete paths[key];
}

export default function addTsconfigPath(name: string, storagePath: string) {
  const tsConfigPath = join(process.cwd(), "tsconfig.json");
  logger.debug("addTsconfigPath start", { name, storagePath, tsConfigPath });

  if (!name) {
    logger.warn("addTsconfigPath skipped empty name");
    return;
  }

  if (existsSync(tsConfigPath)) {
    const tsConfig = JSON.parse(stripComments(readFileSync(tsConfigPath, "utf-8")));
    logger.debug("addTsconfigPath loaded", tsConfig.compilerOptions?.paths);

    if (!tsConfig.compilerOptions) {
      tsConfig.compilerOptions = {};
    }
    if (!tsConfig.compilerOptions.paths) {
      tsConfig.compilerOptions.paths = {};
    }
    normalizePaths(tsConfig.compilerOptions.paths);
    if (storagePath.endsWith("/")) {
      storagePath = storagePath.slice(0, -1);
    }
    const pathKey = `@libs/${name}`;
    const pathValue = `./${storagePath}/${name}/index.ts`;
    logger.debug("addTsconfigPath key", { pathKey, pathValue });
    addPath(tsConfig.compilerOptions.paths, pathKey, pathValue);
    removePath(tsConfig.compilerOptions.paths, `@libs/${name}/*`);
    normalizePaths(tsConfig.compilerOptions.paths);
    writeFileSync(tsConfigPath, JSON.stringify(tsConfig, null, 2));
    logger.debug("addTsconfigPath wrote", tsConfigPath);
  } else {
    logger.warn("tsconfig.json not found. Skipping tsconfig path addition.");
  }
}
