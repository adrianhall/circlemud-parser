# AGENTS.md

Guidance for coding agents working in this repository.

## Project Overview

This project builds a TypeScript library and Node.js CLI for parsing CircleMUD and TbaMUD world data files into structured JSON.

The parser should preserve VNUMs as the primary identity for parsed records, expose JSON-friendly record objects, and keep unresolved references as VNUMs rather than attempting to boot or fully resolve a MUD database.

The bundled TbaMUD source tree in `data/tbamud` is the reference implementation. When docs and source disagree, follow the C source. Start with `data/tbamud/src/db.c`, then check related loader/editor helpers such as `data/tbamud/src/utils.c`, `data/tbamud/src/modify.c`, and `data/tbamud/src/constants.c`.

## Relevant Sources

- `README.md` describes the package goal, CLI/library intent, development commands, and bundled TbaMUD reference source.
- `docs/LIBRARY.md` is the working API design for record shapes, parser behavior, reader helpers, errors, logging, JSON output, and implementation phases. See the **Format auto-detection** section in **Resolved Decisions** for the full comparison of CircleMUD vs tbaMUD file format differences.
- `data/tbamud/src/db.c` contains the main reference loaders and low-level C parser helpers such as `fread_string`, `fread_number`, `fread_letter`, and `asciiflag_conv`.
- `data/tbamud/src/constants.c` contains flag name tables used to resolve public flag arrays and canonical `*Bits` strings.
- `data/tbamud/lib/world` contains tbaMUD fixture-quality world data for parser validation.
- `data/circle-3.1/lib/world` contains CircleMUD 3.1 world data, used as fixtures for CircleMUD format compatibility tests.

## Implementation Direction

The parser has been built in layers:

1. Reader layer: cursor-style `MudReader`, C-equivalent low-level helpers, and flag resolution helpers.
2. Core record infrastructure: shared types, parser errors, record classes, and stable `toJSON()` output.
3. File dispatch: extension inference, `parseFile()`, and type-specific file/content parser entry points.
4. Record parsers implemented: Zone, World, Object, Mobile, Shop, Quest, and Trigger.

Both CircleMUD 3.1 and tbaMUD formats are supported. Format selection is **automatic** — parsers
detect CircleMUD vs tbaMUD layouts by field count and header structure. The `strict` option
controls **validation severity only** (not format selection). Values the C loader silently
normalizes are normalized unconditionally with a warning regardless of `strict` (e.g. out-of-range
espec stats are clamped to their valid range, matching the `RANGE()` macro in `interpret_espec()`).
`strict: false` only downgrades genuinely malformed input the C loader would reject (e.g. an
unrecognized espec keyword) from an error to a warning.

Follow `docs/LIBRARY.md` for public API names and behavior. Keep the high-level API small,
synchronous, and easy to use from the CLI.

## Data Model Rules

- Use `vnum`, not the C field name `number`, for record identity.
- Keep unresolved room, object, zone, shop, quest, and trigger references as VNUMs.
- Use `null` for explicitly absent optional source strings instead of silently coercing to `''`.
- Normalize public text fields to `\n` line endings.
- Resolve public bitvector fields to human-readable flag names plus canonical ASCII `*Bits` strings.
- Preserve unknown set bits with fallback names such as `UNKNOWN_17` so information is not lost.
- Split keyword and alias source strings into arrays after tilde-string decoding and `parseAt` handling.

## Development Commands

Install dependencies:

```sh
npm install
```

Run all checks, including coverage tests:

```sh
npm run check
```

Run automatic formatting and lint fixes:

```sh
npm run fix
```

Run only the pre-commit checks without tests:

```sh
npm run check-only
```

Build the package:

```sh
npm run build
```

Run the CLI in development mode:

```sh
npm run dev -- --help
```

## Pre-Commit Behavior

The Husky pre-commit hook at `.husky/pre-commit` runs:

- `npx lint-staged`
- `npx run-s check-only`

This means the hook formats and lint-fixes staged files through `lint-staged`, then runs format checking, ESLint, and TypeScript checks across the repository. It intentionally does not run tests.

## Testing Expectations

Add focused unit tests for each parser layer as it is introduced. The reader and low-level helper routines should maintain 100% coverage because they are deterministic and small.

For parser work, prefer short inline fixtures first. Add fixture tests against both `data/tbamud/lib/world` and `data/circle-3.1/lib/world` once each type-specific parser exists, so both corpora are exercised. Both corpora parse with default options (`strict: true`); the parser clamps values the C loader would normalize rather than erroring on them.

Before finishing a coding task, run `npm run check`. If formatting or linting fails, run `npm run fix`, then rerun `npm run check`.

## Coding Notes

- This is an ESM TypeScript project using `moduleResolution: "NodeNext"`; local imports should include `.js` extensions.
- Keep public exports centralized through `src/index.ts`.
- Keep low-level reader behavior close to the C helpers, but throw structured parser errors for invalid input instead of silently returning fallback values.
- Do not write directly to `console` from library parser code; future parser logging should flow through `ParseOptions.logger`.
- Avoid stream parsing in the first implementation. `MudReader` should decode string or `Buffer` input once and parse from an in-memory cursor.
