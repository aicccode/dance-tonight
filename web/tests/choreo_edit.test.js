import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CHUNK_BEATS, MAX_MOVES, chunkSequence, cleanRoutine, forkRoutine, insertAt, mirrorSeq, moveItem,
  newRoutine, removeIndex, seqBeats, suggestBpm, upgradeRoutine, withParts,
} from "../js/core/choreo_edit.js";
import { clipBeats, clipMoveDefs, isClipMove, wholeClipId } from "../js/core/clipmoves.js";
import { ROUTINES, generateDanceChart, routineMoves, segmentNotes, sequenceChart, validateRoutine } from "../js/core/dance.js";
import { DANCE_MET, DANCE_MOVES, DANCE_NAMES, completeGuided, moveHold, registerClipMoves } from "../js/dance/dancemoves.js";

const FOUR = Object.keys(DANCE_MOVES).find((m) => DANCE_MOVES[m].beats === 4); // e.g. turn_l
const song = (bpm = 120, n = 200) => {
  const iv = 60 / bpm;
  const beats = Array.from({ length: n }, (_, i) => Math.round((2 + i * iv) * 1000) / 1000);
  return { beats, downbeats: beats.filter((_, i) => i % 4 === 0), duration: 2 + n * iv + 3, tempo: bpm };
};

test("sequence editing keeps order and never mutates", () => {
  const a = ["clap", "heart"];
  assert.deepEqual(insertAt(a, 1, FOUR), ["clap", FOUR, "heart"]);
  assert.deepEqual(insertAt(a, 99, "dab_l"), ["clap", "heart", "dab_l"]);
  assert.deepEqual(insertAt([], 0, "clap"), ["clap"]);
  assert.deepEqual(removeIndex(a, 0), ["heart"]);
  assert.deepEqual(a, ["clap", "heart"]);
  // moveItem: "to" is the gap before which the item lands
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 0, 3), ["b", "c", "a", "d"]);
  assert.deepEqual(moveItem(["a", "b", "c", "d"], 3, 0), ["d", "a", "b", "c"]);
  assert.deepEqual(moveItem(["a", "b", "c"], 0, 3), ["b", "c", "a"]);
  assert.deepEqual(moveItem(["a", "b"], 0, 1), ["a", "b"], "dropping onto itself is a no-op");
  assert.deepEqual(mirrorSeq(["disco_l", "clap", "dab_r"]), ["disco_r", "clap", "dab_l"]);
  assert.equal(seqBeats(["clap", FOUR]), 5);
});

test("practice parts are ~8 beats, long moves stand alone, order kept", () => {
  const seq = ["clap", "clap", FOUR, "heart", "heart", "dab_l", "dab_r", "clap", FOUR];
  const parts = chunkSequence(seq);
  // 1+1+4+1+1 = 8 beats fill the first part exactly
  assert.deepEqual(parts.map((p) => p.seq), [["clap", "clap", FOUR, "heart", "heart"], ["dab_l", "dab_r", "clap", FOUR]]);
  assert.ok(parts.every((p) => seqBeats(p.seq) <= CHUNK_BEATS));
  assert.deepEqual(parts.flatMap((p) => p.seq), seq);
  assert.equal(parts[1].name, "第 2 段");
  assert.deepEqual(chunkSequence([]), []);
});

test("suggested BPM follows the material", () => {
  assert.deepEqual(suggestBpm([]), [90, 130]);
  assert.deepEqual(suggestBpm(["clap", FOUR]), [85, 120]);
  assert.deepEqual(suggestBpm(["clap", "heart"]), [95, 135]);
});

test("cleanRoutine accepts good drafts and rejects hostile data", () => {
  const draft = forkRoutine(ROUTINES[0]);
  assert.match(draft.name, /改编/);
  assert.deepEqual(draft.seq, ROUTINES[0].segments.flatMap((s) => s.pattern.filter(Boolean)), "fork = built-in moves in order");
  const ok = cleanRoutine({ ...draft, name: " <b>我的</b> ", extra: 1 });
  assert.equal(ok.name, "b我的/b");
  assert.equal(ok.extra, undefined);
  assert.equal(ok.custom, true);
  assert.equal(cleanRoutine({ ...draft, id: "user:abc123" }).id, "user:abc123");
  const bad = [
    null, { ...draft, name: "" }, { ...draft, bpm: [130, 90] }, { ...draft, bpm: [10, 90] },
    { ...draft, seq: [] }, { ...draft, seq: "clap" }, { ...draft, seq: Array(MAX_MOVES + 1).fill("clap") },
    { ...draft, seq: ["__proto__"] }, { ...draft, seq: ["moonwalk"] }, { ...draft, seq: [null] },
    { ...draft, id: "bundled:disco_groove" }, { ...draft, id: "user:../../x" },
  ];
  for (const b of bad) assert.throws(() => cleanRoutine(b), Error, JSON.stringify(b)?.slice(0, 60));
});

