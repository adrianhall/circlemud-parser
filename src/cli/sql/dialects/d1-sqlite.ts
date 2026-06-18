/**
 * D1 SQLite dialect for the CircleMUD/TbaMUD SQL migration emitter.
 *
 * Targets SQLite as implemented by Cloudflare D1.  Key characteristics:
 *   - Foreign keys are enforced by default.
 *   - Maximum statement length: 100,000 bytes.
 *   - Uses `INSERT OR IGNORE` for idempotent data seeding.
 *   - DDL uses `CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS`.
 */

import { registerDialect } from '../dialect.js';
import type { SqlDialect, SqlValue } from '../dialect.js';

const MAX_STATEMENT_BYTES = 100_000;
const BATCH_TARGET_BYTES = 60_000;

/** DDL schema for the full world database. */
const DDL = `-- Zones (builders and flags intentionally excluded)
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
  id          TEXT PRIMARY KEY,
  zone_vnum   INTEGER NOT NULL REFERENCES zones(vnum) ON DELETE CASCADE,
  ordinal     INTEGER NOT NULL,
  command     TEXT NOT NULL,
  if_flag     INTEGER NOT NULL,
  args        TEXT NOT NULL CHECK (json_valid(args)),
  string_args TEXT NOT NULL CHECK (json_valid(string_args)),
  comment     TEXT,
  source      TEXT,
  UNIQUE (zone_vnum, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_zone_commands_zone ON zone_commands (zone_vnum);

-- Rooms
CREATE TABLE IF NOT EXISTS rooms (
  vnum          INTEGER PRIMARY KEY,
  zone_vnum     INTEGER REFERENCES zones(vnum) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  room_flags    TEXT NOT NULL CHECK (json_valid(room_flags)),
  sector_type   TEXT NOT NULL,
  trigger_vnums TEXT NOT NULL CHECK (json_valid(trigger_vnums)),
  source        TEXT
);
CREATE INDEX IF NOT EXISTS idx_rooms_zone ON rooms (zone_vnum);

CREATE TABLE IF NOT EXISTS room_exits (
  id           TEXT PRIMARY KEY,
  room_vnum    INTEGER NOT NULL REFERENCES rooms(vnum) ON DELETE CASCADE,
  direction    TEXT NOT NULL,
  description  TEXT,
  keywords     TEXT NOT NULL CHECK (json_valid(keywords)),
  exit_flags   TEXT NOT NULL CHECK (json_valid(exit_flags)),
  key_vnum     INTEGER,
  to_room_vnum INTEGER,
  UNIQUE (room_vnum, direction)
);
CREATE INDEX IF NOT EXISTS idx_room_exits_room    ON room_exits (room_vnum);
CREATE INDEX IF NOT EXISTS idx_room_exits_to_room ON room_exits (to_room_vnum);

CREATE TABLE IF NOT EXISTS room_extra_descriptions (
  id          TEXT PRIMARY KEY,
  room_vnum   INTEGER NOT NULL REFERENCES rooms(vnum) ON DELETE CASCADE,
  ordinal     INTEGER NOT NULL,
  keywords    TEXT NOT NULL CHECK (json_valid(keywords)),
  description TEXT,
  UNIQUE (room_vnum, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_room_xdesc_room ON room_extra_descriptions (room_vnum);

-- Objects
CREATE TABLE IF NOT EXISTS objects (
  vnum               INTEGER PRIMARY KEY,
  zone_vnum          INTEGER REFERENCES zones(vnum) ON DELETE CASCADE,
  aliases            TEXT NOT NULL CHECK (json_valid(aliases)),
  short_description  TEXT,
  description        TEXT,
  action_description TEXT,
  object_type        TEXT NOT NULL,
  extra_flags        TEXT NOT NULL CHECK (json_valid(extra_flags)),
  wear_flags         TEXT NOT NULL CHECK (json_valid(wear_flags)),
  affect_flags       TEXT NOT NULL CHECK (json_valid(affect_flags)),
  object_values      TEXT NOT NULL CHECK (json_valid(object_values)),
  weight             INTEGER NOT NULL,
  cost               INTEGER NOT NULL,
  rent               INTEGER NOT NULL,
  level              INTEGER NOT NULL,
  timer              INTEGER NOT NULL,
  trigger_vnums      TEXT NOT NULL CHECK (json_valid(trigger_vnums)),
  source             TEXT
);
CREATE INDEX IF NOT EXISTS idx_objects_type ON objects (object_type);
CREATE INDEX IF NOT EXISTS idx_objects_zone ON objects (zone_vnum);

CREATE TABLE IF NOT EXISTS object_extra_descriptions (
  id          TEXT PRIMARY KEY,
  object_vnum INTEGER NOT NULL REFERENCES objects(vnum) ON DELETE CASCADE,
  ordinal     INTEGER NOT NULL,
  keywords    TEXT NOT NULL CHECK (json_valid(keywords)),
  description TEXT,
  UNIQUE (object_vnum, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_object_xdesc_object ON object_extra_descriptions (object_vnum);

CREATE TABLE IF NOT EXISTS object_affects (
  id          TEXT PRIMARY KEY,
  object_vnum INTEGER NOT NULL REFERENCES objects(vnum) ON DELETE CASCADE,
  ordinal     INTEGER NOT NULL,
  location    TEXT NOT NULL,
  modifier    INTEGER NOT NULL,
  UNIQUE (object_vnum, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_object_affects_object ON object_affects (object_vnum);

-- Mobiles (stats + enhanced flattened)
CREATE TABLE IF NOT EXISTS mobiles (
  vnum               INTEGER PRIMARY KEY,
  zone_vnum          INTEGER REFERENCES zones(vnum) ON DELETE CASCADE,
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
  hit_dice           TEXT NOT NULL,
  damage_dice        TEXT NOT NULL,
  gold               INTEGER NOT NULL,
  experience         INTEGER NOT NULL,
  position           TEXT NOT NULL,
  default_position   TEXT NOT NULL,
  sex                TEXT NOT NULL,
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
  trigger_vnums      TEXT NOT NULL CHECK (json_valid(trigger_vnums)),
  source             TEXT
);
CREATE INDEX IF NOT EXISTS idx_mobiles_zone ON mobiles (zone_vnum);

-- Shops
CREATE TABLE IF NOT EXISTS shops (
  vnum                INTEGER PRIMARY KEY,
  zone_vnum           INTEGER REFERENCES zones(vnum) ON DELETE CASCADE,
  product_vnums       TEXT NOT NULL CHECK (json_valid(product_vnums)),
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
  keeper_vnum         INTEGER,
  no_trade_flags      TEXT NOT NULL CHECK (json_valid(no_trade_flags)),
  room_vnums          TEXT NOT NULL CHECK (json_valid(room_vnums)),
  open1               INTEGER NOT NULL,
  close1              INTEGER NOT NULL,
  open2               INTEGER NOT NULL,
  close2              INTEGER NOT NULL,
  source              TEXT
);
CREATE INDEX IF NOT EXISTS idx_shops_keeper ON shops (keeper_vnum);
CREATE INDEX IF NOT EXISTS idx_shops_zone ON shops (zone_vnum);

CREATE TABLE IF NOT EXISTS shop_buy_types (
  id         TEXT PRIMARY KEY,
  shop_vnum  INTEGER NOT NULL REFERENCES shops(vnum) ON DELETE CASCADE,
  ordinal    INTEGER NOT NULL,
  item_type  TEXT NOT NULL,
  expression TEXT,
  UNIQUE (shop_vnum, ordinal)
);
CREATE INDEX IF NOT EXISTS idx_shop_buy_types_shop ON shop_buy_types (shop_vnum);

-- Triggers
CREATE TABLE IF NOT EXISTS triggers (
  vnum          INTEGER PRIMARY KEY,
  zone_vnum     INTEGER REFERENCES zones(vnum) ON DELETE CASCADE,
  name          TEXT,
  attach_type   TEXT NOT NULL,
  trigger_types TEXT NOT NULL CHECK (json_valid(trigger_types)),
  numeric_arg   INTEGER NOT NULL,
  arg_list      TEXT,
  commands      TEXT NOT NULL CHECK (json_valid(commands)),
  source        TEXT
);
CREATE INDEX IF NOT EXISTS idx_triggers_zone ON triggers (zone_vnum);

-- Quests
CREATE TABLE IF NOT EXISTS quests (
  vnum               INTEGER PRIMARY KEY,
  zone_vnum          INTEGER REFERENCES zones(vnum) ON DELETE CASCADE,
  name               TEXT,
  description        TEXT,
  accept_message     TEXT,
  complete_message   TEXT,
  quit_message       TEXT,
  quest_type         TEXT NOT NULL,
  questmaster_vnum   INTEGER,
  quest_flags        TEXT NOT NULL CHECK (json_valid(quest_flags)),
  target_vnum        INTEGER,
  prev_quest_vnum    INTEGER,
  next_quest_vnum    INTEGER,
  prerequisite_vnum  INTEGER,
  points_reward      INTEGER NOT NULL,
  points_penalty     INTEGER NOT NULL,
  min_level          INTEGER NOT NULL,
  max_level          INTEGER NOT NULL,
  time_limit         INTEGER NOT NULL,
  return_mob_vnum    INTEGER,
  quantity           INTEGER NOT NULL,
  gold_reward        INTEGER NOT NULL,
  experience_reward  INTEGER NOT NULL,
  object_reward_vnum INTEGER,
  source             TEXT
);
CREATE INDEX IF NOT EXISTS idx_quests_questmaster ON quests (questmaster_vnum);
CREATE INDEX IF NOT EXISTS idx_quests_zone ON quests (zone_vnum);
`;

/** Escapes a string value for inclusion in a SQL single-quoted literal. */
export function escapeSqlString(value: string): string {
  // Escape single quotes by doubling; embedded newlines are kept verbatim.
  return value.replace(/'/g, "''");
}

/** Renders a single `SqlValue` to its SQL literal representation. */
export function renderSqlValue(value: SqlValue): string {
  if (value === null) return 'NULL';
  if (typeof value === 'number') return String(value);
  return `'${escapeSqlString(value)}'`;
}

const D1SqliteDialect: SqlDialect = {
  name: 'D1 SQLite',
  maxStatementBytes: MAX_STATEMENT_BYTES,
  batchTargetBytes: BATCH_TARGET_BYTES,

  createTables(): string {
    return DDL;
  },

  insertPrefix(table: string, columns: readonly string[]): string {
    return `INSERT OR IGNORE INTO ${table}\n  (${columns.join(', ')}) VALUES`;
  },

  renderRow(values: readonly SqlValue[]): string {
    return `  (${values.map(renderSqlValue).join(', ')})`;
  },

  terminator: ';',
};

// Register the dialect so it can be retrieved by key via getDialect().
registerDialect('d1-sqlite', () => D1SqliteDialect);

export { D1SqliteDialect };
