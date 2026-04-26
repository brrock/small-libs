// name: mini-commander
// description: A tiny command router inspired by commander
// author: @small-libs
// url: https://example.com/mini-commander
export type CommandHandler = (args: string[]) => Promise<void> | void;

type CommandDefinition = {
  description: string;
  handler: CommandHandler;
};

export type Commander = {
  command: (name: string, description: string, handler: CommandHandler) => Commander;
  parse: (argv: string[]) => Promise<void>;
};

export function createCommander(name = "cli"): Commander {
  const commands = new Map<string, CommandDefinition>();

  function command(commandName: string, description: string, handler: CommandHandler) {
    commands.set(commandName, { description, handler });
    return api;
  }

  async function parse(argv: string[]) {
    const [commandName, ...rest] = argv;

    if (!commandName || commandName === "help" || commandName === "--help") {
      const lines = [`Usage: ${name} <command> [args]`, "", "Commands:"];

      for (const [key, value] of commands) {
        lines.push(`  ${key.padEnd(12)} ${value.description}`);
      }

      console.log(lines.join("\n"));
      return;
    }

    const found = commands.get(commandName);

    if (!found) {
      throw new Error(`Unknown command: ${commandName}`);
    }

    await found.handler(rest);
  }

  const api: Commander = { command, parse };
  return api;
}
