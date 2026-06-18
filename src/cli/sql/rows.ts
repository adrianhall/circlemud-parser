/**
 * Dialect-independent mapping of parsed MUD records to SQL row tuples.
 *
 * This module is responsible for:
 *   - Deriving `zone_vnum` for every top-level record from the set of parsed zones.
 *   - Converting each record's typed fields into ordered `SqlValue[]` arrays
 *     that match the column lists defined in the D1 SQLite dialect DDL.
 *   - Resolving ordinals to names, encoding flag arrays as JSON, collapsing
 *     `DiceRoll` objects to dice strings, and normalising `SourceSpan` to a
 *     single `"<relativePath>#<startLine>"` string.
 *   - Minting per-child-row ULID primary keys via the injected factory.
 *
 * No SQL syntax is produced here; all output is `SqlValue` arrays that the
 * dialect layer renders into literals.
 */

import { posix, relative } from 'node:path';

import { DIRECTIONS, GENDERS, POSITION_TYPES, SECTOR_TYPES } from '../../flag-tables.js';
import { resolveOrdinalName } from '../../flags.js';
import type { MobileRecord } from '../../records/mobile.js';
import type { ObjectRecord } from '../../records/object.js';
import type { QuestRecord } from '../../records/quest.js';
import type { ShopRecord } from '../../records/shop.js';
import type { TriggerRecord } from '../../records/trigger.js';
import type { WorldRecord } from '../../records/world.js';
import type { ZoneRecord } from '../../records/zone.js';
import type { SourceSpan, Vnum } from '../../types.js';
import type { SqlValue } from './dialect.js';

// ---------------------------------------------------------------------------
// Emit context
// ---------------------------------------------------------------------------

/** Zone range used for ownership derivation. */
export interface ZoneRange {
  vnum: Vnum;
  bottom: Vnum;
  top: Vnum;
}

/**
 * Context passed into all row-mapping functions.
 *
 * `ulid` is injected so tests can supply a deterministic factory instead of
 * calling the real ulidx implementation.
 */
export interface EmitContext {
  /** Sorted zone ranges used for ownership derivation. */
  readonly zones: readonly ZoneRange[];

  /**
   * Absolute path of the input root directory (or basename stub for single-file
   * input).  Used to compute POSIX-relative source paths.
   */
  readonly inputRoot: string;

  /** ULID factory — called once per owned child row. */
  readonly ulid: () => string;

  /** Warning sink for non-fatal issues (e.g. unmatched zone). */
  readonly warn: (message: string) => void;
}

// ---------------------------------------------------------------------------
// Named table tuple
// ---------------------------------------------------------------------------

/** A table name paired with column list and ordered rows. */
export interface TableRows {
  readonly table: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly SqlValue[])[];
}

// ---------------------------------------------------------------------------
// Zone ownership derivation
// ---------------------------------------------------------------------------

/**
 * Returns the VNUM of the zone that owns `vnum`, or `null` when no zone's
 * `[bottom, top]` range contains it.
 *
 * On overlap (two zones both contain the VNUM) the one with the smallest
 * `top` is selected (tie-break by most-specific upper boundary).
 */
export function deriveZoneVnum(vnum: Vnum, zones: readonly ZoneRange[]): Vnum | null {
  let best: ZoneRange | null = null;

  for (const zone of zones) {
    if (vnum >= zone.bottom && vnum <= zone.top) {
      if (best === null || zone.top < best.top) {
        best = zone;
      }
    }
  }

  return best ? best.vnum : null;
}

// ---------------------------------------------------------------------------
// Source-span helpers
// ---------------------------------------------------------------------------

/**
 * Converts a `SourceSpan` to the canonical single-string form
 * `"<relativePath>#<startLine>"` used in `source` columns.
 *
 * `relativePath` is computed relative to `inputRoot` and normalised to POSIX
 * separators.  When `source.fileName` is absent or the relative path cannot
 * be computed, returns `null` (maps to SQL `NULL`).
 */
