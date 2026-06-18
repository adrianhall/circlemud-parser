# SQL Format Output

## Problem Statement

The current circlemud-parser CLI (in `src/cli`) provides a conversion utility from the TbaMUD and CircleMUD data files to JSON, YAML, or TOML. The predominent usage of the parser is to provide seed data for modern engines based on SQL.

## Proposal

The circlemud-parser CLI will be extended to support SQL generation. An example CLI command might be:

```bash
circlemud-parser -O src/db/migration -f sql --start-number=9000 --emit-create-tables=0001_world.sql data/tbamud/lib/world
```

This has three specific new CLI arguments:

- `-f sql` or `--format sql` generates SQL migration files
- `--start-number=9000` (the default) starts the numnbering at 9000 (see files generated)
- `--emit-create-tables=0001_world.sql` also generates a migration file (names) that creates the tables and common indices needed.

This CLI would generate a set of files within `src/db/migration` that will, when applied to a database, populate the tables required. The files generated would be:

- `0001_world.sql` - the CREATE TABLE / CREATE INDEX / etc. SQL statements
- `9000_zone_data.sql`
- `9001_room_data.sql`
- `9002_object_data.sql`
- `9003_mobile_data.sql`
- `9004_shop_data.sql`
- `9005_trigger_data.sql`
- `9006_quest_data.sql`

The data is normalized and linked. So zones contain rooms that contain exits and descriptions. Zones have reset commands.

The SQL dialect to use is D1 SQLite. However, we may add additional dialects in the future, so it should be expandable easily without a rearchitecture.

Some notes on individual fields:

- Flags are stored by name as a JSON set or list, where possible. Do not store the bitvector version.
- For zones, we explicitly exclude the "builders" and "flags" columns - they are irrelevant in the game.
- The source should become a single string, e.g. "zon/30.zon#12" indicates this record came from `zon/30.zon` and the record started at line 12. This is stored in the "source" block in JSON, YAML, and TOML.

## Specification

### Overview

A new `sql` output format extends the existing CLI. Unlike `json`/`yaml`/`toml` — which serialize
one output file per input file — `sql` **aggregates every parsed record across the entire input
work plan**, groups records by `RecordType`, normalizes nested collections into linked child tables,
and emits a fixed, deterministically numbered set of D1 SQLite migration files. An optional schema
(DDL) migration can be emitted alongside the data.

The SQL layer is built behind a `SqlDialect` abstraction so additional dialects can be added later
without rearchitecting the emitter. The only dialect implemented in this phase is **D1 SQLite**.

### Goals

- Produce idempotent, ready-to-apply D1 migration files that seed a normalized relational schema.
- Preserve VNUMs as the primary identity of top-level records and keep cross-record references as
  VNUMs (no surrogate keys are invented for _links_). Owned child rows, which have no natural VNUM
  identity of their own (extra descriptions, exits, zone commands, object affects, shop buy types),
  use a global ULID primary key.
- Normalize repeating collections into child tables; keep flags and fixed scalar tuples as JSON.
- Enforce **ownership** relationships with foreign keys + cascade delete; leave **link**
  relationships as plain indexed columns.
- Keep the design open to additional SQL dialects.

### Non-Goals

- Resolving cross-record VNUM _links_ into surrogate keys or enforcing them with foreign keys
  (links stay as VNUMs). This does not apply to owned child rows, which do get ULID keys.
- Booting a MUD or executing zone resets / DG scripts.
- Producing a Wrangler project, `wrangler.jsonc`, or running `wrangler d1 migrations apply`.

## CLI Changes

### New / changed flags

| Flag                          | Default | Description                                                                           |
| ----------------------------- | ------- | ------------------------------------------------------------------------------------- |
| `-f, --format sql`            | —       | Selects SQL migration output. Extends the existing `OutputFormat` union with `'sql'`. |
| `--start-number <n>`          | `9000`  | First migration number. Each record type is assigned a fixed offset from this value.  |
| `--emit-create-tables <file>` | (unset) | When set, also emit a schema (DDL) migration file using this exact filename.          |

When `--emit-create-tables` is omitted, only data files are generated (the schema is assumed to
already exist).

### Validation

- `--start-number` must be a non-negative integer; otherwise exit code `2`.
- `--emit-create-tables` value must be a non-empty filename (no path separators); otherwise exit `2`.
- `--start-number` and `--emit-create-tables` are only valid when `-f sql` is selected. Using either
  with another format is a usage error (exit `2`).
