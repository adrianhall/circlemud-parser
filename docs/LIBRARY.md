# Library API Design

Status: working draft. This document describes the intended exported TypeScript API for the
CircleMUD/TbaMUD parser library before the parser implementation starts.

## Goals

- Parse CircleMUD and TbaMUD data files into strongly typed record objects.
- Preserve VNUMs as the primary identity for every parsed record.
- Keep the high-level API small enough for CLI usage while exposing lower-level parsers that are
  easy to unit test.
- Follow `data/tbamud/src/db.c` and related loader code where the file format is ambiguous.
- Return JSON-friendly data without requiring consumers to understand the original C structs.

## Non-Goals

- Boot a complete MUD database or resolve all VNUM references to runtime indexes.
- Execute zone reset commands or DG scripts.
- Validate every semantic constraint from the game engine in the first parser pass.
- Provide a streaming parser in the first implementation.

## Record Types

The library should export a string enum for file/record categories:

```ts
export enum RecordType {
  Mobile = 'mobile',
  Object = 'object',
  World = 'world',
  Zone = 'zone',
  Shop = 'shop',
  Quest = 'quest',
  Trigger = 'trigger',
}
```

Extension inference should map the standard world file extensions:

| Extension | RecordType           | Record class    |
| --------- | -------------------- | --------------- |
| `.mob`    | `RecordType.Mobile`  | `MobileRecord`  |
| `.obj`    | `RecordType.Object`  | `ObjectRecord`  |
| `.wld`    | `RecordType.World`   | `WorldRecord`   |
| `.zon`    | `RecordType.Zone`    | `ZoneRecord`    |
| `.shp`    | `RecordType.Shop`    | `ShopRecord`    |
| `.qst`    | `RecordType.Quest`   | `QuestRecord`   |
| `.trg`    | `RecordType.Trigger` | `TriggerRecord` |

`WorldRecord` represents one room record from a `.wld` file. The name follows the file type rather
than the in-game concept.

## Base Record Shape

Every parsed record should subclass `MudRecord`.

```ts
export type Vnum = number;

// Internal parsing types — not exposed on public record fields.
export type BitVector = number;
export type BitVectorSet = readonly [BitVector, BitVector, BitVector, BitVector];

export interface SourceSpan {
  fileName?: string;
  startLine: number;
  endLine?: number;
}

export abstract class MudRecord {
  readonly recordType: RecordType;
  readonly vnum: Vnum;
  readonly source?: SourceSpan;

  protected constructor(recordType: RecordType, vnum: Vnum, source?: SourceSpan);

  toJSON(): Record<string, unknown>;
}
```

Notes:

- Use `vnum` consistently instead of the C field name `number`.
- Keep unresolved references as VNUMs, such as room exits, object keys, zone command targets, and
  trigger references.
- Prefer `null` for fields that are explicitly absent in the source data. Do not silently coerce
  absent optional strings to `''`.
- `toJSON()` should return plain data with `recordType`, `vnum`, and record-specific fields so the
  CLI can use `JSON.stringify(records)` directly.
