import { warn, log, error } from "console";

const logger = {
  log(...args: any[]) {
    log(...args);
  },
  warn(...args: any[]) {
    warn(...args);
  },
  error(...args: any[]) {
    error(...args);
  },
  debug(...args: any[]) {
    if (process.env.DEBUG) {
      log("[DEBUG]:", ...args);
    }
  },
};
export default logger;