export function formatSource(source: SourceSpan | undefined, inputRoot: string): string | null {
  if (!source) return null;
  const fileName = source.fileName;
  if (!fileName) return null;

  // Compute relative path from inputRoot and normalise to POSIX separators.
  const rel = relative(inputRoot, fileName);
  const posixRel = rel.split('\\').join(posix.sep); // normalise Windows separators

  return `${posixRel}#${source.startLine}`;
}

// ---------------------------------------------------------------------------
// DiceRoll serialisation
// ---------------------------------------------------------------------------

/**
 * Serialises a `DiceRoll` to the canonical D&D dice string:
 *   `"<count>d<sides>"` with a signed bonus term only when non-zero.
 *
 * Examples: `{count:10, sides:6, bonus:4}` → `"10d6+4"`,
 *           `{count:2, sides:8, bonus:0}`  → `"2d8"`,
 *           `{count:1, sides:4, bonus:-1}` → `"1d4-1"`.
 */
export function formatDice(dice: { count: number; sides: number; bonus: number }): string {
  const base = `${dice.count}d${dice.sides}`;
  if (dice.bonus === 0) return base;
  return dice.bonus > 0 ? `${base}+${dice.bonus}` : `${base}${dice.bonus}`;
}

// ---------------------------------------------------------------------------
// JSON helpers
// ---------------------------------------------------------------------------

/** Encodes an array as a compact JSON string for a TEXT column. */
function jsonArr(arr: readonly unknown[]): string {
  return JSON.stringify(arr);
}

// ---------------------------------------------------------------------------
// Zone rows
// ---------------------------------------------------------------------------

const ZONE_COLUMNS = [
  'vnum',
  'name',
  'bottom',
  'top',
  'lifespan',
  'reset_mode',
  'min_level',
  'max_level',
  'source',
] as const;

const ZONE_COMMAND_COLUMNS = [
  'id',
  'zone_vnum',
  'ordinal',
  'command',
  'if_flag',
  'args',
  'string_args',
  'comment',
  'source',
] as const;

export function zoneToTableRows(record: ZoneRecord, ctx: EmitContext): TableRows[] {
  const src = formatSource(record.source, ctx.inputRoot);

  const zoneRow: SqlValue[] = [
    record.vnum,
    record.name,
    record.bottom,
    record.top,
    record.lifespan,
    record.resetMode,
    record.minLevel ?? null,
    record.maxLevel ?? null,
    src,
  ];

  const cmdRows: (readonly SqlValue[])[] = record.commands.map((cmd, i) => {
    const cmdSrc = formatSource(cmd.source, ctx.inputRoot);
    return [
      ctx.ulid(),
      record.vnum,
      i,
      cmd.command,
      cmd.ifFlag,
      jsonArr(cmd.args),
      jsonArr(cmd.stringArgs),
      cmd.comment ?? null,
      cmdSrc,
    ];
  });

  const tables: TableRows[] = [{ table: 'zones', columns: ZONE_COLUMNS, rows: [zoneRow] }];
  if (cmdRows.length > 0) {
    tables.push({ table: 'zone_commands', columns: ZONE_COMMAND_COLUMNS, rows: cmdRows });
  }
  return tables;
}

// ---------------------------------------------------------------------------
// Room rows
// ---------------------------------------------------------------------------

const ROOM_COLUMNS = [
  'vnum',
  'zone_vnum',
  'name',
  'description',
  'room_flags',
  'sector_type',
  'trigger_vnums',
  'source',
] as const;

const ROOM_EXIT_COLUMNS = [
  'id',
  'room_vnum',
  'direction',
  'description',
  'keywords',
  'exit_flags',
  'key_vnum',
  'to_room_vnum',
] as const;

const ROOM_XDESC_COLUMNS = ['id', 'room_vnum', 'ordinal', 'keywords', 'description'] as const;