- Existing flags retain their meaning: `-O/--output-directory` is the migration directory,
  `--overwrite` / `--skip-if-exists` govern per-output-file clobbering, and logging flags are
  unchanged.

### Example

```bash
circlemud-parser -O src/db/migration -f sql \
  --start-number=9000 --emit-create-tables=0001_world.sql \
  data/tbamud/lib/world
```

## Output Model

### Aggregation

In SQL mode the CLI does **not** write one output per input file. Instead it parses the whole work
plan (file, index, or directory), accumulates all records in memory, groups them by `RecordType`,
and emits one data file per non-empty record type at the end of processing.

### File set, numbering, and ordering

Each record type has a **fixed offset** from `--start-number`. A data file is emitted only when its
type has at least one record; offsets are stable so filenames are deterministic regardless of which
types are present. With the default start of `9000`:

| Offset | File                    | Tables populated                                         |
| ------ | ----------------------- | -------------------------------------------------------- |
| +0     | `9000_zone_data.sql`    | `zones`, `zone_commands`                                 |
| +1     | `9001_room_data.sql`    | `rooms`, `room_exits`, `room_extra_descriptions`         |
| +2     | `9002_object_data.sql`  | `objects`, `object_extra_descriptions`, `object_affects` |
| +3     | `9003_mobile_data.sql`  | `mobiles`                                                |
| +4     | `9004_shop_data.sql`    | `shops`, `shop_buy_types`                                |
| +5     | `9005_trigger_data.sql` | `triggers`                                               |
| +6     | `9006_quest_data.sql`   | `quests`                                                 |

The schema file (when requested) uses the literal filename from `--emit-create-tables`
(e.g. `0001_world.sql`) and is written into the same output directory. The caller is responsible
for choosing a name that sorts before the data files so D1 applies the schema first. D1 applies
migrations in lexicographic filename order.

This ordering is **dependency-correct**: every cross-file ownership foreign key points from a
top-level record back to its owning zone (`rooms`, `objects`, `mobiles`, `shops`, `triggers`, and
`quests` each carry `zone_vnum → zones.vnum`). Zones (`+0`) are always emitted first, so every such
FK target already exists. All remaining foreign keys are within a single file (parent rows are
emitted before their child rows). No `PRAGMA defer_foreign_keys` is required; it remains available as
a fallback if a future schema introduces cross-file ownership cycles.

## SQL Generation Semantics

### Dialect: D1 SQLite

- Statements target SQLite as implemented by Cloudflare D1.
- D1 enforces foreign keys by default, so ownership cascade deletes work without extra pragmas.

### Idempotency

- Data rows use `INSERT OR IGNORE`, so re-applying a migration is a no-op for already-seeded rows.
- Child tables carry a natural uniqueness key (`UNIQUE(parent_vnum, ordinal)`, or
  `UNIQUE(room_vnum, direction)` for exits) so `INSERT OR IGNORE` correctly skips duplicates on
  re-apply even though their primary key is a ULID.
- Schema DDL uses `CREATE TABLE IF NOT EXISTS` and `CREATE INDEX IF NOT EXISTS`.

### Statement size and batching

D1 enforces a **maximum SQL statement length of 100,000 bytes (100 KB)**, applied to each individual
statement (including each statement inside a `db.batch()`). A multi-row
`INSERT OR IGNORE INTO t (...) VALUES (...),(...),...;` is a _single_ statement, so the entire
rendered statement — prefix, every value tuple, and the trailing `;` — must fit under the cap.

The emitter packs rows into multi-row `INSERT` statements to cut statement count and file size, while
keeping each statement **well under** the hard limit:

- Each dialect exposes its hard cap and a conservative pack target. For D1 SQLite:
  `maxStatementBytes = 100_000`, `batchTargetBytes = 60_000`. The emitter packs to the target,
  leaving generous headroom for the limit.
- Packing is greedy and order-preserving: open a statement with the `INSERT OR IGNORE INTO t (cols) VALUES` prefix, then append `(tuple)` rows separated by `,` while the running **UTF-8 byte length** (measured with `Buffer.byteLength`, not character count) plus the next tuple and the closing `;` stays ≤ `batchTargetBytes`. When the next row would exceed the target, close the current statement with `;`, emit a newline, and start a fresh `INSERT` for the same table.
- Statements never span tables, and child rows still follow their parents (each table is fully
  emitted, parents before children) so ownership FKs remain satisfied.
