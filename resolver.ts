import path from "path";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import logger from "./logger";

const remote = (ref: string) =>
  ref.startsWith("http://") || ref.startsWith("https://") || ref.includes("localhost");
const fileUrl = (ref: string) => ref.startsWith("file://");

function isAbsoluteLocal(ref: string) {
  return ref.startsWith("/");
}

function hasExtension(ref: string) {
  return path.extname(ref) !== "";
}

function cleanRef(ref: string) {
  const [clean] = ref.split("?");
  return clean!.split("#")[0]!;
}

function normalizeLocalRef(ref: string) {
  if (ref.endsWith(".ts")) {
    return ref;
  }

  return `${ref}.ts`;
}

function getRemoteRootPrefix(baseRef: string) {
  const baseUrl = new URL(baseRef);

  if (baseUrl.hostname === "raw.githubusercontent.com") {
    const segments = baseUrl.pathname.split("/").filter(Boolean);

    if (segments.length >= 5 && segments[2] === "refs") {
      return `/${segments.slice(0, 5).join("/")}/`;
    }

    if (segments.length >= 3) {
      return `/${segments.slice(0, 3).join("/")}/`;
    }
  }

  return "/";
}

export function resolveSourceRef(ref: string, baseRef: string) {
  logger.debug("resolveSourceRef", { ref, baseRef });

  if (remote(ref) || fileUrl(ref)) {
    logger.debug("resolveSourceRef remote ref", ref);
    return ref;
  }

  if (remote(baseRef) || fileUrl(baseRef)) {
    const nextRef =
      ref.startsWith("./") || ref.startsWith("../") || isAbsoluteLocal(ref)
        ? normalizeLocalRef(ref)
        : `${ref.replace(/\/+$/, "")}/index.ts`;
    const rootPrefix = getRemoteRootPrefix(baseRef);
    const resolved =
      ref.startsWith("./") || ref.startsWith("../") || isAbsoluteLocal(ref)
        ? new URL(nextRef, baseRef).toString()
        : new URL(`${rootPrefix}${nextRef.replace(/^\/+/, "")}`, baseRef).toString();
    logger.debug("resolveSourceRef remote base", resolved);
    return resolved;
  }

  if (ref.startsWith("./") || ref.startsWith("../")) {
    const baseDir = hasExtension(baseRef) ? path.dirname(baseRef) : baseRef;
    const resolved = path.resolve(baseDir, normalizeLocalRef(ref));
    logger.debug("resolveSourceRef relative", resolved);
    return resolved;
  }

  if (isAbsoluteLocal(ref)) {
    const resolved = hasExtension(ref) ? ref : path.join(ref, "index.ts");
    logger.debug("resolveSourceRef absolute", resolved);
    return resolved;
  }

  const resolved = hasExtension(ref)
    ? path.resolve(process.cwd(), ref)
    : path.resolve(process.cwd(), ref, "index.ts");
  logger.debug("resolveSourceRef project", resolved);
  return resolved;
}

export function loadSource(ref: string) {
  logger.debug("loadSource", ref);

  if (fileUrl(ref)) {
    const localPath = fileURLToPath(ref);

    logger.debug("loadSource file url", localPath);
    return Promise.resolve(readFileSync(localPath, "utf-8"));
  }

  if (remote(ref)) {
    logger.debug("loadSource fetch", ref);
    return fetch(ref).then((res) => res.text());
  }

  if (existsSync(ref) && !ref.endsWith(".ts")) {
    const indexRef = path.join(ref, "index.ts");

    if (existsSync(indexRef)) {
      logger.debug("loadSource folder index", indexRef);
      return Promise.resolve(readFileSync(indexRef, "utf-8"));
    }
  }

  if (existsSync(ref)) {
    logger.debug("loadSource file", ref);
    return Promise.resolve(readFileSync(ref, "utf-8"));
  }

  const indexRef = `${ref}/index.ts`;

  if (existsSync(indexRef)) {
    logger.debug("loadSource fallback index", indexRef);
    return Promise.resolve(readFileSync(indexRef, "utf-8"));
  }

  logger.debug("loadSource final fallback", ref);
  return Promise.resolve(readFileSync(ref, "utf-8"));
}

function getLibName(ref: string) {
  const clean = cleanRef(ref);

  if (clean.endsWith("/index.ts")) {
    return path.basename(path.dirname(clean!));
  }

  return path.basename(clean!).replace(/\.ts$/, "");
}

export function getRefFolderName(ref: string) {
  return getLibName(ref);
}

export function parseDeps(file: string, sourceRef: string) {
  const libDeps: string[] = [];
  const fileDeps: string[] = [];
  const lines = file.split("\n");

  logger.debug("parseDeps start", { sourceRef, lineCount: lines.length });

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;

    if (line.trim().startsWith("//@")) {
      const importLine = lines[index + 1];

      if (importLine && importLine.trim().startsWith("import ")) {
        const libPath = line.replace("//@", "").trim();
        const resolved = resolveSourceRef(libPath, sourceRef);
        logger.debug("parseDeps found", { libPath, resolved, importLine });
        libDeps.push(resolved);
        index++;
      }
    }

    if (line.trim().startsWith("import ")) {
      const match = line.match(/from\s+["']([^"']+)["']/);

      if (match && (match[1]!.startsWith(".") || match[1]!.startsWith("/"))) {
        const resolved = resolveSourceRef(match[1]!, sourceRef);
        logger.debug("parseDeps import", { importPath: match[1], resolved });
        fileDeps.push(resolved);
      }
    }
  }

  logger.debug("parseDeps done", { libDeps, fileDeps });
  return { libDeps, fileDeps };
}

export function rewriteDeps(
  file: string,
  sourceRef: string,
  getFolderName: (ref: string) => string,
) {
  const neededLibs: string[] = [];
  const lines = file.split("\n");
  const resolved: string[] = [];

  logger.debug("rewriteDeps start", { sourceRef, lineCount: lines.length });

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!;

    if (line.trim().startsWith("//@")) {
      const importLine = lines[index + 1];

      if (importLine && importLine.trim().startsWith("import ")) {
        const libPath = line.replace("//@", "").trim();
        const nextRef = resolveSourceRef(libPath, sourceRef);
        neededLibs.push(nextRef);
        const folderName = getFolderName(nextRef);
        const nextImport = importLine.replace(
          /from\s+["'][^"']+["']/,
          `from "../${folderName}/index"`,
        );
        logger.debug("rewriteDeps update", { libPath, nextRef, folderName, nextImport });
        resolved.push(nextImport);
        index++;
        continue;
      }
    }

    resolved.push(line);
  }

  logger.debug("rewriteDeps done", { sourceRef, neededLibs });
  return { neededLibs, file: resolved.join("\n") };
}

export default rewriteDeps;
