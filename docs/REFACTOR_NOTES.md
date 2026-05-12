# Refactor Notes

Candidates to evaluate after the world parser implementation lands:

- Parser option normalization shared by `src/parsers/zone.ts` and `src/parsers/world.ts`.
- Source-line helpers for non-empty, non-comment line reading and required-line errors.
- Source-span builders for parser records, warnings, and errors.
- Parser warning construction and logger/callback emission.
- Parser failure helpers that attach `recordType`, `vnum`, and `source` context.
- Safe integer token parsing helpers currently scoped per parser.
- Common keyword-list splitting for room/object extra descriptions and aliases.
- Bitvector-set token parsing for four-element flag fields.
