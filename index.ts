#!/usr/bin/env bun
import { readFileSync } from "fs";
import path from "path";
import { copy } from "./copy";
import { resolveConfig } from "./config";
import { getMetadata } from "./meta";
import logger from "./logger";
import addTsconfigPath from "./tsConfig";
import resolveDeps, { loadSource, parseDeps, resolveSourceRef } from "./resolver";
import getRepoUrl, { getRepoData } from "./github";

const fileUrl = process.argv[2];
const config = resolveConfig();

logger.debug("config", config);

if (!fileUrl) {
  logger.error("Please provide a file URL as an argument.");
  process.exit(1);
}

logger.debug("input", { fileUrl });

let file: string;

if (fileUrl.includes("https://") || fileUrl.includes("http://") || fileUrl.includes("localhost")) {
  logger.debug("fetching", fileUrl);
  file = await fetch(fileUrl).then((res) => res.text());
} else {
  logger.debug("reading", fileUrl);
  file = readFileSync(fileUrl).toString();
}
let repoData
if (fileUrl.startsWith("https://raw.githubusercontent.com/")) {
  const {repo} = getRepoUrl(fileUrl);
  logger.debug("repo", repo);
   repoData = await getRepoData(repo);
}
const sourceRef = resolveSourceRef(fileUrl, process.cwd());
const refToFolder = new Map<string, string>();
const usedFolders = new Set<string>();
const processedLibs = new Set<string>();
const processedFiles = new Set<string>();

logger.debug("sourceRef", sourceRef);

function getNameFallback(ref: string) {
  if (ref.startsWith("http://") || ref.startsWith("https://") || ref.includes("localhost")) {
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
  if (ref.startsWith("http://") || ref.startsWith("https://") || ref.includes("localhost")) {
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

await processLib(sourceRef);

const metadata = getMetadata(file, config.nameStyle, getNameFallback(sourceRef));

logger.debug("final metadata", metadata);

logger.log("Name: ", metadata.name, "by author: ",
  metadata.author,
  `(${metadata.author.startsWith("@") ? "https://github.com/" + metadata.author.slice(1) : metadata.author})`,);
logger.log("Description: ", metadata.description);
logger.log(
  "Author: ",
  metadata.author,
  `(${metadata.author.startsWith("@") ? "https://github.com/" + metadata.author.slice(1) : metadata.author})`,
);
if (repoData) {
  logger.log("GitHub Repo: https://github.com/", repoData.repo);
  logger.log("Why not add to the", repoData.stars, "other stars on GitHub? It's easiest way to give back!");
}