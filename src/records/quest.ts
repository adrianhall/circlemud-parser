import { RecordType } from '../types.js';
import { MudRecord } from './shared.js';
import type { SourceSpan, Vnum } from '../types.js';

/** Constructor data for `QuestRecord`. */
export interface QuestRecordInit {
  /** Quest VNUM from the `#<vnum>` header. */
  vnum: Vnum;

  /** Quest display name, or `null` when explicitly absent. */
  name: string | null;

  /** Short quest description shown in quest lists, or `null` when absent. */
  description: string | null;

  /** Message displayed when a character accepts the quest. */
  acceptMessage: string | null;

  /** Message displayed when a character completes the quest. */
  completeMessage: string | null;

  /** Message displayed when a character quits the quest. */
  quitMessage: string | null;

  /** Numeric quest type ordinal. */
  questType: number;

  /** Resolved quest type name from quest.c, or `UNKNOWN_<questType>`. */
  questTypeName: string;

  /** Questmaster mobile VNUM, or `null` when the source uses the NOBODY sentinel. */
  questmasterVnum: Vnum | null;

  /** Resolved public quest flag names. */
  questFlags: readonly string[];

  /** Canonical ASCII bitvector representation for quest flags. */
  questFlagsBits: string;

  /** Quest target VNUM. Its entity type depends on `questType`. */
  targetVnum: Vnum | null;

  /** Previous quest VNUM in a quest chain, or `null` when absent. */
  prevQuestVnum: Vnum | null;

  /** Next quest VNUM in a quest chain, or `null` when absent. */
  nextQuestVnum: Vnum | null;

  /** Required prerequisite object VNUM, or `null` when absent. */
  prerequisiteVnum: Vnum | null;

  /** Quest point reward for completion. */
  pointsReward: number;

  /** Quest point penalty for quitting. */
  pointsPenalty: number;

  /** Minimum character level for the quest. */
  minLevel: number;

  /** Maximum character level for the quest. */
  maxLevel: number;

  /** Quest time limit from the source value array. */
  timeLimit: number;

  /** Return mobile VNUM for return-object quests, or `null` when absent. */
  returnMobVnum: Vnum | null;

  /** Quantity tracked by the quest objective. */
  quantity: number;

  /** Gold reward for completion. */
  goldReward: number;

  /** Experience reward for completion. */
  experienceReward: number;

  /** Object reward VNUM, or `null` when the source uses `-1`. */
  objectRewardVnum: Vnum | null;

  /** Source span for the quest record, when available. */
  source?: SourceSpan;
}

/** Parsed quest record from a `.qst` file. */
export class QuestRecord extends MudRecord {
  /** Quest display name, or `null` when explicitly absent. */
  readonly name: string | null;

  /** Short quest description shown in quest lists, or `null` when absent. */
  readonly description: string | null;

  /** Message displayed when a character accepts the quest. */
  readonly acceptMessage: string | null;

  /** Message displayed when a character completes the quest. */
  readonly completeMessage: string | null;

  /** Message displayed when a character quits the quest. */
  readonly quitMessage: string | null;

  /** Numeric quest type ordinal. */
  readonly questType: number;

  /** Resolved quest type name from quest.c, or `UNKNOWN_<questType>`. */
  readonly questTypeName: string;

  /** Questmaster mobile VNUM, or `null` when the source uses the NOBODY sentinel. */
  readonly questmasterVnum: Vnum | null;

  /** Resolved public quest flag names. */
  readonly questFlags: readonly string[];

  /** Canonical ASCII bitvector representation for quest flags. */
  readonly questFlagsBits: string;

  /** Quest target VNUM. Its entity type depends on `questType`. */
  readonly targetVnum: Vnum | null;

  /** Previous quest VNUM in a quest chain, or `null` when absent. */
  readonly prevQuestVnum: Vnum | null;

  /** Next quest VNUM in a quest chain, or `null` when absent. */
  readonly nextQuestVnum: Vnum | null;

  /** Required prerequisite object VNUM, or `null` when absent. */
  readonly prerequisiteVnum: Vnum | null;

  /** Quest point reward for completion. */
  readonly pointsReward: number;

  /** Quest point penalty for quitting. */
  readonly pointsPenalty: number;

  /** Minimum character level for the quest. */
  readonly minLevel: number;

  /** Maximum character level for the quest. */
  readonly maxLevel: number;

  /** Quest time limit from the source value array. */
  readonly timeLimit: number;

  /** Return mobile VNUM for return-object quests, or `null` when absent. */
  readonly returnMobVnum: Vnum | null;

  /** Quantity tracked by the quest objective. */
  readonly quantity: number;

  /** Gold reward for completion. */
  readonly goldReward: number;

  /** Experience reward for completion. */
  readonly experienceReward: number;

  /** Object reward VNUM, or `null` when the source uses `-1`. */
  readonly objectRewardVnum: Vnum | null;

  /**
   * Creates a parsed quest record.
   *
   * @param init - Complete quest record data.
   */
  constructor(init: QuestRecordInit) {
    super(RecordType.Quest, init.vnum, init.source);

    this.name = init.name;
    this.description = init.description;
    this.acceptMessage = init.acceptMessage;
    this.completeMessage = init.completeMessage;
    this.quitMessage = init.quitMessage;
    this.questType = init.questType;
    this.questTypeName = init.questTypeName;
    this.questmasterVnum = init.questmasterVnum;
    this.questFlags = [...init.questFlags];
    this.questFlagsBits = init.questFlagsBits;
    this.targetVnum = init.targetVnum;
    this.prevQuestVnum = init.prevQuestVnum;
    this.nextQuestVnum = init.nextQuestVnum;
    this.prerequisiteVnum = init.prerequisiteVnum;
    this.pointsReward = init.pointsReward;
    this.pointsPenalty = init.pointsPenalty;
    this.minLevel = init.minLevel;
    this.maxLevel = init.maxLevel;
    this.timeLimit = init.timeLimit;
    this.returnMobVnum = init.returnMobVnum;
    this.quantity = init.quantity;
    this.goldReward = init.goldReward;
    this.experienceReward = init.experienceReward;
    this.objectRewardVnum = init.objectRewardVnum;
  }

  /**
   * Serializes the quest record to a stable plain JSON-compatible object.
   *
   * @returns Plain quest record object suitable for `JSON.stringify()`.
   */
  toJSON(): Record<string, unknown> {
    const json: Record<string, unknown> = {
      recordType: this.recordType,
      vnum: this.vnum,
      name: this.name,
      description: this.description,
      acceptMessage: this.acceptMessage,
      completeMessage: this.completeMessage,
      quitMessage: this.quitMessage,
      questType: this.questType,
      questTypeName: this.questTypeName,
      questmasterVnum: this.questmasterVnum,
      questFlags: [...this.questFlags],
      questFlagsBits: this.questFlagsBits,
      targetVnum: this.targetVnum,
      prevQuestVnum: this.prevQuestVnum,
      nextQuestVnum: this.nextQuestVnum,
      prerequisiteVnum: this.prerequisiteVnum,
      pointsReward: this.pointsReward,
      pointsPenalty: this.pointsPenalty,
      minLevel: this.minLevel,
      maxLevel: this.maxLevel,
      timeLimit: this.timeLimit,
      returnMobVnum: this.returnMobVnum,
      quantity: this.quantity,
      goldReward: this.goldReward,
      experienceReward: this.experienceReward,
      objectRewardVnum: this.objectRewardVnum,
    };

    if (this.source !== undefined) {
      json.source = this.source;
    }

    return json;
  }
}