export function worldToTableRows(record: WorldRecord, ctx: EmitContext): TableRows[] {
  const zoneVnum = deriveZoneVnum(record.vnum, ctx.zones);
  if (zoneVnum === null) {
    ctx.warn(`Room ${record.vnum}: no owning zone found in converted set; zone_vnum will be NULL.`);
  }

  const src = formatSource(record.source, ctx.inputRoot);
  const sectorName = resolveOrdinalName(record.sectorType, SECTOR_TYPES);

  const roomRow: SqlValue[] = [
    record.vnum,
    zoneVnum,
    record.name,
    record.description,
    jsonArr(record.roomFlags),
    sectorName,
    jsonArr(record.triggerVnums),
    src,
  ];

  const exitRows: (readonly SqlValue[])[] = record.directions.map((dir) => {
    const dirName = resolveOrdinalName(dir.direction, DIRECTIONS);
    return [
      ctx.ulid(),
      record.vnum,
      dirName,
      dir.description,
      jsonArr(dir.keywords),
      jsonArr(dir.exitFlags),
      dir.keyVnum,
      dir.toRoomVnum,
    ];
  });

  const xdescRows: (readonly SqlValue[])[] = record.extraDescriptions.map((xd, i) => [
    ctx.ulid(),
    record.vnum,
    i,
    jsonArr(xd.keywords),
    xd.description,
  ]);

  const tables: TableRows[] = [{ table: 'rooms', columns: ROOM_COLUMNS, rows: [roomRow] }];
  if (exitRows.length > 0) {
    tables.push({ table: 'room_exits', columns: ROOM_EXIT_COLUMNS, rows: exitRows });
  }
  if (xdescRows.length > 0) {
    tables.push({
      table: 'room_extra_descriptions',
      columns: ROOM_XDESC_COLUMNS,
      rows: xdescRows,
    });
  }
  return tables;
}

// ---------------------------------------------------------------------------
// Object rows
// ---------------------------------------------------------------------------

const OBJECT_COLUMNS = [
  'vnum',
  'zone_vnum',
  'aliases',
  'short_description',
  'description',
  'action_description',
  'object_type',
  'extra_flags',
  'wear_flags',
  'affect_flags',
  'object_values',
  'weight',
  'cost',
  'rent',
  'level',
  'timer',
  'trigger_vnums',
  'source',
] as const;

const OBJECT_XDESC_COLUMNS = ['id', 'object_vnum', 'ordinal', 'keywords', 'description'] as const;

const OBJECT_AFFECT_COLUMNS = ['id', 'object_vnum', 'ordinal', 'location', 'modifier'] as const;

export function objectToTableRows(record: ObjectRecord, ctx: EmitContext): TableRows[] {
  const zoneVnum = deriveZoneVnum(record.vnum, ctx.zones);
  if (zoneVnum === null) {
    ctx.warn(
      `Object ${record.vnum}: no owning zone found in converted set; zone_vnum will be NULL.`,
    );
  }

  const src = formatSource(record.source, ctx.inputRoot);

  const objRow: SqlValue[] = [
    record.vnum,
    zoneVnum,
    jsonArr(record.aliases),
    record.shortDescription,
    record.description,
    record.actionDescription,
    record.objectTypeName,
    jsonArr(record.extraFlags),
    jsonArr(record.wearFlags),
    jsonArr(record.affectFlags),
    jsonArr([...record.values]),
    record.weight,
    record.cost,
    record.rent,
    record.level,
    record.timer,
    jsonArr(record.triggerVnums),
    src,
  ];

  const xdescRows: (readonly SqlValue[])[] = record.extraDescriptions.map((xd, i) => [
    ctx.ulid(),
    record.vnum,
    i,
    jsonArr(xd.keywords),
    xd.description,
  ]);

  const affectRows: (readonly SqlValue[])[] = record.affects.map((aff, i) => [
    ctx.ulid(),
    record.vnum,
    i,
    aff.locationName,
    aff.modifier,
  ]);

  const tables: TableRows[] = [{ table: 'objects', columns: OBJECT_COLUMNS, rows: [objRow] }];
  if (xdescRows.length > 0) {
    tables.push({
      table: 'object_extra_descriptions',
      columns: OBJECT_XDESC_COLUMNS,
      rows: xdescRows,
    });
  }
  if (affectRows.length > 0) {
    tables.push({ table: 'object_affects', columns: OBJECT_AFFECT_COLUMNS, rows: affectRows });
  }
  return tables;
}

