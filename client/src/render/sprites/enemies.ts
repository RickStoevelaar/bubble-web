import { redShift, sym, withRows } from "./grid";
import type { EnemyName, SpriteDef } from "./names";
import type { EnemyType } from "@bubble/shared";

/*
 * Seven creatures and a wisp.  Most are drawn as a left half and mirrored
 * with sym(); the breather is a full side view facing right.  Every enemy has
 * two walk frames; the angry variant is the same grid with a red-shifted palette.
 */
interface Design {
  palette: Record<string, string>;
  frames: [string[], string[]];
}

const eyes = { E: "#ffffff", P: "#1a1020" };

/** Walker: a rust-shelled beetle with a split carapace and six legs. */
const walkerBase = sym([
  "........",
  "..K.....",
  "...K....",
  "...KKKKK",
  "..KHHHHH",
  "..KHEPHH",
  ".KKSSSSD",
  "KSSsSSSD",
  "KSSSSSSD",
  "KSSSSsSD",
  "KSSSSSSD",
  ".KSSSSSD",
  "..KKKKKK",
  "L.L.L.L.",
  ".L.L.L.L",
  "........",
]);
const walker: Design = {
  palette: { K: "#2a1810", H: "#4b3050", S: "#c8582c", s: "#f2b46d", D: "#2a1810", L: "#2a1810", ...eyes },
  frames: [walkerBase, withRows(walkerBase, { 13: sym([".L.L.L.."])[0]!, 14: sym(["L.L..L.."])[0]! })],
};

/** Chaser: a spiky seed pod with one huge staring eye. */
const chaserA = sym([
  "......S.",
  "....KKKK",
  "..S.KBBB",
  "...KBBBB",
  ".SKBBEEE",
  ".KBBBEPP",
  "SKBBBEEE",
  ".KBBBBBB",
  ".KBBbBBB",
  "SKBBBBBB",
  ".KBBBBbB",
  "..KBBBBB",
  "..S.KKKK",
  "...FF.FF",
  "........",
  "........",
]);
const chaserB = withRows(chaserA, {
  2: sym([".S..KBBB"])[0]!,
  4: sym(["S.KBBEEE"])[0]!,
  9: sym([".SKBBBBB"])[0]!,
  13: sym(["..FF.FF."])[0]!,
});
const chaser: Design = {
  palette: { K: "#2c1a0a", B: "#d99b2b", b: "#a56a14", S: "#f6e0a0", F: "#5a3510", ...eyes },
  frames: [chaserA, chaserB],
};

/** Thrower: a mushroom-capped fellow who lobs things; arms swing up and down. */
const throwerA = sym([
  "........",
  ".....CCC",
  "...CCCCC",
  "..CCsCCC",
  ".CCCCCsC",
  ".CsCCCCC",
  "CCCCCCCC",
  "KKKKKKKK",
  "..KSSSSS",
  "A.SEPSSS",
  "AASSSSSm",
  ".KSSSSSS",
  "..KSSSSS",
  "..FFF...",
  "..FFF...",
  "........",
]);
const throwerB = withRows(throwerA, {
  9: sym(["AASEPSSS"])[0]!,
  10: sym([".ASSSSSm"])[0]!,
});
const thrower: Design = {
  palette: { C: "#c2387a", s: "#ffd9ea", K: "#3a1230", S: "#f0dab6", A: "#f0dab6", m: "#8a2a3a", F: "#6b3a2a", ...eyes },
  frames: [throwerA, throwerB],
};

/** Breather: a lantern-fish that puffs fire; faces right, lure dangling over its jaws. */
const breatherA = [
  "..........YY....",
  ".........YYYY...",
  "..........KK....",
  ".........K......",
  "....KKKKKKK.....",
  "..K.KBBBBBBK....",
  ".KKKBBBBEPBBK...",
  "KBBKBBBBBBBBBK..",
  "KBBBBBsBBBBKKKK.",
  "KBBBBBBBBBKTTTTK",
  "KBBKBBBBBBKKKKK.",
  ".KKKBsBBBBBK....",
  "..K.KBBBBBK.....",
  "....KKFFKKK.....",
  ".....F..F.......",
  "................",
];
const breatherB = withRows(breatherA, {
  0: "...........YY...",
  1: "..........YYYY..",
  2: "...........KK...",
  3: "..........K.....",
  13: "....KKKFFKK.....",
  14: "......F.F.......",
});
const breather: Design = {
  palette: { K: "#0e2540", B: "#3d86c6", s: "#8ec5f0", Y: "#ffe27a", T: "#ff8a3d", F: "#2b5c93", ...eyes },
  frames: [breatherA, breatherB],
};

