import { join } from "path";
import logger from "./logger";
import type { NameStyle } from "./meta";
import { existsSync, readFileSync } from "fs";
const defaultConfig = {
  storagePath: "libs/",
  addTsconfigPath: true,
  nameStyle: "kebab" as NameStyle,
};
export default defaultConfig;
export type Config = typeof defaultConfig;
export function resolveConfig(): Config {
  let config: Config = defaultConfig;
  let configFileName = "smallLibs.config.json";
  if (process.env.CONFIG_PATH) {
    configFileName = process.env.CONFIG_PATH || "smallLibs.config.json";
  }
  if (process.env.DEBUG) {
    if (existsSync("smallLibs.config.test.json")) {
      configFileName = "smallLibs.config.test.json";
    }
    logger.debug("Using config name:", configFileName);
  }
  const configPath = join(process.cwd(), configFileName);
  logger.debug("Looking for config at:", configPath);
  try {
    config = JSON.parse(readFileSync(configPath, "utf-8")) as Config;
  } catch {
    // File not found or invalid JSON, use default config
    config = defaultConfig;
  }

  logger.debug("config", config);
  logger.debug("configFileName", configFileName);
  return config;
}
