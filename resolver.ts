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

type ImportMatch = {
  start: number;
  end: number;
  path: string;
  dynamic: boolean;
};

type LibDirective = {
  ref: string;
  end: number;
};

function isIdentifierChar(char: string | undefined) {
  return !!char && /[A-Za-z0-9_$]/.test(char);
}

function skipQuotedString(source: string, start: number, quote: string) {
  let index = start + 1;

  while (index < source.length) {
    const char = source[index]!;

    if (char === "\\") {
      index += 2;
      continue;
    }

    if (quote === "`" && char === "$" && source[index + 1] === "{") {
      index += 2;
      let depth = 1;

      while (index < source.length && depth > 0) {
        const nested = source[index]!;

        if (nested === "\\") {
          index += 2;
          continue;
        }

        if (nested === "'" || nested === '"' || nested === "`") {
          index = skipQuotedString(source, index, nested);
          continue;
        }

        if (nested === "{") {
          depth++;
        } else if (nested === "}") {
          depth--;
        }

        index++;
      }

      continue;
    }

    if (char === quote) {
      return index + 1;
    }

    index++;
  }

  return source.length;
}

function skipWhitespaceAndComments(source: string, start: number) {
  let index = start;

  while (index < source.length) {
    const char = source[index]!;

    if (/\s/.test(char)) {
      index++;
      continue;
    }

    if (char === "/" && source[index + 1] === "/") {
      index += 2;

      while (index < source.length && source[index] !== "\n") {
        index++;
      }

      continue;
    }

    if (char === "/" && source[index + 1] === "*") {
      index += 2;

      while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
        index++;
      }

      index = Math.min(index + 2, source.length);
      continue;
    }

    break;
  }

  return index;
}

function readIdentifier(source: string, start: number) {
  let index = start;

  while (index < source.length && isIdentifierChar(source[index])) {
    index++;
  }

  return {
    value: source.slice(start, index),
    end: index,
  };
}

function readStringLiteral(source: string, start: number) {
  const quote = source[start];

  if (quote !== "'" && quote !== '"') {
    return null;
  }

  let index = start + 1;

  while (index < source.length) {
    const char = source[index]!;

    if (char === "\\") {
      index += 2;
      continue;
    }

    if (char === quote) {
      return {
        value: source.slice(start + 1, index),
        end: index + 1,
      };
    }

    index++;
  }

  return null;
}

function readExpressionBoundary(source: string, start: number) {
  let index = start;
  let depth = 1;

  while (index < source.length && depth > 0) {
    const char = source[index]!;

    if (char === "'" || char === '"' || char === "`") {
      index = skipQuotedString(source, index, char);
      continue;
    }

    if (char === "/" && source[index + 1] === "/") {
      index = skipWhitespaceAndComments(source, index);
      continue;
    }

    if (char === "/" && source[index + 1] === "*") {
      index = skipWhitespaceAndComments(source, index);
      continue;
    }

    if (char === "(") {
      depth++;
    } else if (char === ")") {
      depth--;
    }

    index++;
  }

  return index;
}

function readImportStatementEnd(source: string, start: number) {
  let index = start;

  while (index < source.length) {
    const char = source[index]!;

    if (char === "'" || char === '"' || char === "`") {
      index = skipQuotedString(source, index, char);
      continue;
    }

    if (char === "/" && source[index + 1] === "/") {
      index = skipWhitespaceAndComments(source, index);
      continue;
    }

    if (char === "/" && source[index + 1] === "*") {
      index = skipWhitespaceAndComments(source, index);
      continue;
    }

    if (char === ";") {
      return index + 1;
    }

    if (char === "\n") {
      return index;
    }

    index++;
  }

  return source.length;
}

