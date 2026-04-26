#!/usr/bin/env bun
import { readFileSync } from "fs";
import path from "path";
import { copy } from "./copy";
import defaultConfig, { resolveConfig, type Config } from "./config";
import { getMetadata, type NameStyle } from "./meta";
import logger from "./logger";
import addTsconfigPath from "./tsConfig";
import resolveDeps, { loadSource, parseDeps, resolveSourceRef } from "./resolver";
import getRepoUrl, { getRepoData } from "./github";

type CliOptions = {
  source?: string;
  configPath?: string;
  help: boolean;
  version: boolean;
  debug: boolean;
  storagePath?: string;
  addTsconfigPath?: boolean;
  nameStyle?: NameStyle;
};

const packageJson = JSON.parse(
  readFileSync(path.join(import.meta.dir, "package.json"), "utf-8"),
) as { version: string };

const HELP_TEXT = `
small-libs

Bundle a local or remote TypeScript entry file into a reusable library folder.

Usage:
  small-libs [options] <source>

Arguments:
  <source>                  Local path, file URL, http(s) URL, or localhost URL

Options:
  -c, --config <path>       Use a specific config file
  -o, --out-dir <path>      Override the output directory
  -n, --name-style <style>  Folder naming style: kebab, camel, pascal
      --no-tsconfig-path    Do not write an @libs/* path to tsconfig.json
      --debug               Enable debug logging
  -h, --help                Show this help text
  -v, --version             Show the current version

Examples:
  small-libs ./testLibs/test/index.ts
  small-libs --out-dir vendor ./src/lib/index.ts
  small-libs --config ./smallLibs.config.json https://raw.githubusercontent.com/owner/repo/main/index.ts

Config defaults:
  storagePath: ${defaultConfig.storagePath}
  addTsconfigPath: ${String(defaultConfig.addTsconfigPath)}
  nameStyle: ${defaultConfig.nameStyle}
`.trim();

function isRemoteRef(ref: string) {
  return ref.startsWith("https://") || ref.startsWith("http://") || ref.includes("localhost");
}

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function formatAuthor(author: string) {
  if (!author) {
    return "unknown";
  }

  if (author.startsWith("@")) {
    return `${author} (https://github.com/${author.slice(1)})`;
  }

  return author;
}

export function parseArgs(argv: string[]): CliOptions {
  const options: CliOptions = {
    help: false,
    version: false,
    debug: false,
  };

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index]!;

    switch (arg) {
      case "-h":
      case "--help":
        options.help = true;
        continue;
      case "-v":
      case "--version":
        options.version = true;
        continue;
      case "--debug":
        options.debug = true;
        continue;
      case "--no-tsconfig-path":
        options.addTsconfigPath = false;
        continue;
      case "-c":
      case "--config": {
        const value = argv[++index];
        if (!value) {
          throw new Error(`Missing value for ${arg}.`);
        }
        options.configPath = value;
        continue;
      }
      case "-o":
      case "--out-dir": {
        const value = argv[++index];
        if (!value) {
          throw new Error(`Missing value for ${arg}.`);
        }
        options.storagePath = value;
        continue;
      }
      case "-n":
      case "--name-style": {
        const value = argv[++index] as NameStyle | undefined;
        if (!value) {
          throw new Error(`Missing value for ${arg}.`);
        }
        if (!["kebab", "camel", "pascal"].includes(value)) {
          throw new Error(
            `Invalid name style "${value}". Expected one of: kebab, camel, pascal.`,
          );
        }
        options.nameStyle = value;
        continue;
      }
      default:
        if (arg.startsWith("-")) {
          throw new Error(`Unknown option "${arg}". Use --help to see supported options.`);
        }
        if (options.source) {
          throw new Error(`Unexpected extra argument "${arg}". Only one source is supported.`);
        }
        options.source = arg;
    }
  }

  return options;
}

