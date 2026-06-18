# @adrianhall/circlemud-parser

Parse CircleMUD and TbaMUD data files into JSON for further processing.

## Goal

This project provides both a TypeScript library and a Node.js CLI for reading CircleMUD and
TbaMUD world data files and converting them into structured JSON.

The bundled TbaMUD source tree in `data/tbamud` is the reference implementation. When the
documentation disagrees with the C source, the source code wins; the parser follows
`data/tbamud/src/db.c` and the related loader/editor code.

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

The CLI parses a single data file, an index file, or a whole world directory and writes the
results to JSON (default), YAML, or TOML.

```sh
# Show version and help
circlemud-parser --version
circlemud-parser --help

# Convert a single file (output written alongside the input)
circlemud-parser path/to/30.wld

# Convert an entire world directory to a separate output directory
circlemud-parser -O ./out --overwrite path/to/lib/world

# Choose an output format
circlemud-parser -f yaml path/to/lib/world
```

Common options:

| Option                      | Description                                     |
| --------------------------- | ----------------------------------------------- |
| `-O, --output-directory`    | Write output to this directory                  |
| `-f, --format <fmt>`        | Output format: `json` (default), `yaml`, `toml` |
| `-l, --min-log-level <lvl>` | `debug`, `info`, `warn`, or `error`             |
| `-q, --quiet`               | Suppress all log output                         |
| `--overwrite`               | Overwrite existing output files                 |

Run `circlemud-parser --help` for the full option list.

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

The Husky pre-commit hook at `.husky/pre-commit` runs:

- Prettier and ESLint through `lint-staged`
- Format, lint, and TypeScript checks across the repository (`run-s check-only`)

## Project Layout

```text
src/index.ts       Library entry point
src/cli.ts         CLI entry point
```

## License

The TypeScript parser project is licensed under MIT. The bundled TbaMUD source tree in
`data/tbamud` and the CircleMUD 3.1 distribution in `data/circle-3.1` retain their own licenses and
copyright notices.
