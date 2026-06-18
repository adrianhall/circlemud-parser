# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.2] - 2026-06-18

### Fixed

- Zone parser now emits `null` for `builders` on CircleMUD zones instead of the tbaMUD `"None."`
  sentinel. CircleMUD zone files have no builders field, so the value is reported as absent,
  consistent with the `builders: string | null` contract and the `minLevel`/`maxLevel` convention.

## [1.0.1] - 2026-06-18

### Added

- CircleMUD 3.1 world data support across all parsers. Format selection is automatic — parsers
  detect CircleMUD vs tbaMUD layouts by field count and header structure.
- CircleMUD 3.1 reference data under `data/circle-3.1` and fixture tests that parse the bundled
  `wld`/`mob`/`obj`/`zon`/`shp` corpora.
- `convert:circle` npm script for converting a CircleMUD world directory to JSON.

### Changed

- `strict` now controls validation severity only, not format selection. Both CircleMUD and tbaMUD
  layouts parse with no flags.
- Mobile parser accepts the legacy four-field flag line unconditionally.
- Object parser accepts the legacy three/four-field flag line unconditionally.
- Zone parser accepts the headerless (no builders line) CircleMUD header and the three-argument
  `G` command (tbaMUD uses four; the extra argument is unused at reset).
- Out-of-range enhanced mobile stat values are clamped to their valid range with a warning instead
  of erroring, matching the `RANGE()` macro in `interpret_espec()` (`data/tbamud/src/db.c`).
- Door key/target sentinel coercion (`-1`/`65535`/`0` → `null`) and the zone missing-builders
  fallback are logged at debug level instead of warn, matching the silent C loader behavior and
  removing duplicate log output.

## [1.0.0] - 2026-06-18

### Added

- Initial release of the CircleMUD/TbaMUD parser library and CLI.
- Reader layer (`MudReader`), low-level C-equivalent helpers, and flag resolution.
- Record parsers for Zone, World, Object, Mobile, Shop, Quest, and Trigger types.
- `parseFile()` with extension inference plus type-specific file and content parsers.
- CLI with JSON, YAML, and TOML output, directory/index walking, and configurable logging.

[1.0.2]: https://github.com/adrianhall/circlemud-parser/compare/1.0.1...1.0.2
[1.0.1]: https://github.com/adrianhall/circlemud-parser/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/adrianhall/circlemud-parser/releases/tag/1.0.0
