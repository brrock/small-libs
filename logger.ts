import { error, log, warn } from "console";

function writeWithLabel(writer: (...args: any[]) => void, label: string, args: any[]) {
  const prefix = label ? `[small-libs] ${label}` : "[small-libs]";
  writer(prefix, ...args);
}

const logger = {
  log(...args: any[]) {
    writeWithLabel(log, "", args);
  },
  info(...args: any[]) {
    writeWithLabel(log, "", args);
  },
  success(...args: any[]) {
    writeWithLabel(log, "success", args);
  },
  warn(...args: any[]) {
    writeWithLabel(warn, "warn", args);
  },
  error(...args: any[]) {
    writeWithLabel(error, "error", args);
  },
  debug(...args: any[]) {
    if (process.env.DEBUG) {
      writeWithLabel(log, "debug", args);
    }
  },
};

export default logger;
