# @adrianhall/circlemud-parser

Parse CircleMUD and TbaMUD data files into JSON for further processing.

## Goal

This project provides both a TypeScript library and a Node.js CLI for reading CircleMUD and
TbaMUD world data files and converting them into structured JSON.

The bundled TbaMUD source tree in `data/tbamud` is the reference implementation. When the
documentation disagrees with the C source, the source code wins. The first parser work should
primarily follow `data/tbamud/src/db.c` and the related loader/editor code.

## Status

The parser implementation is not started yet. This scaffold verifies that the package builds,
type-checks, lints, formats, and tests correctly.

| File type           | Directory                   | Status  |
| ------------------- | --------------------------- | ------- |
| World rooms         | `data/tbamud/lib/world/wld` | Planned |
| Mobile definitions  | `data/tbamud/lib/world/mob` | Planned |
| Object definitions  | `data/tbamud/lib/world/obj` | Planned |
| Zone reset commands | `data/tbamud/lib/world/zon` | Planned |
| Shop definitions    | `data/tbamud/lib/world/shp` | Planned |
| Quest definitions   | `data/tbamud/lib/world/qst` | Planned |
| DG triggers         | `data/tbamud/lib/world/trg` | Planned |

## Install

Install from GitHub:

```sh
pnpm add github:adrianhall/circlemud-parser
```

or:

```sh
npm install github:adrianhall/circlemud-parser
```

## Library Usage

Current smoke-test API:

```ts
import { VERSION, hello } from '@adrianhall/circlemud-parser';

console.log(VERSION);
console.log(hello('builder'));
```

## CLI Usage

Current CLI stub:

```sh
circlemud-parser --version
circlemud-parser --help
```

## Development

Prerequisites:

- Node.js 22 or newer
- pnpm 10 or newer

Install dependencies:

```sh
pnpm install
```

Build the package:

```sh
pnpm build
```

Run the CLI in development mode:

```sh
pnpm dev -- --help
```

Type-check without emitting JavaScript:

```sh
pnpm typecheck
```

Lint:

```sh
pnpm lint
```

Format:

```sh
pnpm format
```

Run tests:

```sh
pnpm test
```

Run tests with V8 coverage:

```sh
pnpm test:coverage
```

## Pre-Commit Checks

The Husky pre-commit hook runs:

- Prettier and ESLint through `lint-staged`
- TypeScript with `tsc --noEmit`

The hook is present in `.husky/pre-commit`. It will become active once this project is in a git
repository and `pnpm install` has run.

## Project Layout

```text
src/index.ts       Library entry point
src/cli.ts         CLI entry point
```

## License

The TypeScript parser project is licensed under MIT. The bundled TbaMUD source tree in
`data/tbamud` retains its own license and copyright notices.