async function readEntrySource(source: string) {
  if (isRemoteRef(source)) {
    logger.debug("fetching", source);
    const response = await fetch(source);

    if (!response.ok) {
      throw new Error(`Request failed for ${source}: ${response.status} ${response.statusText}`);
    }

    return response.text();
  }

  logger.debug("reading", source);

  try {
    return readFileSync(source, "utf-8");
  } catch (error) {
    throw new Error(
      `Unable to read local source ${source}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function resolveRuntimeConfig(options: CliOptions): Config {
  if (options.configPath) {
    process.env.CONFIG_PATH = options.configPath;
  }

  const baseConfig = resolveConfig();

  return {
    ...baseConfig,
    ...(options.storagePath ? { storagePath: options.storagePath } : {}),
    ...(options.nameStyle ? { nameStyle: options.nameStyle } : {}),
    ...(typeof options.addTsconfigPath === "boolean"
      ? { addTsconfigPath: options.addTsconfigPath }
      : {}),
  };
}

export async function runCli(argv = process.argv.slice(2)) {
  let options: CliOptions;

  try {
    options = parseArgs(argv);
  } catch (error) {
    logger.error(formatError(error));
    logger.info('Run "small-libs --help" for usage.');
    return 1;
  }

  if (options.debug) {
    process.env.DEBUG = "1";
  }

  if (options.help) {
    console.log(HELP_TEXT);
    return 0;
  }

  if (options.version) {
    console.log(packageJson.version);
    return 0;
  }

  if (!options.source) {
    logger.error("Missing required <source> argument.");
    logger.info('Run "small-libs --help" for usage.');
    return 1;
  }

  const config = resolveRuntimeConfig(options);
  logger.debug("config", config);

  const fileUrl = options.source;

  logger.debug("input", { fileUrl });

  let file: string;

  try {
    file = await readEntrySource(fileUrl);
  } catch (error) {
    logger.error(formatError(error));
    return 1;
  }

  let repoData:
    | Awaited<ReturnType<typeof getRepoData>>
    | undefined;
  if (fileUrl.startsWith("https://raw.githubusercontent.com/")) {
    const { repo } = getRepoUrl(fileUrl);
    logger.debug("repo", repo);
    try {
      repoData = await getRepoData(repo);
    } catch (error) {
      logger.warn("Unable to fetch GitHub metadata for", repo, formatError(error));
    }
  }
  const sourceRef = resolveSourceRef(fileUrl, process.cwd());
  const refToFolder = new Map<string, string>();
  const usedFolders = new Set<string>();
  const processedLibs = new Set<string>();
  const processedFiles = new Set<string>();

  logger.debug("sourceRef", sourceRef);

  function getNameFallback(ref: string) {
    if (isRemoteRef(ref)) {
      return path.basename(new URL(ref).pathname).replace(/\.ts$/, "") || "index";
    }

    return path.basename(ref).replace(/\.ts$/, "") || "index";
  }

  function getFolderName(ref: string, name: string) {
    const existing = refToFolder.get(ref);

    if (existing) {
      logger.debug("folder cached", { ref, existing });
      return existing;
    }

    let folder = name;
    let index = 2;

    while (usedFolders.has(folder)) {
      folder = `${name}-${index}`;
      index++;
    }

    usedFolders.add(folder);
    refToFolder.set(ref, folder);
    logger.debug("folder assigned", { ref, name, folder });
    return folder;
  }

  function getFileName(ref: string) {
    if (isRemoteRef(ref)) {
      return path.basename(new URL(ref).pathname) || "index.ts";
    }

    return path.basename(ref) || "index.ts";
  }

  async function processLib(ref: string) {
    if (processedLibs.has(ref)) {
      logger.debug("processLib cached", ref);
      return refToFolder.get(ref) ?? getNameFallback(ref);
    }

    processedLibs.add(ref);
    logger.debug("processLib start", ref);

    const source = await loadSource(ref);
    const metadata = getMetadata(source, config.nameStyle, getNameFallback(ref));
    const folderName = getFolderName(ref, metadata.name || getNameFallback(ref));
    const deps = parseDeps(source, ref);

    logger.debug("processLib deps", { ref, folderName, deps });

    for (const dep of deps.libDeps) {
      logger.debug("processLib child lib", { ref, dep });
      await processLib(dep);
    }

    for (const dep of deps.fileDeps) {
      logger.debug("processLib child file", { ref, dep, folderName });
      await processFile(dep, folderName);
    }

    const resolved = resolveDeps(source, ref, (depRef) => {
      const depFolder = refToFolder.get(depRef);

      if (!depFolder) {
        throw new Error(`Missing folder name for ${depRef}`);
      }

      return depFolder;
    });

    if (config.addTsconfigPath) {
      logger.debug("addTsconfigPath", { folderName, storagePath: config.storagePath });
      addTsconfigPath(folderName, config.storagePath);
    }

    copy(resolved.file, folderName, config.storagePath, "index.ts");
    logger.debug("processLib written", { ref, folderName });
    return folderName;
  }

  async function processFile(ref: string, folderName: string) {
    if (processedFiles.has(ref)) {
      logger.debug("processFile cached", { ref, folderName });
      return;
    }

    processedFiles.add(ref);
    logger.debug("processFile start", { ref, folderName });

    const source = await loadSource(ref);
    const deps = parseDeps(source, ref);

    for (const dep of deps.libDeps) {
      logger.debug("processFile child lib", { ref, dep });
      await processLib(dep);
    }

    for (const dep of deps.fileDeps) {
      logger.debug("processFile child file", { ref, dep, folderName });
      await processFile(dep, folderName);
    }

    const resolved = resolveDeps(source, ref, (depRef) => {
      const depFolder = refToFolder.get(depRef);

      if (!depFolder) {
        throw new Error(`Missing folder name for ${depRef}`);
      }

      return depFolder;
    });

    copy(resolved.file, folderName, config.storagePath, getFileName(ref));
    logger.debug("processFile written", { ref, folderName, fileName: getFileName(ref) });
  }

  let installedFolder: string;

  try {
    installedFolder = await processLib(sourceRef);
  } catch (error) {
    logger.error(formatError(error));
    return 1;
  }

  const metadata = getMetadata(file, config.nameStyle, getNameFallback(sourceRef));

  logger.debug("final metadata", metadata);

  const outputRoot = config.storagePath.endsWith("/")
    ? config.storagePath.slice(0, -1)
    : config.storagePath;

  logger.success(`Installed "${metadata.name}" to ${outputRoot}/${installedFolder}/index.ts`);
  if (metadata.description) {
    logger.info(`Description: ${metadata.description}`);
  }
  logger.info(`Author: ${formatAuthor(metadata.author)}`);
  if (metadata.url) {
    logger.info(`Source: ${metadata.url}`);
  }
  if (repoData) {
    logger.info(`GitHub: ${repoData.repo.stars} stars on https://github.com/${repoData.repo.repo}`);
  }

  return 0;
}

if (import.meta.main) {
  process.exit(await runCli());
}