- **Oversized single row.** If one row's rendered tuple alone would exceed `maxStatementBytes` (only
  possible with a very large description/`commands` body — D1 allows a 2 MB row but only a 100 KB
  statement), it cannot be expressed as a literal `INSERT` and the emitter raises a fatal error
  identifying the record VNUM and source. Real-world MUD text is a few KB, so this is a guard, not an
  expected path.

### Foreign key strategy

Foreign keys model **ownership only**:

- **Zone ownership (all top-level records).** A zone owns every record whose VNUM falls within its
  `[bottom, top]` range — not just rooms, but also mobiles, objects, shops, triggers, and quests
  (verified against both corpora; see [Zone containment analysis](#zone-containment-analysis)). Each
  of these tables therefore carries `zone_vnum → zones.vnum ON DELETE CASCADE`. Deleting a zone
  cascades to **all** of its contained records, which directly supports the editor workflow of
  treating a zone and its mobiles/objects/shops/triggers/quests/rooms as a single editable unit.
- **Owned child rows.** A child row that _belongs to_ a record gets a foreign key to its parent with
  `ON DELETE CASCADE` (e.g. `room_exits.room_vnum → rooms.vnum`, `zone_commands.zone_vnum →
zones.vnum`, `object_affects.object_vnum → objects.vnum`). Cascades chain: deleting a zone removes
  its rooms, which removes those rooms' exits and extra descriptions, and so on.
- **Link** references — a VNUM that merely points at another record (`room_exits.to_room_vnum`,
  `room_exits.key_vnum`, `shops.keeper_vnum`, `quests.questmaster_vnum`, zone-command target VNUMs,
  `*_vnums` reference arrays) — are plain columns with **no foreign key**, only indexes. This lets
  links cross zone boundaries or point at records outside the converted set without breaking the
  load, while ownership still drives cascade deletes.

### Derived zone membership

No record type carries an explicit zone field in the parser output, so the emitter derives
`zone_vnum` for every top-level record (room, mobile, object, shop, trigger, quest) by matching its
VNUM against the parsed zones: the owning zone is the one where `bottom <= vnum <= top`. Because
`zone_vnum` is derived only from zones that are part of this conversion, the FK always resolves or is
`NULL` (a record whose VNUM matches no converted zone). FK columns permit `NULL` in SQLite.

### Zone containment analysis

The ownership model above depends on every record VNUM resting inside exactly one zone range. This
was verified by parsing both bundled corpora:

| Corpus        | Zones | Range overlaps | rooms | mobiles | objects | shops | quests | triggers |
| ------------- | ----- | -------------- | ----- | ------- | ------- | ----- | ------ | -------- |
| tbaMUD        | 189   | 0              | 12700 | 3705    | 4765    | 334   | 1      | 1461     |
| CircleMUD 3.1 | 30    | 0              | 1878  | 569     | 679     | 46    | —      | —        |

In both corpora **100% of records of every type fall within exactly one zone's `[bottom, top]`
range, and no zone ranges overlap**. This makes range-based zone ownership unambiguous (no tie-break
needed) and confirms cascade delete from a zone is safe for all top-level record types. If a future
data set were to violate this (overlapping ranges or an out-of-range VNUM), the emitter assigns the
smallest containing range and leaves unmatched records' `zone_vnum` as `NULL`, and should emit a
warning.

## Field Mapping Rules

These rules transform each record's `toJSON()` output into columns.

- **Derived zone ownership.** Every top-level record (room, mobile, object, shop, trigger, quest)
  gets a `zone_vnum` column computed from its VNUM via the zone ranges (see
  [Derived zone membership](#derived-zone-membership)). This is the cascade-delete anchor for the
  whole zone.
- **Flags → JSON name arrays.** Every `*Flags` / flag-list field is stored as a JSON array of
  resolved flag-name strings in a `TEXT` column (with `CHECK(json_valid(col))`). Empty becomes
  `'[]'`. The `*FlagsBits` / `*Bits` companion strings are **dropped**.
- **Ordinals → resolved names, integer dropped.** Every ordinal field that maps to a name table in
  `constants.c` is stored as its `TEXT` name; the raw integer is omitted. This covers ordinals the
  parser already resolves (`objectType`→object type name, `ObjectAffect.location`, shop item type,
  `questType`, trigger `attachType`) and ordinals resolved by the SQL layer via supplemental name
  tables (sector type, exit direction, mobile `position`/`defaultPosition`, `sex`). Ordinals with no
  `constants.c` name table (zone `resetMode`, shop `temper`, zone-command `ifFlag`) keep their
  integer value.
- **Scalar tuples → JSON.** Fixed-width numeric tuples (`ObjectRecord.values`) and bare
  cross-reference VNUM lists (`triggerVnums`, shop `productVnums`, shop `roomVnums`) are stored as
  JSON arrays in `TEXT` columns. (They are pure link lists with no per-element attributes, so a
  child table adds no value and no FK is permitted anyway.)
- **Collections → child tables.** Collections whose elements carry attributes become child tables:
  room exits, room/object extra descriptions, object affects, zone commands, shop buy types. Each
  child row gets a global ULID `id` primary key (generated via `ulidx`) and an `ordinal` column
  preserving source array order.
- **1:1 nested objects → flattened columns.** `MobileStats` and `MobileEnhancedData` are flattened
  into columns on `mobiles` (enhanced columns are nullable and only populated for enhanced mobiles).
- **`DiceRoll` → D&D dice string.** The two mobile `DiceRoll` fields (`hitDice`, `damageDice`) are
  serialized to a single `TEXT` column each as `"<count>d<sides>"` with a signed bonus term appended
  only when non-zero — e.g. `{count:10, sides:6, bonus:4}` → `"10d6+4"`, `{2, 8, 0}` → `"2d8"`,
  `{1, 4, -1}` → `"1d4-1"`. This is trivially re-parseable with `/^(\d+)d(\d+)([+-]\d+)?$/`.
  (Objects have no `DiceRoll` field; weapon dice remain inside the `object_values` JSON tuple.)
- **`source` → single string.** The `SourceSpan` is collapsed to `"<relativePath>#<startLine>"`,
  where `relativePath` is the source file path made relative to the resolved input root and
  normalized to POSIX separators (e.g. `zon/30.zon#12`). For single-file input the relative path is
  the basename. Stored in a nullable `source TEXT` column. `endLine` is not emitted. `ZoneCommand`
  rows carry their own per-command `source`.
- **Nulls.** Fields that are `null` in `toJSON()` map to SQL `NULL` in nullable columns.
- **Text.** Already normalized to `\n` by the parser. String literals escape single quotes by
  doubling; embedded newlines are written verbatim inside the quoted literal.
- **Zone exclusions.** Per the proposal, `zones` omits `builders` and `zoneFlags` entirely.

## Schema (DDL)

The `--emit-create-tables` file contains the following statements (D1 SQLite). All JSON columns are
`TEXT` with a `json_valid` check. Owned child rows have no natural VNUM identity, so their primary
key is a **global ULID** stored as `TEXT` (a 26-character Crockford base32 string). ULIDs are
generated at emit time with the [`ulidx`](https://github.com/perry-mitchell/ulidx) library. They
remain stable inside a generated file, and row-level idempotency is preserved by the natural
uniqueness key (`UNIQUE(parent_vnum, ordinal)`, or `UNIQUE(room_vnum, direction)` for exits)
combined with `INSERT OR IGNORE`, not by the ULID itself.

```sql
-- Zones (builders and flags intentionally excluded)
CREATE TABLE IF NOT EXISTS zones (
  vnum        INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  bottom      INTEGER NOT NULL,
  top         INTEGER NOT NULL,
  lifespan    INTEGER NOT NULL,
  reset_mode  INTEGER NOT NULL,
  min_level   INTEGER,
  max_level   INTEGER,
  source      TEXT
);

CREATE TABLE IF NOT EXISTS zone_commands (
  id          TEXT PRIMARY KEY,                                -- ULID
  zone_vnum   INTEGER NOT NULL REFERENCES zones(vnum) ON DELETE CASCADE,
  ordinal     INTEGER NOT NULL,
  command     TEXT NOT NULL,
  if_flag     INTEGER NOT NULL,
  args        TEXT NOT NULL CHECK (json_valid(args)),         -- JSON number array
  string_args TEXT NOT NULL CHECK (json_valid(string_args)),  -- JSON string array
  comment     TEXT,
  source      TEXT,
  UNIQUE (zone_vnum, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_zone_commands_zone ON zone_commands (zone_vnum);

-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
  vnum          INTEGER PRIMARY KEY,
  zone_vnum     INTEGER REFERENCES zones(vnum) ON DELETE CASCADE,  -- derived ownership
  name          TEXT NOT NULL,
  description   TEXT,
  room_flags    TEXT NOT NULL CHECK (json_valid(room_flags)),      -- JSON name array
  sector_type   TEXT NOT NULL,                                     -- resolved name
  trigger_vnums TEXT NOT NULL CHECK (json_valid(trigger_vnums)),   -- JSON number array (links)
  source        TEXT
);
CREATE INDEX IF NOT EXISTS idx_rooms_zone ON rooms (zone_vnum);

CREATE TABLE IF NOT EXISTS room_exits (
  id           TEXT PRIMARY KEY,                               -- ULID
  room_vnum    INTEGER NOT NULL REFERENCES rooms(vnum) ON DELETE CASCADE,
  direction    TEXT NOT NULL,                                  -- resolved name
  description  TEXT,
  keywords     TEXT NOT NULL CHECK (json_valid(keywords)),     -- JSON string array
  exit_flags   TEXT NOT NULL CHECK (json_valid(exit_flags)),   -- JSON name array
  key_vnum     INTEGER,                                        -- link, no FK
  to_room_vnum INTEGER,                                        -- link, no FK
  UNIQUE (room_vnum, direction)
);
CREATE INDEX IF NOT EXISTS idx_room_exits_room    ON room_exits (room_vnum);
CREATE INDEX IF NOT EXISTS idx_room_exits_to_room ON room_exits (to_room_vnum);

CREATE TABLE IF NOT EXISTS room_extra_descriptions (
  id          TEXT PRIMARY KEY,                                -- ULID
  room_vnum   INTEGER NOT NULL REFERENCES rooms(vnum) ON DELETE CASCADE,
  ordinal     INTEGER NOT NULL,
  keywords    TEXT NOT NULL CHECK (json_valid(keywords)),      -- JSON string array
  description TEXT,
  UNIQUE (room_vnum, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_room_xdesc_room ON room_extra_descriptions (room_vnum);

-- Objects
CREATE TABLE IF NOT EXISTS objects (
  vnum               INTEGER PRIMARY KEY,
  zone_vnum          INTEGER REFERENCES zones(vnum) ON DELETE CASCADE,  -- derived ownership
  aliases            TEXT NOT NULL CHECK (json_valid(aliases)),
  short_description  TEXT,
  description        TEXT,
  action_description TEXT,
  object_type        TEXT NOT NULL,                            -- resolved name
  extra_flags        TEXT NOT NULL CHECK (json_valid(extra_flags)),
  wear_flags         TEXT NOT NULL CHECK (json_valid(wear_flags)),
  affect_flags       TEXT NOT NULL CHECK (json_valid(affect_flags)),
  object_values      TEXT NOT NULL CHECK (json_valid(object_values)), -- JSON 4-number array
  weight             INTEGER NOT NULL,
  cost               INTEGER NOT NULL,
  rent               INTEGER NOT NULL,
  level              INTEGER NOT NULL,
  timer              INTEGER NOT NULL,
  trigger_vnums      TEXT NOT NULL CHECK (json_valid(trigger_vnums)), -- JSON number array (links)
  source             TEXT
);
CREATE INDEX IF NOT EXISTS idx_objects_type ON objects (object_type);
CREATE INDEX IF NOT EXISTS idx_objects_zone ON objects (zone_vnum);

CREATE TABLE IF NOT EXISTS object_extra_descriptions (
  id          TEXT PRIMARY KEY,                                -- ULID
  object_vnum INTEGER NOT NULL REFERENCES objects(vnum) ON DELETE CASCADE,
  ordinal     INTEGER NOT NULL,
  keywords    TEXT NOT NULL CHECK (json_valid(keywords)),
  description TEXT,
  UNIQUE (object_vnum, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_object_xdesc_object ON object_extra_descriptions (object_vnum);

CREATE TABLE IF NOT EXISTS object_affects (
  id          TEXT PRIMARY KEY,                                -- ULID
  object_vnum INTEGER NOT NULL REFERENCES objects(vnum) ON DELETE CASCADE,
  ordinal     INTEGER NOT NULL,
  location    TEXT NOT NULL,                                   -- resolved apply name
  modifier    INTEGER NOT NULL,
  UNIQUE (object_vnum, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_object_affects_object ON object_affects (object_vnum);

-- Mobiles (stats + enhanced flattened)
CREATE TABLE IF NOT EXISTS mobiles (
  vnum               INTEGER PRIMARY KEY,
  zone_vnum          INTEGER REFERENCES zones(vnum) ON DELETE CASCADE,  -- derived ownership
  aliases            TEXT NOT NULL CHECK (json_valid(aliases)),
  short_description  TEXT,
  long_description   TEXT,
  description        TEXT,
  action_flags       TEXT NOT NULL CHECK (json_valid(action_flags)),
  affect_flags       TEXT NOT NULL CHECK (json_valid(affect_flags)),
  alignment          INTEGER NOT NULL,
  kind               TEXT NOT NULL CHECK (kind IN ('simple', 'enhanced')),
  level              INTEGER NOT NULL,
  hitroll            INTEGER NOT NULL,
  armor_class        INTEGER NOT NULL,
  hit_dice           TEXT NOT NULL,                            -- D&D dice string, e.g. "10d6+4"
  damage_dice        TEXT NOT NULL,                            -- D&D dice string, e.g. "2d8"
  gold               INTEGER NOT NULL,
  experience         INTEGER NOT NULL,
  position           TEXT NOT NULL,                            -- resolved name
  default_position   TEXT NOT NULL,                            -- resolved name
  sex                TEXT NOT NULL,                            -- resolved name
  bare_hand_attack   INTEGER,
  strength           INTEGER,
  strength_add       INTEGER,
  intelligence       INTEGER,
  wisdom             INTEGER,
  dexterity          INTEGER,
  constitution       INTEGER,
  charisma           INTEGER,
  saving_para        INTEGER,
  saving_rod         INTEGER,
  saving_petri       INTEGER,
  saving_breath      INTEGER,
  saving_spell       INTEGER,
  trigger_vnums      TEXT NOT NULL CHECK (json_valid(trigger_vnums)), -- JSON number array (links)
  source             TEXT
);
CREATE INDEX IF NOT EXISTS idx_mobiles_zone ON mobiles (zone_vnum);

-- Shops
CREATE TABLE IF NOT EXISTS shops (
  vnum                INTEGER PRIMARY KEY,
  zone_vnum           INTEGER REFERENCES zones(vnum) ON DELETE CASCADE, -- derived ownership
  product_vnums       TEXT NOT NULL CHECK (json_valid(product_vnums)), -- JSON number array (links)
  buy_profit          REAL NOT NULL,
  sell_profit         REAL NOT NULL,
  no_such_item_keeper TEXT,
  no_such_item_player TEXT,
  do_not_buy          TEXT,
  missing_cash_keeper TEXT,
  missing_cash_player TEXT,
  message_buy         TEXT,
  message_sell        TEXT,
  temper              INTEGER NOT NULL,
  shop_flags          TEXT NOT NULL CHECK (json_valid(shop_flags)),
  keeper_vnum         INTEGER,                                 -- link, no FK
  no_trade_flags      TEXT NOT NULL CHECK (json_valid(no_trade_flags)),
  room_vnums          TEXT NOT NULL CHECK (json_valid(room_vnums)),   -- JSON number array (links)
  open1               INTEGER NOT NULL,
  close1              INTEGER NOT NULL,
  open2               INTEGER NOT NULL,
  close2              INTEGER NOT NULL,
  source              TEXT
);
CREATE INDEX IF NOT EXISTS idx_shops_keeper ON shops (keeper_vnum);
CREATE INDEX IF NOT EXISTS idx_shops_zone ON shops (zone_vnum);

CREATE TABLE IF NOT EXISTS shop_buy_types (
  id         TEXT PRIMARY KEY,                                 -- ULID
  shop_vnum  INTEGER NOT NULL REFERENCES shops(vnum) ON DELETE CASCADE,
  ordinal    INTEGER NOT NULL,
  item_type  TEXT NOT NULL,                                    -- resolved name
  expression TEXT,
  UNIQUE (shop_vnum, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_shop_buy_types_shop ON shop_buy_types (shop_vnum);

-- Triggers
CREATE TABLE IF NOT EXISTS triggers (
  vnum          INTEGER PRIMARY KEY,
  zone_vnum     INTEGER REFERENCES zones(vnum) ON DELETE CASCADE,        -- derived ownership
  name          TEXT,
  attach_type   TEXT NOT NULL,                                 -- resolved name
  trigger_types TEXT NOT NULL CHECK (json_valid(trigger_types)), -- JSON name array
  numeric_arg   INTEGER NOT NULL,
  arg_list      TEXT,
  commands      TEXT NOT NULL CHECK (json_valid(commands)),    -- JSON string array (lines)
  source        TEXT
);
CREATE INDEX IF NOT EXISTS idx_triggers_zone ON triggers (zone_vnum);

-- Quests
CREATE TABLE IF NOT EXISTS quests (
  vnum               INTEGER PRIMARY KEY,
  zone_vnum          INTEGER REFERENCES zones(vnum) ON DELETE CASCADE,  -- derived ownership
  name               TEXT,
  description        TEXT,
  accept_message     TEXT,
  complete_message   TEXT,
  quit_message       TEXT,
  quest_type         TEXT NOT NULL,                            -- resolved name
  questmaster_vnum   INTEGER,                                  -- link, no FK
  quest_flags        TEXT NOT NULL CHECK (json_valid(quest_flags)),
  target_vnum        INTEGER,                                  -- link, no FK
  prev_quest_vnum    INTEGER,                                  -- link, no FK
  next_quest_vnum    INTEGER,                                  -- link, no FK
  prerequisite_vnum  INTEGER,                                  -- link, no FK
  points_reward      INTEGER NOT NULL,
  points_penalty     INTEGER NOT NULL,
  min_level          INTEGER NOT NULL,
  max_level          INTEGER NOT NULL,
  time_limit         INTEGER NOT NULL,
  return_mob_vnum    INTEGER,                                  -- link, no FK
  quantity           INTEGER NOT NULL,
  gold_reward        INTEGER NOT NULL,
  experience_reward  INTEGER NOT NULL,
  object_reward_vnum INTEGER,                                  -- link, no FK
  source             TEXT
);
CREATE INDEX IF NOT EXISTS idx_quests_questmaster ON quests (questmaster_vnum);
CREATE INDEX IF NOT EXISTS idx_quests_zone ON quests (zone_vnum);
```

## Data Files

Each data file contains `INSERT OR IGNORE` statements for its record type. Rows are packed into
multi-row statements that stay under the [batch byte target](#statement-size-and-batching). Within a
file, parent rows are emitted before their child rows (e.g. all `rooms`, then `room_exits`, then
`room_extra_descriptions`) so ownership foreign keys are satisfied without deferral. Example shape:

```sql
-- 9001_room_data.sql
INSERT OR IGNORE INTO rooms
  (vnum, zone_vnum, name, description, room_flags, sector_type, trigger_vnums, source)
VALUES
  (3001, 3000, 'The Temple Of Midgaard', 'You are in the southern...',
   '["INDOORS","PEACEFUL"]', 'Inside', '[]', 'wld/30.wld#1'),
  (3002, 3000, 'The Reading Room', 'A small, simple room...',
   '["NO_MOB","INDOORS","PEACEFUL"]', 'Inside', '[]', 'wld/30.wld#42');
  -- ...more room tuples until the statement nears batchTargetBytes, then a new INSERT begins.

INSERT OR IGNORE INTO room_exits
  (id, room_vnum, direction, description, keywords, exit_flags, key_vnum, to_room_vnum)
VALUES
  ('01J9Z3K2P7Q8R9S0T1U2V3W4X5', 3001, 'North', NULL, '[]', '[]', NULL, 3054),
  ('01J9Z3K2P8A1B2C3D4E5F6G7H8', 3001, 'East',  NULL, '[]', '[]', NULL, 3005);
```

## Architecture / Implementation

The existing serializer (`serializeRecords` in `src/cli/format.ts`) returns a single string per
input file and cannot express multi-file, aggregated SQL output. SQL mode therefore introduces a
parallel pipeline rather than extending `serializeRecords`.

Proposed layout:

```text
src/cli/sql/dialect.ts             SqlDialect interface + dialect registry
src/cli/sql/dialects/d1-sqlite.ts  D1 SQLite dialect (schema DDL, literal escaping, INSERT builders)
src/cli/sql/emit.ts                Grouping, zone-membership derivation, file naming/numbering, writes
```

- **`OutputFormat`** gains `'sql'` (update `src/cli/options.ts` `OutputFormat`, `VALID_FORMATS`,
  `isOutputFormat`, and `extensionForFormat` → `.sql`). Add `startNumber` and `emitCreateTables` to
  `CliOptions`, wired through `program.ts` with the validation above.
- **`processWorkPlan`** (`src/cli/process.ts`) branches when `format === 'sql'`: instead of
  per-file parse→serialize→write, it parses every `FileEntry`, collects `MudRecord[]` grouped by
  `RecordType`, then calls the SQL emitter once. The existing `WriteTracker` (atomic temp-rename
  writes), clobber rules, and exit-code semantics are reused.
- **`SqlDialect`** interface (first cut):

  ```ts
  interface SqlDialect {
    readonly name: string;
    /** Hard per-statement byte cap enforced by the engine (D1: 100_000). */
    readonly maxStatementBytes: number;
    /** Conservative target the emitter packs multi-row INSERTs to (D1: 60_000). */
    readonly batchTargetBytes: number;
    createTables(): string;
    /** Returns one or more `;`-terminated statements, each packed under batchTargetBytes. */
    insertStatements(recordType: RecordType, records: MudRecord[], ctx: EmitContext): string;
  }
  ```

  A registry maps a dialect key to its implementation; D1 SQLite is the default and only entry for
  now. A future `--sql-dialect` flag can select others without changing the emitter. Row packing and
  byte accounting live in the emitter (shared across dialects); the dialect supplies the caps plus
  per-row tuple rendering and identifier/literal quoting.

- **Library additions (minimal).** Supplemental ordinal name tables (sector type, direction,
  position, gender) and their resolvers are added to `src/flag-tables.ts` / `src/flags.ts` so the
  SQL layer can resolve ordinals the record classes do not already name. No change to existing
  record `toJSON()` output.
- **Dependencies.** Add [`ulidx`](https://github.com/perry-mitchell/ulidx) as a runtime dependency.
  The emitter calls `ulid()` once per owned child row to populate its `id` primary key. ULIDs are
  generated during emission and written into the data files; they are not regenerated at apply time.

## Edge Cases

- **Empty record type:** no data file is emitted for that type; its offset is skipped (gap in
  numbering is intentional and deterministic).
- **Record with no owning zone:** any top-level record whose VNUM matches no converted zone gets
  `zone_vnum = NULL` (and the emitter warns). Converting a whole world directory avoids this; a
  single-file conversion that omits the matching `.zon` is the usual cause.
- **Deleting a zone:** cascades to its rooms, mobiles, objects, shops, triggers, and quests, and
  transitively to their owned child rows (exits, extra descriptions, affects, buy types, zone
  commands). Link columns are untouched, so a surviving record that linked into the deleted zone
  simply holds a now-dangling VNUM (by design, since links are not FKs).
- **Link VNUM outside the converted set:** allowed — link columns have no FK.
- **Sentinel "absent" VNUMs** (e.g. `-1`, NOBODY) are already `null` in `toJSON()` and become SQL
  `NULL`.
- **Re-applying a migration:** `INSERT OR IGNORE` + natural unique keys make it a no-op.
- **Statement size:** multi-row INSERTs are packed under `batchTargetBytes` (60 KB) so each stays
  well under D1's 100 KB hard cap. A single row whose rendered tuple exceeds the hard cap is a fatal
  error (identifies the record VNUM + source).
- **Schema filename ordering:** caller must pick an `--emit-create-tables` name that sorts before the
  data files.

## Testing

- Unit-test the D1 dialect: string-literal escaping (quotes, newlines, unicode), JSON-array
  encoding, `NULL` handling, and a schema snapshot.
- Unit-test per-type `insertStatements` with short inline record fixtures (one row + one child row
  each), asserting column order, ownership FK columns, and resolved-name/JSON mappings.
- Unit-test derived zone membership for all record types (in-range, out-of-range → `NULL` + warning,
  tie-break by smallest `top`).
- Unit-test numbering/offset assignment and empty-type skipping.
- Unit-test statement packing: assert every emitted statement's UTF-8 byte length stays under
  `batchTargetBytes`; assert packing still produces multiple statements when a type has many rows;
  assert a synthetic oversized single row raises the fatal error.
- Corpus invariant test: assert that for both `data/tbamud/lib/world` and `data/circle-3.1/lib/world`
  every parsed room, mobile, object, shop, trigger, and quest resolves to exactly one zone and that
  zone ranges do not overlap (the precondition for zone-scoped cascade delete).
- Corpus tests: generate SQL for both corpora, then load the schema + data files into an in-memory
  SQLite engine (`node:sqlite` or `better-sqlite3` dev dependency) with foreign keys enabled,
  asserting a clean load and that a second apply is a no-op (idempotency). Also assert that no
  generated statement in any file exceeds D1's 100 KB hard cap.
- Cascade test: after loading, `DELETE FROM zones WHERE vnum = ?` and assert the zone's rooms,
  mobiles, objects, shops, triggers, quests, and all their owned child rows are removed.
