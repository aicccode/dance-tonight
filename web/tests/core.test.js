import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { LEAD_IN_S, SAME_MOVE_GAP_S, TAIL_S, generateChart, makeRng, seedFrom } from "../js/core/chart.js";
import { HOLDABLE, MOVES, movesForLevel } from "../js/core/moves.js";
import { SPEED_MOVES, TOTAL_DAYS, clampDay, dayPlan, estimateKcal, speedPlan } from "../js/core/program.js";

export function makeAnalysis(bpm = 120, duration = 60, energy = null) {
  const interval = 60 / bpm;
  const n = Math.floor((duration - 0.5) / interval);
  const beats = Array.from({ length: n }, (_, i) => Math.round((0.5 + i * interval) * 1000) / 1000);
  const en = beats.map((_, i) =>
    energy === null ? 0.8 : typeof energy === "function" ? energy(i) : energy,
  );
  return { duration, tempo: bpm, beats, downbeats: beats.filter((_, i) => i % 4 === 0), energy: en };
}

describe("program", () => {
  it("every day has a plan and minutes grow 10 -> 30", () => {
    const normal = Array.from({ length: TOTAL_DAYS }, (_, i) => dayPlan(i + 1)).filter((p) => !p.recovery);
    assert.equal(normal[0].minutes, 10);
    assert.equal(normal.at(-1).minutes, 30);
    normal.slice(1).forEach((p, i) => assert.ok(normal[i].minutes <= p.minutes));
  });
  it("levels progress through phases", () => {
    assert.deepEqual([1, 20, 40, 90].map((d) => dayPlan(d).level), [1, 2, 3, 4]);
  });
  it("density doubles in the second week", () => {
    assert.equal(dayPlan(3).beats_per_note, 4);
    assert.equal(dayPlan(9).beats_per_note, 2);
  });
  it("every 7th day is recovery with lower MET", () => {
    for (const d of [7, 14, 21, 70]) {
      assert.ok(dayPlan(d).recovery);
      assert.ok(dayPlan(d).met < dayPlan(d - 1).met);
    }
  });
  it("clamps days and estimates kcal", () => {
    assert.equal(clampDay(-5), 1);
    assert.equal(clampDay(500), TOTAL_DAYS);
    assert.equal(dayPlan(0).day, 1);
    assert.equal(estimateKcal(8, 70, 1800), 280);
    assert.ok(dayPlan(99).target_accuracy > dayPlan(1).target_accuracy);
  });
});

describe("chart", () => {
  it("notes are on beats and within the song", () => {
    const a = makeAnalysis(120, 60);
    const notes = generateChart(a, dayPlan(1), 1);
    assert.ok(notes.length);
    const set = new Set(a.beats);
    for (const n of notes) {
      assert.ok(set.has(n.t));
      assert.ok(n.t >= LEAD_IN_S && n.t <= a.duration - TAIL_S);
    }
  });

  it("respects min interval for every phase", () => {
    for (const day of [1, 20, 40, 80]) {
      const p = dayPlan(day);
      const notes = generateChart(makeAnalysis(140, 90), p, 3);
      notes.slice(1).forEach((b, i) => {
        const a = notes[i];
        assert.ok(b.t - (a.t + a.hold) >= p.min_interval_s - 1e-6);
      });
    }
  });

  it("uses only level-appropriate moves", () => {
    const allowed = new Set(movesForLevel(1));
    for (const n of generateChart(makeAnalysis(), dayPlan(1), 2)) assert.ok(allowed.has(n.move));
  });

  it("density increases with day", () => {
    const a = makeAnalysis(100, 120);
    assert.ok(generateChart(a, dayPlan(90), 5).length > generateChart(a, dayPlan(1), 5).length * 1.5);
  });

  it("is deterministic per seed", () => {
    const a = makeAnalysis();
    assert.deepEqual(generateChart(a, dayPlan(30), 7), generateChart(a, dayPlan(30), 7));
  });

  it("paired moves alternate sides", () => {
    const notes = generateChart(makeAnalysis(120, 60, 0.2), dayPlan(20), 11);
    assert.ok(notes.some((a, i) => i + 1 < notes.length && a.move.endsWith("_l") && MOVES[a.move].pair === notes[i + 1].move));
  });

  const absShare = (notes) => notes.filter((n) => MOVES[n.move].group === "abs").length / notes.length;

  it("quiet songs are mostly abs, loud songs still train abs", () => {
    assert.ok(absShare(generateChart(makeAnalysis(100, 240, 0.2), dayPlan(20), 4)) > 0.5);
    const shares = [1, 2, 3, 4, 5].map((s) => absShare(generateChart(makeAnalysis(128, 240, 0.9), dayPlan(30), s)));
    assert.ok(shares.reduce((a, b) => a + b) / shares.length > 0.15);
  });

  it("breakdown rests at level 2 and becomes a core hold at level 3+", () => {
    const a = makeAnalysis(120, 60, (i) => (i >= 40 && i < 56 ? 0 : 0.8));
    const inQuiet = (notes) => notes.filter((n) => n.t >= a.beats[40] && n.t < a.beats[56]);
    assert.deepEqual(inQuiet(generateChart(a, dayPlan(20), 1)), []);
    const q = inQuiet(generateChart(a, dayPlan(50), 1));
    assert.ok(q.length && q.every((n) => n.hold > 0 && HOLDABLE.has(n.move)));
  });

  it("holds only on holdable moves", () => {
    const holds = generateChart(makeAnalysis(100, 180, 0.5), dayPlan(50), 9).filter((n) => n.hold > 0);
    assert.ok(holds.length && holds.every((n) => HOLDABLE.has(n.move)));
  });

  it("speed mode: fast moves, roughly one per beat", () => {
    const a = makeAnalysis(170, 90, 0.8);
    const notes = generateChart(a, speedPlan(), 3, SPEED_MOVES);
    assert.ok(notes.every((n) => SPEED_MOVES.includes(n.move)));
    assert.ok(notes.length > (0.6 * (90 - 5)) / (60 / 170));
    notes.slice(1).forEach((b, i) => assert.ok(b.t - notes[i].t >= 0.3 - 1e-6));
  });

  it("unpaired moves get reset time", () => {
    const last = {};
    for (const n of generateChart(makeAnalysis(170, 120, 0.8), dayPlan(90), 2)) {
      if (!MOVES[n.move].pair && n.move in last) assert.ok(n.t - last[n.move] >= SAME_MOVE_GAP_S - 1e-6);
      last[n.move] = n.t;
    }
  });

  it("too few beats -> empty chart", () => {
    assert.deepEqual(generateChart({ ...makeAnalysis(), beats: [1] }, dayPlan(1), 1), []);
  });
});

describe("rng/seed", () => {
  it("rng is deterministic and weighted picks follow weights", () => {
    const a = makeRng(42), b = makeRng(42);
    assert.equal(a.random(), b.random());
    const r = makeRng(1);
    const counts = { x: 0, y: 0 };
    for (let i = 0; i < 5000; i++) counts[r.weighted(["x", "y"], [0.9, 0.1])]++;
    assert.ok(counts.x > 4000 && counts.y > 200);
  });
  it("seedFrom is stable and bounded", () => {
    assert.equal(seedFrom("abc"), seedFrom("abc"));
    assert.notEqual(seedFrom("abc"), seedFrom("abd"));
    assert.ok(seedFrom("x".repeat(500)) < 100000);
  });
});