- Bitvector fields are resolved to human-readable flag names on public records. See the
  [Flag Resolution](#flag-resolution) section for the full convention.

## Record Classes

The first implementation should define the major record classes with stable top-level field names.
Bitvector flag tables (room flags, action flags, etc.) are required from the start because the
public API exposes resolved flag names. Ordinal value tables from `constants.c`, such as item types
and apply types, should also be exposed as resolved names alongside the numeric source values as
record parsers are implemented.

```ts
export class WorldRecord extends MudRecord {
  readonly name: string;
  readonly description: string | null;
  readonly roomFlags: readonly string[];
  readonly roomFlagsBits: string;
  readonly sectorType: number;
  readonly directions: readonly RoomDirection[];
  readonly extraDescriptions: readonly ExtraDescription[];
  readonly triggerVnums: readonly Vnum[];
}

export interface RoomDirection {
  direction: number;
  description: string | null;
  keywords: readonly string[];
  exitFlags: readonly string[];
  exitFlagsBits: string;
  keyVnum: Vnum | null;
  toRoomVnum: Vnum | null;
}
```

```ts
export class MobileRecord extends MudRecord {
  readonly aliases: readonly string[];
  readonly shortDescription: string | null;
  readonly longDescription: string | null;
  readonly description: string | null;
  readonly actionFlags: readonly string[];
  readonly actionFlagsBits: string;
  readonly affectFlags: readonly string[];
  readonly affectFlagsBits: string;
  readonly alignment: number;
  readonly kind: 'simple' | 'enhanced';
  readonly stats: MobileStats;
  readonly enhanced?: MobileEnhancedData;
  readonly triggerVnums: readonly Vnum[];
}
```

```ts
export class ObjectRecord extends MudRecord {
  readonly aliases: readonly string[];
  readonly shortDescription: string | null;
  readonly description: string | null;
  readonly actionDescription: string | null;
  readonly objectType: number;
  readonly objectTypeName: string;
  readonly extraFlags: readonly string[];
  readonly extraFlagsBits: string;
  readonly wearFlags: readonly string[];
  readonly wearFlagsBits: string;
  readonly affectFlags: readonly string[];
  readonly affectFlagsBits: string;
  readonly values: readonly [number, number, number, number];
  readonly weight: number;
  readonly cost: number;
  readonly rent: number;
  readonly level: number;
  readonly timer: number;
  readonly extraDescriptions: readonly ExtraDescription[];
  readonly affects: readonly ObjectAffect[];
  readonly triggerVnums: readonly Vnum[];
}
```

```ts
export class ZoneRecord extends MudRecord {
  readonly builders: string | null;
  readonly name: string;
  readonly bottom: Vnum;
  readonly top: Vnum;
  readonly lifespan: number;
  readonly resetMode: number;
  readonly zoneFlags: readonly string[];
  readonly zoneFlagsBits: string;
  readonly minLevel: number | null;
  readonly maxLevel: number | null;
  readonly commands: readonly ZoneCommand[];
}
```

`ShopRecord`, `QuestRecord`, and `TriggerRecord` should follow the same pattern: a concrete class
that exposes parsed primitive fields and keeps references as VNUMs.

Shared supporting interfaces should include:

```ts
export interface ExtraDescription {
  keywords: readonly string[];
  description: string | null;
}

export interface DiceRoll {
  count: number;
  sides: number;
  bonus: number;
}

export interface MobileStats {
  level: number;
  hitroll: number;
  armorClass: number;
  hitDice: DiceRoll;
  damageDice: DiceRoll;
  gold: number;
  experience: number;
  position: number;
  defaultPosition: number;
  sex: number;
}

export interface MobileEnhancedData {
  bareHandAttack?: number;
  str?: number;
  strAdd?: number;
  int?: number;
  wis?: number;
  dex?: number;
  con?: number;
  cha?: number;
  savingPara?: number;
  savingRod?: number;
  savingPetri?: number;
  savingBreath?: number;
  savingSpell?: number;
}

export interface ObjectAffect {
  location: number;
  locationName: string;
  modifier: number;
}

export interface ZoneCommand {
  command: string;
  ifFlag: number;
  args: readonly number[];
  stringArgs: readonly string[];
  comment?: string;
  source?: SourceSpan;
}
```

## Flag Resolution

Source data files store bitvector flags as either numeric values (e.g., `156`) or ASCII flag strings
(e.g., `"cdeh"`). Internally the parser uses `BitVector` and `BitVectorSet` to hold these during
parsing, but public record fields expose **resolved flag names** and a **canonical ASCII bits
string** instead of raw numbers.

Every bitvector field `fooFlags` produces two public fields:

| Field          | Type                | Content                                    |
| -------------- | ------------------- | ------------------------------------------ |
| `fooFlags`     | `readonly string[]` | Human-readable flag names from constants.c |
| `fooFlagsBits` | `string`            | Canonical ASCII flag representation        |

The `*Bits` field always uses the ASCII letter encoding (`a`–`z` for bits 0–25, `A`–`Z` for bits
26–51), even when the source data used a numeric value. A zero bitvector is encoded as `"0"`. For
four-element `BitVectorSet` fields the four ASCII strings are space-separated, e.g., `"cdeh 0 0 0"`.
For single-element bitvector fields the value is a single ASCII string, e.g., `"ab"`.

Affect flags use the shifted base from `asciiflag_conv_aff` where `'a'` maps to bit 1 instead of
bit 0. The `affectFlagsBits` field reflects this shifted encoding.

### Flag Table Mapping

Each bitvector field maps to a specific flag name table from `data/tbamud/src/constants.c`:

| Record field               | C flag table      | Example flags                           |
| -------------------------- | ----------------- | --------------------------------------- |
| `WorldRecord.roomFlags`    | `room_bits[]`     | DARK, DEATH, NO_MOB, INDOORS, PEACEFUL  |
| `RoomDirection.exitFlags`  | `exit_bits[]`     | DOOR, CLOSED, LOCKED, PICKPROOF         |
| `MobileRecord.actionFlags` | `action_bits[]`   | SPEC, SENTINEL, SCAVENGER, ISNPC, AGGR  |
| `MobileRecord.affectFlags` | `affected_bits[]` | BLIND, INVIS, DET-ALIGN, SANCT, CURSE   |
| `ObjectRecord.extraFlags`  | `extra_bits[]`    | GLOW, HUM, NO_RENT, INVISIBLE, MAGIC    |
| `ObjectRecord.wearFlags`   | `wear_bits[]`     | TAKE, FINGER, NECK, BODY, HEAD, WIELD   |
| `ObjectRecord.affectFlags` | `affected_bits[]` | BLIND, INVIS, DET-ALIGN, SANCT, CURSE   |
| `ZoneRecord.zoneFlags`     | `zone_bits[]`     | CLOSED, NO_IMMORT, QUEST, GRID, NOBUILD |

The parser should embed these tables as TypeScript string arrays derived from constants.c. Unknown
bit positions (set bits with no corresponding name in the table) should produce a fallback string
such as `"UNKNOWN_17"` so no information is silently lost.

`ShopRecord`, `QuestRecord`, and `TriggerRecord` should follow the same convention for any
bitvector fields they expose.

## Ordinal Resolution

Source data also stores several ordinal fields as numbers, such as object item types and object
affect apply locations. Public records preserve the numeric source value and expose a companion
resolved-name field:

| Numeric field             | Name field                    | C table         |
| ------------------------- | ----------------------------- | --------------- |
| `ObjectRecord.objectType` | `ObjectRecord.objectTypeName` | `item_types[]`  |
| `ObjectAffect.location`   | `ObjectAffect.locationName`   | `apply_types[]` |

Future parsers should follow the same pattern for ordinal fields: keep the numeric source field and
add a `<field>Name` companion when there is a stable table in `constants.c`. Unknown ordinals should
resolve to `UNKNOWN_<value>` so information is not silently lost.

## Keyword Lists And Aliases

Several source fields are tilde-terminated strings that contain whitespace-separated keyword lists.
The public API should expose these as arrays, not as one raw string and not as duplicated records.

For example, this world extra description:

```text
E
credits info~
   Guilds: 20-23
~
```

should produce one `ExtraDescription`:

```ts
{
  keywords: ['credits', 'info'],
  description: '   Guilds: 20-23\n'
}
```

It should not produce two `ExtraDescription` entries. The grouping is meaningful because the same
description belongs to the whole alias list.

Fields that should use this convention:

| Source concept                 | Public field                              |
| ------------------------------ | ----------------------------------------- |
| Mobile name/alias string       | `MobileRecord.aliases`                    |
| Object name/alias string       | `ObjectRecord.aliases`                    |
| Room extra description keyword | `ExtraDescription.keywords`               |
| Object extra description key   | `ExtraDescription.keywords`               |
| Direction/door keyword string  | `RoomDirection.keywords`                  |
| Shop produced item list        | `ShopRecord.products` or equivalent VNUMs |

Keyword arrays should be split on ASCII whitespace after normal tilde-string decoding and `parseAt`
handling. Empty or absent keyword strings should become `[]`.

## High-Level Parsing API

`parseFile()` is the main public entry point.

```ts
export interface Logger {
  debug(message?: unknown, ...optionalParams: unknown[]): void;
  info(message?: unknown, ...optionalParams: unknown[]): void;
  warn(message?: unknown, ...optionalParams: unknown[]): void;
  error(message?: unknown, ...optionalParams: unknown[]): void;
}

export interface ParseOptions {
  encoding?: BufferEncoding;
  strict?: boolean;
  sourceName?: string;
  logger?: Logger;
  onWarning?: (warning: ParseWarning) => void;
}

export type MudRecordByType = {
  [RecordType.Mobile]: MobileRecord;
  [RecordType.Object]: ObjectRecord;
  [RecordType.World]: WorldRecord;
  [RecordType.Zone]: ZoneRecord;
  [RecordType.Shop]: ShopRecord;
  [RecordType.Quest]: QuestRecord;
  [RecordType.Trigger]: TriggerRecord;
};

export type MudRecordOf<T extends RecordType> = MudRecordByType[T];

export function parseFile(fileName: string): MudRecord[];
export function parseFile(fileName: string, options: ParseOptions): MudRecord[];
export function parseFile<T extends RecordType>(
  fileName: string,
  fileType: T,
  options?: ParseOptions,
): MudRecordOf<T>[];
```

Behavior:

- `parseFile(fileName)` infers the record type from the file extension and returns `MudRecord[]`.
- `parseFile(fileName, RecordType.World)` returns `WorldRecord[]`.
- If the file type cannot be inferred, `parseFile()` throws `UnsupportedRecordTypeError`.
- If an explicit `fileType` conflicts with the file extension, the explicit `fileType` wins.
- If `logger` is not set, parsing uses a silent logger and produces no log output.
- The first implementation should be synchronous, using `fs.readFileSync()` internally. Add async
  wrappers later only if there is a real need.

The extension helper should also be exported:

```ts
export function inferRecordType(fileName: string): RecordType | undefined;
```

## Type-Specific File Parsers

Type-specific file parsers are public and testable. They should read from disk and return the exact
record class for that file type.

```ts
export function parseWorldFile(fileName: string, options?: ParseOptions): WorldRecord[];
export function parseMobileFile(fileName: string, options?: ParseOptions): MobileRecord[];
export function parseObjectFile(fileName: string, options?: ParseOptions): ObjectRecord[];
export function parseZoneFile(fileName: string, options?: ParseOptions): ZoneRecord[];
export function parseShopFile(fileName: string, options?: ParseOptions): ShopRecord[];
export function parseQuestFile(fileName: string, options?: ParseOptions): QuestRecord[];
export function parseTriggerFile(fileName: string, options?: ParseOptions): TriggerRecord[];
```

Equivalent content parsers should also be exported for unit tests and non-file consumers:

```ts
export type MudInput = string | Buffer;

export function parseWorld(input: MudInput, options?: ParseOptions): WorldRecord[];
export function parseMobile(input: MudInput, options?: ParseOptions): MobileRecord[];
export function parseObject(input: MudInput, options?: ParseOptions): ObjectRecord[];
export function parseZone(input: MudInput, options?: ParseOptions): ZoneRecord[];
export function parseShop(input: MudInput, options?: ParseOptions): ShopRecord[];
export function parseQuest(input: MudInput, options?: ParseOptions): QuestRecord[];
export function parseTrigger(input: MudInput, options?: ParseOptions): TriggerRecord[];
```

The content parsers require an explicit function because a raw string or `Buffer` has no reliable
extension to infer from.

## Reader Layer

The lower-level parser should be built on a small cursor-style reader, not on an array of lines. The
reader can track line numbers, support one-character lookahead, and implement the C loader helpers
directly.

```ts
export interface ReaderOptions {
  encoding?: BufferEncoding;
  sourceName?: string;
}

export class MudReader {
  constructor(input: MudInput, options?: ReaderOptions);

  readonly sourceName?: string;
  readonly line: number;
  readonly column: number;

  get eof(): boolean;

  readLine(): string | null;
  requireLine(context?: string): string;
  readLetter(): string;
  unreadChar(char: string): void;
  readTildeString(context?: string): string | null;
}
```

Low-level helper functions should be exported in camelCase while documenting their C equivalents:

```ts
export function parseAsciiFlag(value: string): BitVector;
export function parseAsciiAffectFlag(value: string): BitVector;
export function parseAt(value: string): string;
export function readMudString(reader: MudReader, context?: string): string | null;
export function readMudNumber(reader: MudReader, context?: string): number;
export function skipMudSpaces(value: string): string;
```

C reference names:

| TypeScript helper       | C reference          | Purpose                                          |
| ----------------------- | -------------------- | ------------------------------------------------ |
| `parseAsciiFlag`        | `asciiflag_conv`     | Convert ASCII or numeric bitvector text.         |
| `parseAsciiAffectFlag`  | `asciiflag_conv_aff` | Convert affect flags using the shifted base.     |
| `parseAt`               | `parse_at`           | Convert single `@` characters to tabs.           |
| `readMudString`         | `fread_string`       | Read a tilde-terminated string.                  |
| `readMudNumber`         | `fread_number`       | Read an integer, including pipe-separated terms. |
| `MudReader.readLetter`  | `fread_letter`       | Read the next non-space character.               |
| `MudReader.requireLine` | `get_line`           | Read the next non-comment, non-blank line.       |

Initial flag values should use `number` because the default ASCII flag range fits safely in
JavaScript integers. If real-world data requires larger values, add a `bigint` option before
expanding the public surface.

Flag resolution helpers convert between the internal numeric representation and the public
string-based representation:

```ts
export type FlagTable = readonly string[];

export function bitvectorToAsciiFlags(value: BitVector): string;
export function bitvectorSetToAsciiFlags(set: BitVectorSet): string;
export function resolveFlagNames(value: BitVector, table: FlagTable): string[];
export function resolveFlagSetNames(set: BitVectorSet, table: FlagTable): string[];
```

| TypeScript helper          | Purpose                                                        |
| -------------------------- | -------------------------------------------------------------- |
| `bitvectorToAsciiFlags`    | Convert a single numeric bitvector to ASCII letter encoding.   |
| `bitvectorSetToAsciiFlags` | Convert a four-element bitvector set to space-separated ASCII. |
| `resolveFlagNames`         | Map set bits in a single bitvector to flag names from a table. |
| `resolveFlagSetNames`      | Map set bits across a four-element set to flag names.          |

`bitvectorToAsciiFlags` is the inverse of `parseAsciiFlag`. It converts a number to the canonical
ASCII letter representation: bits 0–25 produce `'a'`–`'z'`, bits 26–51 produce `'A'`–`'Z'`, and
zero produces `"0"`. Numeric values in the source data are always converted to letter form so that
`*Bits` fields are consistent regardless of the original encoding.

## Buffer, String, Or Stream

Recommended first implementation:

1. `parseFile()` reads a whole file into a `Buffer`.
2. `MudReader` decodes the `Buffer` once using `encoding ?? 'utf8'`.
3. Parsers consume the reader as a cursor over text.

Reasons:

- CircleMUD/TbaMUD world files are small enough that whole-file parsing is simpler and practical.
- The format is line-oriented but also needs character-level lookahead for `fread_letter()` style
  parsing.
- Object files do not have an explicit end-of-record marker; the parser sometimes needs to retain
  the next `#` line for the following object.
- Streams would add state-machine complexity without solving a current problem.

The library should expose `parseString`-style behavior through the type-specific content parsers,
not through a public stream API. A stream API can be added later without breaking the initial API.

## Logging

The parser should log through `ParseOptions.logger` only. It should never write directly to
`console`, because the library is used by both tests and the CLI.

If no logger is provided, the parser should use an internal silent logger whose methods are no-ops.
Consumers can pass `console` directly because `Logger` matches the basic console method shape.

Log levels should be used consistently:

| Method         | Intended use                                                    |
| -------------- | --------------------------------------------------------------- |
| `logger.debug` | Verbose parser progress, record boundaries, format branches.    |
| `logger.info`  | Basic stats, such as records parsed from a file.                |
| `logger.warn`  | Recoverable issues, such as duplicate records in the same file. |
| `logger.error` | Fatal parsing errors before throwing `MudParserError`.          |

`onWarning` remains the structured warning callback for callers that want machine-readable warning
data. When a `ParseWarning` is emitted, the parser may also call `logger.warn` with a human-readable
message.

## Errors And Warnings

Parsing failures should throw structured errors that are useful to both tests and the CLI.

```ts
export interface MudParserErrorContext {
  source?: SourceSpan;
  recordType?: RecordType;
  vnum?: Vnum;
  cause?: unknown;
}

export class MudParserError extends Error {
  readonly source?: SourceSpan;
  readonly recordType?: RecordType;
  readonly vnum?: Vnum;

  constructor(message: string, context?: MudParserErrorContext);
}

export class ParseError extends MudParserError {}

export class UnsupportedRecordTypeError extends MudParserError {
  readonly fileName: string;
}

export interface ParseWarning {
  message: string;
  source?: SourceSpan;
  recordType?: RecordType;
  vnum?: Vnum;
}
```

`MudParserError` is the public base class for all library-thrown errors. Consumers can catch this
single type when they want to distinguish parser failures from unrelated filesystem or application
errors. `ParseError` should represent source-format failures, while subclasses such as
`UnsupportedRecordTypeError` can represent API or dispatch failures.

Line and file context should be exposed through `source`. For parser errors raised while reading a
record, include `recordType` and `vnum` when known. Fatal parse paths should log with
`logger.error` before throwing the error.

`strict` should default to `true`. It controls **validation severity only**, not format selection.
All parsers auto-detect CircleMUD and tbaMUD layouts by structure (field counts, missing builders
line, command argument counts) so both formats parse without any flags.

Values that the reference C loader silently normalizes are normalized unconditionally with a
warning, regardless of `strict` — for example, out-of-range enhanced mobile stats are clamped to
their valid range (matching the `RANGE()` macro in `interpret_espec()`), and out-of-range room
sector types are reset to `inside`. Setting `strict: false` only downgrades genuinely malformed
input that the C loader would reject — such as an unrecognized espec keyword or a non-numeric espec
value — from an error to a warning.

## JSON Output Contract

Records should serialize as stable plain objects. Bitvector fields appear as resolved flag name
arrays with a companion `*Bits` field containing the canonical ASCII encoding. Example shape for a
room whose source data had `roomFlags[0] = 156` (bits 2, 3, 4, 7):

```json
{
  "recordType": "world",
  "vnum": 3000,
  "name": "The Reading Room",
  "description": "   You are in a small, simple room...",
  "roomFlags": ["NO_MOB", "INDOORS", "PEACEFUL", "NO_MAGIC"],
  "roomFlagsBits": "cdeh 0 0 0",
  "sectorType": 0,
  "directions": [],
  "extraDescriptions": [],
  "triggerVnums": []
}
```

The `roomFlags` array lists the flag names from `room_bits[]` for every set bit across all four
bitvector elements. The `roomFlagsBits` string is the space-separated ASCII encoding of each
element (`"cdeh"` for 156, `"0"` for each zero element). The same pattern applies to every
bitvector field in every record type.

All text fields normalize line endings to `\n`. Any `\r\n` sequences in source data are converted
during parsing to reduce storage footprint.

## Expected Implementation Layout

One possible layout:

```text
src/index.ts              Public exports
src/types.ts              Shared public types
src/records.ts            MudRecord and subclasses
src/errors.ts             Parse errors and warnings
src/flags.ts              Flag tables and bitvector-to-name resolution
src/reader.ts             MudReader and low-level helpers
src/parsers/file.ts       parseFile and extension inference
src/parsers/world.ts      .wld parser
src/parsers/mobile.ts     .mob parser
src/parsers/object.ts     .obj parser
src/parsers/zone.ts       .zon parser
src/parsers/shop.ts       .shp parser
src/parsers/quest.ts      .qst parser
src/parsers/trigger.ts    .trg parser
```

This layout is not part of the public API, but it keeps the layers clear.

## Test Strategy

- Unit test `parseAsciiFlag`, `parseAsciiAffectFlag`, `bitvectorToAsciiFlags`, `resolveFlagNames`,
  `parseAt`, tilde string reading, number reading, and skipped-line behavior independently.
- Unit test each type-specific content parser with short inline fixtures.
- Add fixture tests against files under `data/tbamud/lib/world` and `data/circle-3.1/lib/world`
  once each parser is implemented, so both corpora are exercised.
- Test `parseFile()` extension inference separately from record parsing.
- Test `toJSON()` output so CLI behavior remains stable.

## Resolved Decisions

- **Line endings**: Public records normalize all line endings to `\n`. Any `\r\n` sequences in source
  data are converted during parsing. This reduces storage footprint in the final product.
- **Parser phases**: Record types are implemented in phases — Zone first, then World, Object, Mobile,
  and remaining types — rather than all at once.
- **Help files**: Help files are a separate concern and are out of scope for this library.
- **Format auto-detection**: All parsers accept both CircleMUD and tbaMUD layouts by inspecting
  field counts and header structure. The `strict` flag is validation severity only. Differences
  handled:
  - `.wld`: 3-field room flags line (CircleMUD) vs 6-field (tbaMUD) — auto-detected by token count.
  - `.mob`: 4-field legacy flag line (CircleMUD) vs 10-field (tbaMUD) — auto-detected by token count.
  - `.obj`: 3/4-field legacy flag line (CircleMUD) vs 13-field (tbaMUD) — auto-detected by token count.
  - `.zon`: No builders line in CircleMUD header (tbaMUD has builders + name); zone reset `G`
    command uses 3 numeric arguments in CircleMUD, 4 in tbaMUD (the extra arg3 is unused at reset).
  - `.shp`: Named trade types (CircleMUD, e.g. `SCROLL`) and numeric trade types (tbaMUD, e.g. `2`)
    both resolve to the same `itemType` number via the `ITEM_TYPES` table.
  - CircleMUD 3.1 has no `.qst` or `.trg` files; those parsers are tbaMUD-specific.
