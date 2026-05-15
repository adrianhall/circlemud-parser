import { extname } from 'node:path';

import { UnsupportedRecordTypeError } from '../errors.js';
import { type ParseOptions } from '../options.js';
import { RecordType } from '../types.js';
import { parseMobileFile } from './mobile.js';
import { parseObjectFile } from './object.js';
import { parseQuestFile } from './quest.js';
import { parseShopFile } from './shop.js';
import { parseTriggerFile } from './trigger.js';
import { parseWorldFile } from './world.js';
import { parseZoneFile } from './zone.js';
import type { MudRecord } from '../records/index.js';
import type { MudRecordOf } from '../types.js';

const RECORD_TYPES_BY_EXTENSION: Readonly<Record<string, RecordType>> = {
  '.mob': RecordType.Mobile,
  '.obj': RecordType.Object,
  '.wld': RecordType.World,
  '.zon': RecordType.Zone,
  '.shp': RecordType.Shop,
  '.qst': RecordType.Quest,
  '.trg': RecordType.Trigger,
};

/** Infers a supported MUD record type from a standard world file extension. */
export function inferRecordType(fileName: string): RecordType | undefined {
  return RECORD_TYPES_BY_EXTENSION[extname(fileName).toLowerCase()];
}

/** Parses a supported MUD file by inferring its record type from the file extension. */
export function parseFile(fileName: string): MudRecord[];

/** Parses a supported MUD file by inferring its record type from the file extension. */
export function parseFile(fileName: string, options: ParseOptions): MudRecord[];

/** Parses a supported MUD file as an explicitly supplied record type. */
export function parseFile<T extends RecordType>(
  fileName: string,
  fileType: T,
  options?: ParseOptions,
): Array<MudRecordOf<T>>;

/**
 * Parses a supported CircleMUD/tbaMUD world file from disk.
 *
 * If `fileType` is supplied it wins over extension inference. Otherwise the type is inferred from
 * the standard world file extension and unsupported extensions throw `UnsupportedRecordTypeError`.
 */
export function parseFile(
  fileName: string,
  fileTypeOrOptions?: RecordType | ParseOptions,
  maybeOptions: ParseOptions = {},
): MudRecord[] {
  const fileType =
    typeof fileTypeOrOptions === 'string' ? fileTypeOrOptions : inferRecordType(fileName);
  const options = typeof fileTypeOrOptions === 'string' ? maybeOptions : (fileTypeOrOptions ?? {});

  if (fileType === undefined) {
    throw new UnsupportedRecordTypeError(fileName);
  }

  switch (fileType) {
    case RecordType.Mobile:
      return parseMobileFile(fileName, options);
    case RecordType.Object:
      return parseObjectFile(fileName, options);
    case RecordType.World:
      return parseWorldFile(fileName, options);
    case RecordType.Zone:
      return parseZoneFile(fileName, options);
    case RecordType.Shop:
      return parseShopFile(fileName, options);
    case RecordType.Quest:
      return parseQuestFile(fileName, options);
    case RecordType.Trigger:
      return parseTriggerFile(fileName, options);
  }
}
