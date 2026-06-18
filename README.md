# @adrianhall/circlemud-parser

Parse CircleMUD and TbaMUD data files into JSON for further processing.

## Goal

This project provides both a TypeScript library and a Node.js CLI for reading CircleMUD and
TbaMUD world data files and converting them into structured JSON.

The bundled TbaMUD source tree in `data/tbamud` is the reference implementation. When the
documentation disagrees with the C source, the source code wins. The first parser work should
primarily follow `data/tbamud/src/db.c` and the related loader/editor code.

## Status

Both the CLI (which generates JSON files) and the library (which generates typed TypeScript objects)
are fully implemented.

Both CircleMUD 3.1 and tbaMUD world data formats are supported. Format selection is automatic —
parsers detect CircleMUD vs tbaMUD layouts by field count and header structure. The `strict` option
controls validation severity only (not format selection).

To convert a CircleMUD world directory:

```sh
npm run convert:circle
```

To convert a TbaMUD world directory:

```sh
npm run convert:tbamud
```

## Install from GitHub

```sh
npm install github:adrianhall/circlemud-parser
```

## Library Usage

Review the [Library docs](docs/LIBRARY.md) for details on the library usage.

## CLI Usage

Current CLI stub:

```sh
circlemud-parser --version
circlemud-parser --help
```

## Development

Prerequisites:

- Node.js 22 or newer
- npm 10 or newer

Install dependencies:

```sh
npm install
```

Build the package:

```sh
npm run build
```

Run the CLI in development mode:

```sh
npm run dev -- --help
```

Run all checks:

```sh
npm run check
```

## Pre-Commit Checks

The Husky pre-commit hook runs:

- Prettier and ESLint through `lint-staged`
- TypeScript with `tsc --noEmit`

The hook is present in `.husky/pre-commit`. It will become active once this project is in a git
repository and `npm install` has run.

## Project Layout

```text
src/index.ts       Library entry point
src/cli.ts         CLI entry point
```

## License

The TypeScript parser project is licensed under MIT. The bundled TbaMUD source tree in `data/tbamud` retains its own license and copyright notices.