// ---------------------------------------------------------------------------
// Mobile rows
// ---------------------------------------------------------------------------

const MOBILE_COLUMNS = [
  'vnum',
  'zone_vnum',
  'aliases',
  'short_description',
  'long_description',
  'description',
  'action_flags',
  'affect_flags',
  'alignment',
  'kind',
  'level',
  'hitroll',
  'armor_class',
  'hit_dice',
  'damage_dice',
  'gold',
  'experience',
  'position',
  'default_position',
  'sex',
  'bare_hand_attack',
  'strength',
  'strength_add',
  'intelligence',
  'wisdom',
  'dexterity',
  'constitution',
  'charisma',
  'saving_para',
  'saving_rod',
  'saving_petri',
  'saving_breath',
  'saving_spell',
  'trigger_vnums',
  'source',
] as const;

export function mobileToTableRows(record: MobileRecord, ctx: EmitContext): TableRows[] {
  const zoneVnum = deriveZoneVnum(record.vnum, ctx.zones);
  if (zoneVnum === null) {
    ctx.warn(
      `Mobile ${record.vnum}: no owning zone found in converted set; zone_vnum will be NULL.`,
    );
  }

  const src = formatSource(record.source, ctx.inputRoot);
  const s = record.stats;
  const e = record.enhanced;

  const row: SqlValue[] = [
    record.vnum,
    zoneVnum,
    jsonArr(record.aliases),
    record.shortDescription,
    record.longDescription,
    record.description,
    jsonArr(record.actionFlags),
    jsonArr(record.affectFlags),
    record.alignment,
    record.kind,
    s.level,
    s.hitroll,
    s.armorClass,
    formatDice(s.hitDice),
    formatDice(s.damageDice),
    s.gold,
    s.experience,
    resolveOrdinalName(s.position, POSITION_TYPES),
    resolveOrdinalName(s.defaultPosition, POSITION_TYPES),
    resolveOrdinalName(s.sex, GENDERS),
    e?.bareHandAttack ?? null,
    e?.str ?? null,
    e?.strAdd ?? null,
    e?.int ?? null,
    e?.wis ?? null,
    e?.dex ?? null,
    e?.con ?? null,
    e?.cha ?? null,
    e?.savingPara ?? null,
    e?.savingRod ?? null,
    e?.savingPetri ?? null,
    e?.savingBreath ?? null,
    e?.savingSpell ?? null,
    jsonArr(record.triggerVnums),
    src,
  ];

  return [{ table: 'mobiles', columns: MOBILE_COLUMNS, rows: [row] }];
}

// ---------------------------------------------------------------------------
// Shop rows
// ---------------------------------------------------------------------------

const SHOP_COLUMNS = [
  'vnum',
  'zone_vnum',
  'product_vnums',
  'buy_profit',
  'sell_profit',
  'no_such_item_keeper',
  'no_such_item_player',
  'do_not_buy',
  'missing_cash_keeper',
  'missing_cash_player',
  'message_buy',
  'message_sell',
  'temper',
  'shop_flags',
  'keeper_vnum',
  'no_trade_flags',
  'room_vnums',
  'open1',
  'close1',
  'open2',
  'close2',
  'source',
] as const;

const SHOP_BUY_TYPE_COLUMNS = ['id', 'shop_vnum', 'ordinal', 'item_type', 'expression'] as const;

