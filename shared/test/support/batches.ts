/**
 * The one registry of level batches. Every batch-dependent test (data checks, hash pins, per-level lint, sim
 * smoke, fairness) is driven from here, so a later batch (51-75, 76-99) adds ONE entry below plus one-line test
 * files (see tools/test/gen-levels-batch-*.test.ts and shared/test/levels-{lint,smoke}-*.test.ts); no existing
 * test is edited. Pure data: safe to import from the tools package tests too.
 */
export interface Batch {
  name: string;
  /** First and last round of the batch, inclusive. */
  from: number;
  to: number;
  /** sha256 of JSON.stringify(levels.slice(from - 1, to)) of the committed levels.json: a finished batch never changes. */
  sha256: string;
  /** Templates this batch introduced (explicit; never derived from registry insertion order). */
  freshTemplates: string[];
  /** At least this many distinct templates are used in the batch, and at least `freshUsed` of the fresh ones. */
  distinctTemplates: number;
  freshUsed: number;
  /** Rounds that must be hand-drawn, and the minimum count of hand-drawn rounds overall. */
  handRounds: number[];
  handMin: number;
  enemyCount: { min: number; max: number; startAvg: [number, number]; endAvg: [number, number] };
  /** Milestone rounds whose enemy count must lie in `milestone`. */
  milestones?: { rounds: number[]; count: [number, number] };
  /** Minimum distinct types in every round, and minimum number of rounds each type must appear in. */
  typesPerRound?: number;
  typeRounds?: number;
  /** Tough types (thrower, breather, bouncer, flyer) share: first `early` rounds below the last `late`, which reach `lateMin`. */
  toughShift?: { early: number; late: number; lateMin: number };
  /** Rounds with 2-3 distinct spawn delays, each wave holding at least 2 enemies. */
  waves?: number;
  /** Most distinct spawn delays a wave round may use (default 3; rounds 51-75 allow 4). */
  maxWaveCount?: number;
  flags?: { noFlag: number; perFlag: [number, number]; singleBefore: number; twoFlagFrom: number; twoFlagMin: number };
  /** Rounds with drift of at least `cells` cells. */
  drift: { rounds: number; cells: number };
  /** Rounds checked by the fairness tests (7-tile clearance, same-type platform runs, lanes). */
  fairness: boolean;
}

export const BATCHES: Batch[] = [
  {
    name: "rounds 1-25",
    from: 1,
    to: 25,
    sha256: "07978ca81d4970c973421171325bb8ece11dc356a793e9e340cc9a12454e4d69",
    freshTemplates: ["tiers", "stairs", "zigzag", "islands", "towers", "keep", "bowl", "decker", "lattice", "waves", "pyramid", "brick", "comb", "scatter", "tunnel", "ring"],
    distinctTemplates: 10,
    freshUsed: 10,
    handRounds: [12, 19, 25],
    handMin: 3,
    enemyCount: { min: 2, max: 10, startAvg: [2, 5], endAvg: [7.5, 10] },
    drift: { rounds: 2, cells: 1 },
    fairness: false,
  },
  {
    name: "rounds 26-50",
    from: 26,
    to: 50,
    sha256: "71a2d06d3a8a2aa034f98bda93b8b7310e43b79f5ed1abb0cdeb4562b3ed363c",
    freshTemplates: ["shafts", "moat", "diamond", "nests", "rails", "slashes"],
    distinctTemplates: 12,
    freshUsed: 6,
    handRounds: [30, 40, 50],
    handMin: 4,
    enemyCount: { min: 7, max: 12, startAvg: [7.5, 9], endAvg: [10, 11.5] },
    milestones: { rounds: [30, 40, 50], count: [10, 11] },
    typesPerRound: 3,
    typeRounds: 8,
    toughShift: { early: 8, late: 8, lateMin: 0.55 },
    waves: 8,
    flags: { noFlag: 8, perFlag: [3, 7], singleBefore: 31, twoFlagFrom: 31, twoFlagMin: 6 },
    drift: { rounds: 4, cells: 8 },
    fairness: true,
  },
  {
    name: "rounds 51-75",
    from: 51,
    to: 75,
    sha256: "faf8d77842a83f62f83c4fedf91dea5b2a7ed2d966c7822c8f7a849b06563c2d",
    freshTemplates: ["hooks", "courtyard", "spiral", "lanterns", "bridges", "canyon", "chambers"],
    distinctTemplates: 14,
    freshUsed: 6,
    handRounds: [60, 70, 75],
    handMin: 4,
    enemyCount: { min: 9, max: 12, startAvg: [9, 10.2], endAvg: [11, 12] },
    milestones: { rounds: [60, 70, 75], count: [11, 12] },
    typesPerRound: 4,
    typeRounds: 15,
    toughShift: { early: 8, late: 8, lateMin: 0.6 },
    waves: 12,
    maxWaveCount: 4,
    flags: { noFlag: 6, perFlag: [4, 8], singleBefore: 56, twoFlagFrom: 56, twoFlagMin: 8 },
    drift: { rounds: 5, cells: 8 },
    fairness: true,
  },
];

/** Secret-door rounds (every 10th round from 20): the door tests run on these. */
export const DOOR_ROUNDS = [20, 30, 40];
