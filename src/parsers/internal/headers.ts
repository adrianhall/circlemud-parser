import { skipMudSpaces } from '../../reader.js';
import type { Vnum } from '../../types.js';
import type { ParserContext } from './context.js';
import { emitWarning, fail } from './diagnostics.js';
import type { SourceLine } from './source.js';
import { sourceForLine } from './source.js';
import { parseTokenInteger } from './tokens.js';

/** Parses a `#<vnum>` record header line. */
export function parseRecordHeader(
  text: string,
  context: ParserContext,
  line: SourceLine,
  label: string = context.recordType,
): Vnum {
  const headerMatch = /^#([+-]?\d+)\s*$/.exec(text);
  const source = sourceForLine(context, line.startLine);

  if (headerMatch === null) {
    fail(`Expected ${label} record header`, context, source);
  }

  const vnum = parseTokenInteger(headerMatch[1]);

  if (vnum === null) {
    fail(`Expected numeric ${label} vnum`, context, source);
  }

  return vnum;
}

/** Parses one `T <vnum>` DG trigger attachment line. */
export function parseTriggerAttachmentLine(
  text: string,
  context: ParserContext,
  line: SourceLine,
  vnum: Vnum,
  recordLabel: string = context.recordType,
): Vnum | null {
  const trimmed = skipMudSpaces(text);
  const match = /^T\s+([+-]?\d+)/.exec(trimmed);

  if (match === null) {
    emitWarning(
      `Skipping malformed ${recordLabel} trigger line '${trimmed}'`,
      context,
      sourceForLine(context, line.startLine),
      vnum,
    );
    return null;
  }

  const triggerVnum = parseTokenInteger(match[1]);

  if (triggerVnum === null) {
    emitWarning(
      `Skipping malformed ${recordLabel} trigger line '${trimmed}'`,
      context,
      sourceForLine(context, line.startLine),
      vnum,
    );
    return null;
  }

  return triggerVnum;
}
