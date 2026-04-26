// name: tiny-logger
// description: A tiny structured logger for cli tools
// author: @small-libs
// url: https://example.com/tiny-logger
export type LogLevel = "debug" | "info" | "warn" | "error";

export type Logger = {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
};

export function createLogger(scope = "app", minLevel: LogLevel = "info"): Logger {
  const levels: LogLevel[] = ["debug", "info", "warn", "error"];
  const minLevelIndex = levels.indexOf(minLevel);

  function log(level: LogLevel, ...args: unknown[]) {
    if (levels.indexOf(level) < minLevelIndex) {
      return;
    }

    const tag = `[${scope}]`;
    console[level](tag, ...args);
  }

  return {
    debug: (...args) => log("debug", ...args),
    info: (...args) => log("info", ...args),
    warn: (...args) => log("warn", ...args),
    error: (...args) => log("error", ...args),
  };
}