test("a sequence is danced once, first move to last, each on the next free beat", () => {
  const seq = ["disco_l", "disco_r", FOUR, "heart"];
  const notes = sequenceChart(song(120), seq);
  assert.deepEqual(notes.map((n) => n.move), seq, "once through, in order");
  const iv = 0.5;
  assert.ok(Math.abs(notes[1].t - notes[0].t - iv) < 1e-6);
  assert.ok(Math.abs(notes[3].t - notes[2].t - 4 * iv) < 1e-6, "a 4-beat move holds 4 beats");
  assert.ok(Math.abs(notes.endAt - (notes[3].t + iv + 1)) < 1e-6);
  // generateDanceChart dispatches to it for sequence routines
  const routine = withParts(cleanRoutine({ ...newRoutine(), seq }));
  assert.deepEqual(generateDanceChart(song(120), routine).map((n) => n.move), seq);
  assert.equal(validateRoutine(routine), null);
  assert.deepEqual(routineMoves(routine), seq);
  // a song too short stops at the last move that fits
  assert.deepEqual(sequenceChart(song(120, 6), ["clap", "clap", FOUR, "clap"]).map((n) => n.move), ["clap", "clap"]);
  // practice notes for a part play back to back
  const p = segmentNotes({ seq: ["clap", FOUR, "heart"] }, 60);
  assert.deepEqual(p.map((n) => n.t), [1.2, 2.2, 6.2]);
});

test("motion-capture clips are whole guided moves at their own length", () => {
  assert.equal(clipBeats(4.8), 8);
  assert.equal(clipBeats(0.2), 1);
  const defs = clipMoveDefs([
    { id: "bundled:cmu_05_02", kind: "bundled", name: "舒展与旋转", duration: 7.1, style: "现代舞" },
    { id: "user:jazz", kind: "user", name: "Jazz", duration: 3.4, style: "爵士" },
    { id: "user:bad", name: "x", error: "坏了" },
  ]);
  assert.deepEqual(Object.keys(defs), ["clip:bundled:cmu_05_02", "clip:user:jazz"]);
  const j = defs["clip:user:jazz"];
  assert.equal(j.name, "Jazz");
  assert.ok(j.user && j.guided);
  assert.equal(j.seconds, 3.4);
  assert.deepEqual([j.start, j.end], [0, 3.4]);
  assert.ok(isClipMove("clip:user:jazz") && !isClipMove("clap"));
  assert.equal(wholeClipId("clip:bundled:cmu_05_02:1"), "clip:bundled:cmu_05_02");
  assert.equal(wholeClipId("clap"), "clap");

  registerClipMoves(defs);
  try {
    assert.equal(DANCE_NAMES["clip:user:jazz"].name, "Jazz");
    assert.ok(DANCE_MET["clip:user:jazz"] > 0);
    assert.equal(completeGuided({}, "dance")["clip:user:jazz"], 1, "scored by completion");
    assert.equal(moveHold("clip:user:jazz", 90), 3.4, "plays at its captured speed at any tempo");
    assert.equal(moveHold("clip:user:jazz", 140), 3.4);
    // mixed sequence: the clip takes its 3.4 s, the next move starts on the following beat
    const notes = sequenceChart(song(100), ["clap", "clip:user:jazz", "heart"]);
    const [, c, h] = notes;
    assert.equal(c.hold, 3.4);
    assert.ok(h.t >= c.t + 3.4 && h.t < c.t + 3.4 + 0.6 + 1e-6);
    assert.deepEqual(chunkSequence(["clap", "clip:bundled:cmu_05_02", "heart"]).map((p) => p.seq.length), [1, 1, 1],
      "a 12-beat clip is a practice part on its own");

    // upgrade: old 8-beat segments flatten; clip sections become the whole clip; deleted clips drop
    const old = {
      id: "user:aaaaaa", name: "旧", bpm: [90, 120], segments: [
        { name: "A", pattern: ["disco_l", null, "clip:user:jazz:0", null, null, null, null, null] },
        { name: "B", pattern: ["clip:user:gone:1", null, "heart", null, null, null, null, null] },
      ],
    };
    const { routine, removed } = upgradeRoutine(old);
    assert.deepEqual(routine.seq, ["disco_l", "clip:user:jazz", "heart"]);
    assert.equal(removed, 1);
    assert.equal(routine.segments, undefined);
    assert.equal(old.segments.length, 2, "input untouched");
    assert.deepEqual(upgradeRoutine(routine).removed, 0);
  } finally {
    registerClipMoves({});
  }
  assert.equal(DANCE_MOVES["clip:user:jazz"], undefined, "unregistered again");
});
