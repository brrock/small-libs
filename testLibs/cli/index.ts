// name: tiny-cli
// description: Example command-style cli composed from tiny libs
// author: @small-libs
// url: https://example.com/tiny-cli
//@testLibs/commander
import { createCommander } from "../commander";
//@testLibs/logger
import { createLogger } from "../logger";
import { helpText } from "./help";

const logger = createLogger("tiny-cli");
const cli = createCommander("tiny-cli");

cli
  .command("hello", "Print a greeting", ([name = "world"]) => {
    logger.info(`Hello, ${name}!`);
  })
  .command("sum", "Sum numbers", (values) => {
    const total = values.map(Number).reduce((acc, value) => acc + value, 0);
    logger.info(`Total: ${total}`);
  })
  .command("help", "Print extra help", () => {
    logger.info(helpText);
  });

if (import.meta.main) {
  await cli.parse(process.argv.slice(2));
}