export function shopToTableRows(record: ShopRecord, ctx: EmitContext): TableRows[] {
  const zoneVnum = deriveZoneVnum(record.vnum, ctx.zones);
  if (zoneVnum === null) {
    ctx.warn(`Shop ${record.vnum}: no owning zone found in converted set; zone_vnum will be NULL.`);
  }

  const src = formatSource(record.source, ctx.inputRoot);

  const shopRow: SqlValue[] = [
    record.vnum,
    zoneVnum,
    jsonArr(record.productVnums),
    record.buyProfit,
    record.sellProfit,
    record.noSuchItemKeeper,
    record.noSuchItemPlayer,
    record.doNotBuy,
    record.missingCashKeeper,
    record.missingCashPlayer,
    record.messageBuy,
    record.messageSell,
    record.temper,
    jsonArr(record.shopFlags),
    record.keeperVnum,
    jsonArr(record.noTradeFlags),
    jsonArr(record.roomVnums),
    record.open1,
    record.close1,
    record.open2,
    record.close2,
    src,
  ];

  const buyTypeRows: (readonly SqlValue[])[] = record.buyTypes.map((bt, i) => [
    ctx.ulid(),
    record.vnum,
    i,
    bt.itemTypeName,
    bt.expression,
  ]);

  const tables: TableRows[] = [{ table: 'shops', columns: SHOP_COLUMNS, rows: [shopRow] }];
  if (buyTypeRows.length > 0) {
    tables.push({ table: 'shop_buy_types', columns: SHOP_BUY_TYPE_COLUMNS, rows: buyTypeRows });
  }
  return tables;
}

// ---------------------------------------------------------------------------
// Trigger rows
// ---------------------------------------------------------------------------

const TRIGGER_COLUMNS = [
  'vnum',
  'zone_vnum',
  'name',
  'attach_type',
  'trigger_types',
  'numeric_arg',
  'arg_list',
  'commands',
  'source',
] as const;

export function triggerToTableRows(record: TriggerRecord, ctx: EmitContext): TableRows[] {
  const zoneVnum = deriveZoneVnum(record.vnum, ctx.zones);
  if (zoneVnum === null) {
    ctx.warn(
      `Trigger ${record.vnum}: no owning zone found in converted set; zone_vnum will be NULL.`,
    );
  }

  const src = formatSource(record.source, ctx.inputRoot);

  const row: SqlValue[] = [
    record.vnum,
    zoneVnum,
    record.name,
    record.attachTypeName,
    jsonArr(record.triggerType),
    record.numericArg,
    record.argList,
    jsonArr(record.commands),
    src,
  ];

  return [{ table: 'triggers', columns: TRIGGER_COLUMNS, rows: [row] }];
}

// ---------------------------------------------------------------------------
// Quest rows
// ---------------------------------------------------------------------------

const QUEST_COLUMNS = [
  'vnum',
  'zone_vnum',
  'name',
  'description',
  'accept_message',
  'complete_message',
  'quit_message',
  'quest_type',
  'questmaster_vnum',
  'quest_flags',
  'target_vnum',
  'prev_quest_vnum',
  'next_quest_vnum',
  'prerequisite_vnum',
  'points_reward',
  'points_penalty',
  'min_level',
  'max_level',
  'time_limit',
  'return_mob_vnum',
  'quantity',
  'gold_reward',
  'experience_reward',
  'object_reward_vnum',
  'source',
] as const;

export function questToTableRows(record: QuestRecord, ctx: EmitContext): TableRows[] {
  const zoneVnum = deriveZoneVnum(record.vnum, ctx.zones);
  if (zoneVnum === null) {
    ctx.warn(
      `Quest ${record.vnum}: no owning zone found in converted set; zone_vnum will be NULL.`,
    );
  }

  const src = formatSource(record.source, ctx.inputRoot);

  const row: SqlValue[] = [
    record.vnum,
    zoneVnum,
    record.name,
    record.description,
    record.acceptMessage,
    record.completeMessage,
    record.quitMessage,
    record.questTypeName,
    record.questmasterVnum,
    jsonArr(record.questFlags),
    record.targetVnum,
    record.prevQuestVnum,
    record.nextQuestVnum,
    record.prerequisiteVnum,
    record.pointsReward,
    record.pointsPenalty,
    record.minLevel,
    record.maxLevel,
    record.timeLimit,
    record.returnMobVnum,
    record.quantity,
    record.goldReward,
    record.experienceReward,
    record.objectRewardVnum,
    src,
  ];

  return [{ table: 'quests', columns: QUEST_COLUMNS, rows: [row] }];
}
