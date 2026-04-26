# small-libs

[![Bun](https://img.shields.io/badge/Bun-000000?style=flat&logo=bun)](https://bun.sh)
[![npm version](https://img.shields.io/npm/v/small-libs?style=flat&color=black)](https://www.npmjs.com/package/small-libs)
[![npm downloads](https://img.shields.io/npm/dm/small-libs?style=flat&color=black)](https://www.npmjs.com/package/small-libs)

`small-libs` takes a local or remote TypeScript entry file, follows its local imports, rewrites linked library imports, and copies the result into named folders under `libs/` or your chosen output directory.

It is designed for publishing and reusing tiny source-first libraries without pulling in a full build pipeline or package registry workflow.

## Install

```bash
bun install
```

For local development:

```bash
bun run index.ts --help
```

After building:

```bash
bun run build
./dist/index.js --help
```

If you install it from npm, the binary is:

```bash
npx small-libs --help
```

## Usage

```bash
small-libs [options] <source>
```

```bash
small-libs ./testLibs/test/index.ts
small-libs --out-dir vendor ./src/index.ts
small-libs --config ./smallLibs.config.json https://raw.githubusercontent.com/owner/repo/main/index.ts
```

Supported sources:

- Local filesystem paths
- `file://` URLs
- `http://` and `https://` URLs
- localhost URLs such as `http://localhost:3000/testLibs/test/index.ts`

## CLI options

```text
-c, --config <path>       Use a specific config file
-o, --out-dir <path>      Override the output directory
-n, --name-style <style>  Folder naming style: kebab, camel, pascal
    --no-tsconfig-path    Do not write an @libs/* path to tsconfig.json
    --debug               Enable debug logging
-h, --help                Show help
-v, --version             Show the current version
```

## What it does

- Reads the entry file from disk or over HTTP.
- Follows file-relative imports and copies those files into the same output folder.
- Resolves special library imports marked with `//@path/to/lib` and installs them into sibling folders.
- Rewrites those library imports to point at the generated folders.
- Optionally adds a `compilerOptions.paths` entry to `tsconfig.json`.

## Configuration

Create `smallLibs.config.json` in the project root, or pass a custom path with `--config`.

```json
{
  "storagePath": "libs/",
  "addTsconfigPath": true,
  "nameStyle": "kebab"
}
```

Defaults:

- `storagePath`: `libs/`
- `addTsconfigPath`: `true`
- `nameStyle`: `kebab`

Environment variables:

- `CONFIG_PATH`: use a different config file name
- `DEBUG=1`: enable debug logging and prefer `smallLibs.config.test.json` when present
- `PORT`: port for the local test file server

## Test server

```bash
bun server.ts
```

This serves files from the repo root, `libs/`, and `testLibs/` so you can test remote-style imports locally.

## Example input

```ts
// name: my-lib
// description: A tiny helper library
// author: @you
// url: https://github.com/you/my-lib
//@testLibs/hmm
import { subtract } from "../hmm";
import hello from "./hello";
```

Fixture libraries under `testLibs/`:

- `testLibs/logger` - tiny scoped logger
- `testLibs/commander` - mini command parser inspired by commander
- `testLibs/cli` - command-style CLI app that depends on both via `//@...` markers

## Output

By default the generated entry file is written to `libs/<name>/index.ts`, with any local helper files copied beside it.

For the sample above, you will end up with output like:

```text
libs/
  my-lib/
    hello.ts
    index.ts
  hmm/
    index.ts
```

If `addTsconfigPath` is enabled, `small-libs` also writes an `@libs/<name>` alias into your local `tsconfig.json`.

## Development

```bash
bun test
bun run build
```
