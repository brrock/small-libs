# small-libs

[![Bun](https://img.shields.io/badge/Bun-000000?style=flat&logo=bun)](https://bun.sh)
[![npm version](https://img.shields.io/npm/v/small-libs?style=flat&color=black)](https://www.xnpmjs.com/package/small-libs)
[![npm downloads](https://img.shields.io/npm/dm/small-libs?style=flat&color=black)](https://www.xnpmjs.com/package/small-libs)

The shadcn for small libs. Zero dep. Lightning fast. Bun powered. 8kb cli.

`small-libs` reads a source file, follows its local imports, rewrites linked library imports, and copies everything into named folders under `libs/` or your desired folder. This is PoC, therefore breaking changes are likely.

## Install project deps

```bash
bun install
```

## Use

```bash
bun index.ts <file-or-url>
```

Examples:
(proper lib examples coming soon)
```bash
bun index.ts ./testLibs/test/index.ts
bun index.ts https://raw.githubusercontent.com/owner/repo/main/index.ts
```

## What it does

- reads local files, `file://` URLs, `http(s)` URLs, or localhost URLs
- resolves file-relative imports and copies those files into the same output folder
- resolves special library imports marked with `//@path/to/lib` and installs them into separate folders
- rewrites imported library paths to point at the copied folders
- optionally adds a `tsconfig` path entry for the generated library folder

## Configuration

Create `smallLibs.config.json` in the project root.

```json
{
  "storagePath": "libs/",
  "addTsconfigPath": true,
  "nameStyle": "kebab"
}
```

Environment variables:

- `CONFIG_PATH` - use a different config file name
- `DEBUG=1` - enable debug logging and prefer `smallLibs.config.test.json` when present
- `PORT` - port for the test file server

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

## Output

The generated folder ends up at `libs/<name>/index.ts` by default, with any local helper files copied beside it.