/** Bouncer: a head on a coil spring; frame 0 stretched, frame 1 squashed. */
const bouncerA = sym([
  "........",
  "..KKKKKK",
  ".KHHHHHH",
  ".KHEPHHH",
  ".KHHHmmm",
  "..KKKKKK",
  "..CCCCCC",
  "...ccccc",
  "..CCCCCC",
  "...ccccc",
  "..CCCCCC",
  "...ccccc",
  "..KKKKKK",
  ".KFFFFFF",
  "........",
  "........",
]);
const bouncerB = sym([
  "........",
  "........",
  "........",
  "........",
  "..KKKKKK",
  ".KHHHHHH",
  ".KHEPHHH",
  ".KHHHmmm",
  "..KKKKKK",
  ".CCCCCCC",
  "..cccccc",
  ".CCCCCCC",
  ".KKKKKKK",
  "KFFFFFFF",
  "........",
  "........",
]);
const bouncer: Design = {
  palette: { K: "#25203a", H: "#9a6bd0", m: "#e8d0ff", C: "#c9ced8", c: "#7c8294", F: "#4a4560", ...eyes },
  frames: [bouncerA, bouncerB],
};

/** Flyer: a moth with big dusty wings; wings up, then down. */
const flyerA = sym([
  "......K.",
  ".W...K..",
  "WWW.KKKK",
  "WwWWKHHE",
  "WwwWWKBP",
  "WWwWWKBB",
  ".WWWWKBB",
  "..WWW.KB",
  "......KB",
  ".......K",
  "........",
  "........",
  "........",
  "........",
  "........",
  "........",
]);
const flyerB = sym([
  "......K.",
  ".....K..",
  "....KKKK",
  "....KHHE",
  "....KKBP",
  "..WWWKBB",
  ".WwwWWKB",
  "WwwwWWKB",
  "WWwWWW.K",
  ".WWWW...",
  "..WW....",
  "........",
  "........",
  "........",
  "........",
  "........",
]);
const flyer: Design = {
  palette: { K: "#2e2018", W: "#e9cfa0", w: "#b98a5a", H: "#8a6a50", B: "#5c4636", ...eyes },
  frames: [flyerA, flyerB],
};

/** Boss: a big armoured crab with raised claws and eyes on stalks. */
const bossA = sym([
  "CC....EP",
  "CCC...KK",
  "CKC.KKKK",
  ".CCKAAAA",
  "..KAAaaA",
  "..KARAAA",
  ".KAAAAAA",
  "KAAaaAAA",
  "KAAAAARA",
  "KAAAAAAA",
  ".KAAAAAA",
  "..KKKKKK",
  ".L.L.L.L",
  "L..L.L..",
  "........",
  "........",
]);
const bossB = withRows(bossA, {
  0: sym(["........"])[0]!,
  1: sym(["CC....EP"])[0]!,
  2: sym(["CCC...KK"])[0]!,
  3: sym(["CKC.KKKK"])[0]!,
  4: sym([".CCKAaaA"])[0]!,
  12: sym(["L.L.L.L."])[0]!,
  13: sym([".L.L.L.L"])[0]!,
});
const boss: Design = {
  palette: { K: "#2a1020", C: "#e0583a", A: "#8a3a52", a: "#b8607a", R: "#f2d36b", L: "#4a1c30", ...eyes },
  frames: [bossA, bossB],
};

/** Hurry wisp: a pale ghost-flame with hollow eyes and a ragged tail. */
const wispA = sym([
  "........",
  ".....WWW",
  "...WWWWW",
  "..WWKKWW",
  "..WWKKWW",
  "..WWWWWW",
  "..WWWKKK",
  "...WWWWW",
  "...vWWWW",
  "....vWWW",
  "....vvWW",
  ".....vvW",
  "......vv",
  "......v.",
  "........",
  "........",
]);
const wispB = withRows(wispA, {
  8: sym(["...WWWWv"])[0]!,
  9: sym(["....WWWv"])[0]!,
  10: sym(["....WWvv"])[0]!,
  11: sym([".....Wvv"])[0]!,
  12: sym(["......vv"])[0]!,
  13: sym([".......v"])[0]!,
});
const hurry: Design = {
  palette: { K: "#1c1244", W: "#e2f6ff", v: "#7ab2e6" },
  frames: [wispA, wispB],
};

const DESIGNS: Record<EnemyType, Design> = { walker, chaser, thrower, breather, bouncer, flyer, boss, hurry };

export function enemyDefs(): Record<EnemyName, SpriteDef> {
  const out = {} as Record<EnemyName, SpriteDef>;
  for (const [type, d] of Object.entries(DESIGNS) as [EnemyType, Design][]) {
    out[`enemy_${type}`] = { cls: "char", palette: d.palette, frames: [d.frames[0], d.frames[1]] };
    const angry: Record<string, string> = {};
    for (const [ch, col] of Object.entries(d.palette)) angry[ch] = ch === "E" || ch === "P" ? col : redShift(col);
    out[`enemy_${type}_angry`] = { cls: "char", palette: angry, frames: [d.frames[0], d.frames[1]] };
  }
  return out;
}
