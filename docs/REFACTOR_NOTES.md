# Refactor Notes

Status: the internal parser-helper consolidation was completed after the mobile/object/shop/quest/trigger parsers landed.

Completed in the consolidation pass:

- Parser option normalization shared by `src/parsers/zone.ts` and `src/parsers/world.ts`.
- Source-line helpers for non-empty, non-comment line reading and required-line errors.
- Source-span builders for parser records, warnings, and errors.
- Parser warning construction and logger/callback emission.
- Parser failure helpers that attach `recordType`, `vnum`, and `source` context.
- Safe integer token parsing helpers currently scoped per parser.
- Common keyword-list splitting for room/object extra descriptions and aliases.
- Bitvector-set token parsing for four-element flag fields.

Internal helpers now live under `src/parsers/internal/` with focused unit tests under `tests/parsers/internal/`.

Deferred candidates:

- Public API gaps from `docs/LIBRARY.md`: `parseFile()`, `inferRecordType()`, `UnsupportedRecordTypeError`, and the `MudRecordByType` / `MudRecordOf<T>` type mappings.
- CLI completion beyond the current version/help stub.
- README status refresh so it no longer describes parser implementation as unstarted.

File splitting was evaluated as part of this pass but intentionally deferred. Large parser files remain single files by request; shared helper extraction reduced duplicate code without changing parser module layout.