function collectImportMatches(source: string) {
  const imports: ImportMatch[] = [];
  const directives: LibDirective[] = [];
  let index = 0;

  while (index < source.length) {
    const char = source[index]!;

    if (char === "/" && source[index + 1] === "/") {
      const commentStart = index;
      index += 2;

      if (source[index] === "@") {
        const contentStart = index + 1;

        while (index < source.length && source[index] !== "\n") {
          index++;
        }

        directives.push({
          ref: source.slice(contentStart, index).trim(),
          end: index,
        });
        continue;
      }

      while (index < source.length && source[index] !== "\n") {
        index++;
      }

      if (index === commentStart) {
        index++;
      }

      continue;
    }

    if (char === "/" && source[index + 1] === "*") {
      index = skipWhitespaceAndComments(source, index);
      continue;
    }

    if (char === "'" || char === '"' || char === "`") {
      index = skipQuotedString(source, index, char);
      continue;
    }

    if (!isIdentifierChar(char)) {
      index++;
      continue;
    }

    const ident = readIdentifier(source, index);

    if (
      ident.value !== "import" ||
      isIdentifierChar(source[index - 1]) ||
      source[index - 1] === "." ||
      source[index - 1] === "'" ||
      source[index - 1] === '"' ||
      source[index - 1] === "`"
    ) {
      index = ident.end;
      continue;
    }

    let next = skipWhitespaceAndComments(source, ident.end);

    if (source[next] === ".") {
      index = next + 1;
      continue;
    }

    if (source[next] === "(") {
      const argStart = skipWhitespaceAndComments(source, next + 1);
      const specifier = readStringLiteral(source, argStart);
      const end = readExpressionBoundary(source, next + 1);

      if (specifier) {
        imports.push({
          start: index,
          end,
          path: specifier.value,
          dynamic: true,
        });
      }

      index = end;
      continue;
    }

    const sideEffectImport = readStringLiteral(source, next);

    if (sideEffectImport) {
      imports.push({
        start: index,
        end: readImportStatementEnd(source, sideEffectImport.end),
        path: sideEffectImport.value,
        dynamic: false,
      });
      index = sideEffectImport.end;
      continue;
    }

    while (next < source.length) {
      next = skipWhitespaceAndComments(source, next);

      const current = source[next];

      if (!current) {
        break;
      }

      if (current === "'" || current === '"' || current === "`") {
        next = skipQuotedString(source, next, current);
        continue;
      }

      if (isIdentifierChar(current)) {
        const token = readIdentifier(source, next);

        if (token.value === "from") {
          const specifierStart = skipWhitespaceAndComments(source, token.end);
          const specifier = readStringLiteral(source, specifierStart);

          if (specifier) {
            imports.push({
              start: index,
              end: readImportStatementEnd(source, specifier.end),
              path: specifier.value,
              dynamic: false,
            });
            next = specifier.end;
          }

          break;
        }

        next = token.end;
        continue;
      }

      if (current === ";") {
        next++;
        break;
      }

      next++;
    }

    index = next;
  }

  return { imports, directives };
}

function bindLibDirectives(source: string) {
  const { imports, directives } = collectImportMatches(source);
  const staticImports = imports.filter((entry) => !entry.dynamic);
  const libImports = new Map<number, string>();
  let importIndex = 0;

  for (const directive of directives) {
    while (importIndex < staticImports.length && staticImports[importIndex]!.start < directive.end) {
      importIndex++;
    }

    const nextImport = staticImports[importIndex];

    if (nextImport) {
      libImports.set(nextImport.start, directive.ref);
      importIndex++;
    }
  }

  return { imports, libImports };
}

export function parseDeps(file: string, sourceRef: string) {
  const libDeps: string[] = [];
  const fileDeps: string[] = [];
  const { imports, libImports } = bindLibDirectives(file);

  logger.debug("parseDeps start", { sourceRef, lineCount: file.split("\n").length });

  for (const entry of imports) {
    const libPath = libImports.get(entry.start);

    if (libPath) {
      const resolved = resolveSourceRef(libPath, sourceRef);
      logger.debug("parseDeps found", { libPath, resolved, importPath: entry.path });
      libDeps.push(resolved);
      continue;
    }

    if (entry.path.startsWith(".") || entry.path.startsWith("/")) {
      const resolved = resolveSourceRef(entry.path, sourceRef);
      logger.debug("parseDeps import", { importPath: entry.path, resolved, dynamic: entry.dynamic });
      fileDeps.push(resolved);
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
  const { imports, libImports } = bindLibDirectives(file);
  let cursor = 0;
  let resolved = "";

  logger.debug("rewriteDeps start", { sourceRef, lineCount: file.split("\n").length });

  for (const entry of imports) {
    const libPath = libImports.get(entry.start);

    if (!libPath || entry.dynamic) {
      continue;
    }

    resolved += file.slice(cursor, entry.start);

    const nextRef = resolveSourceRef(libPath, sourceRef);
    neededLibs.push(nextRef);
    const folderName = getFolderName(nextRef);
    const originalImport = file.slice(entry.start, entry.end);
    const nextImport = originalImport.replace(
      /from\s+["'][^"']+["']/s,
      `from "../${folderName}/index"`,
    );

    logger.debug("rewriteDeps update", { libPath, nextRef, folderName, nextImport });
    resolved += nextImport;
    cursor = entry.end;
  }

  resolved += file.slice(cursor);

  logger.debug("rewriteDeps done", { sourceRef, neededLibs });
  return { neededLibs, file: resolved };
}

export default rewriteDeps;
