import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { computeFeatures, thighNorm, toPoints } from "../js/features.js";
import { GRADES, MATCHERS, MISS, Scorer, judgeNote, matchAll, pointsFor, ramp } from "../js/judge.js";
import { POSES, pose } from "./poses.js";

const baseline = { thigh: thighNorm(toPoints(POSES.stand)) };
const feats = (lm, b = baseline) => computeFeatures(toPoints(lm), b);

describe("ramp", () => {
  it("increases and decreases, clamped", () => {
    assert.equal(ramp(5, 0, 10), 0.5);
    assert.equal(ramp(-1, 0, 10), 0);
    assert.ok(Math.abs(ramp(0.7, 0.85, 0.55) - 0.5) < 1e-9);
    assert.equal(ramp(NaN, 0, 1), 0);
  });
});

describe("features", () => {
  it("returns null with degenerate torso", () => {
    const pts = toPoints(pose({ 11: [0.5, 0.5], 12: [0.5, 0.5], 23: [0.5, 0.5], 24: [0.5, 0.5] }));
    assert.equal(computeFeatures(pts), null);
    assert.equal(thighNorm(pts), null);
  });
  it("knee angle: ~180 standing, ~110 in the squat pose", () => {
    assert.ok(Math.abs(feats(POSES.stand).kneeAngle.l - 180) < 1);
    const a = feats(POSES.squat).kneeAngle.l;
    assert.ok(a > 90 && a < 120, `squat kneeAngle=${a}`);
  });
  it("standing thigh ratio is ~1 with baseline", () => {
    const f = feats(POSES.stand);
    assert.ok(Math.abs(f.thigh.l - 1) < 1e-9);
    assert.ok(Math.abs(f.tilt.l) < 1e-9);
  });
  it("flags low visibility of legs", () => {
    assert.equal(feats(pose({}, 0.2)).lowerVisible, false);
  });
});

describe("matchers", () => {
  const moves = Object.keys(MATCHERS);

  it("standing scores low on every move", () => {
    const m = matchAll(feats(POSES.stand));
    for (const move of moves) assert.ok(m[move] < 0.2, `${move}=${m[move]}`);
  });

  // high-score pose checks only for poses this file defines; dance moves are
  // covered in dance.test.js with their own poses and thresholds
  for (const move of moves.filter((m) => POSES[m])) {
    it(`${move} pose scores high on ${move}`, () => {
      const m = matchAll(feats(POSES[move]));
      assert.ok(m[move] >= 0.85, `${move}=${m[move].toFixed(2)}`);
    });
  }

  it("left/right moves are not confused", () => {
    for (const [a, b] of [["punch_l", "punch_r"], ["knee_l", "knee_r"], ["cross_l", "cross_r"], ["bend_l", "bend_r"]]) {
      assert.ok(matchAll(feats(POSES[a]))[b] < 0.3, `${a} pose gave ${b}`);
      assert.ok(matchAll(feats(POSES[b]))[a] < 0.3, `${b} pose gave ${a}`);
    }
  });

  it("squat pose is not a knee raise and grades deep", () => {
    const m = matchAll(feats(POSES.squat));
    assert.ok(m.squat >= 0.85, `squat=${m.squat.toFixed(2)}`);
    assert.ok(m.knee_l < 0.3 && m.knee_r < 0.3);
  });
  it("new core/leg moves score high on their poses", () => {
    for (const [poseName, move, bar] of [["toe_touch", "toe_touch", 0.85], ["knee_out_l", "knee_out_l", 0.85], ["kick_l", "kick_l", 0.85]]) {
      const m = matchAll(feats(POSES[poseName]));
      assert.ok(m[move] >= bar, `${move}=${m[move]?.toFixed(2)}`);
    }
  });
  it("new moves do not cross-fire on other poses", () => {
    for (const move of ["toe_touch", "knee_out_l", "kick_l"]) {
      for (const p of ["stand", "squat", "knee_l", "arms_up", "jack"]) {
        assert.ok(matchAll(feats(POSES[p]))[move] < 0.3, `${p} triggered ${move}`);
      }
    }
  });
  it("knee raises are not squats", () => {
    for (const p of ["knee_l", "knee_r", "cross_l", "cross_r"]) {
      assert.ok(matchAll(feats(POSES[p])).squat < 0.3, `${p} triggered squat`);
    }
  });

  it("leg moves score 0 when legs not visible", () => {
    const f = { ...feats(POSES.squat), lowerVisible: false };
    assert.equal(MATCHERS.squat(f), 0);
  });

  it("matchAll(null) is all zeros", () => {
    assert.ok(Object.values(matchAll(null)).every((v) => v === 0));
  });
});

describe("judgeNote", () => {
  const note = { t: 10, move: "squat", hold: 0 };
  it("no samples is a miss", () => assert.equal(judgeNote(note, []).grade, MISS));
  it("on-time strong hit is perfect", () => {
    const r = judgeNote(note, [{ t: 9.8, s: 0.3 }, { t: 10.05, s: 0.95 }]);
    assert.equal(r.grade.name, "perfect");
  });
  it("late strong hit downgrades to great", () => {
    assert.equal(judgeNote(note, [{ t: 10.4, s: 0.95 }]).grade.name, "great");
  });
  it("weak attempt is good, nothing is miss", () => {
    assert.equal(judgeNote(note, [{ t: 10, s: 0.5 }]).grade.name, "good");
    assert.equal(judgeNote(note, [{ t: 10, s: 0.1 }]).grade, MISS);
  });
  it("hold note grades on mean over hold", () => {
    const hold = { t: 10, move: "squat", hold: 1 };
    const samples = [0, 0.25, 0.5, 0.75, 1].map((d) => ({ t: 10 + d, s: 0.9 }));
    assert.equal(judgeNote(hold, samples).grade.name, "perfect");
    const half = samples.map((p, i) => ({ ...p, s: i % 2 ? 0.9 : 0.2 }));
    assert.equal(judgeNote(hold, half).grade.name, "good");
    assert.equal(judgeNote(hold, [{ t: 9, s: 1 }]).grade, MISS);
  });
});

describe("Scorer", () => {
  const notes = [
    { t: 1, move: "squat", hold: 0 },
    { t: 2, move: "jack", hold: 0 },
    { t: 3, move: "arms_up", hold: 0.5 },
  ];

  function run(perform) {
    const sc = new Scorer(notes);
    const events = [];
    for (let t = 0; t <= 5; t += 1 / 30) {
      events.push(...sc.update(t, perform(t)));
    }
    events.push(...sc.finishAll());
    return { sc, events };
  }

  it("perfect performance clears everything with full combo", () => {
    const { sc, events } = run((t) => ({
      squat: Math.abs(t - 1) < 0.15 ? 1 : 0,
      jack: Math.abs(t - 2) < 0.15 ? 1 : 0,
      arms_up: t >= 2.8 && t <= 3.6 ? 1 : 0,
    }));
    assert.equal(events.length, 3);
    assert.deepEqual(sc.counts, { perfect: 3, great: 0, good: 0, miss: 0 });
    assert.equal(sc.maxCombo, 3);
    assert.equal(sc.accuracy, 1);
    assert.equal(sc.score, pointsFor(GRADES[0], 1) + pointsFor(GRADES[0], 2) + pointsFor(GRADES[0], 3));
  });

  it("doing nothing misses everything", () => {
    const { sc } = run(() => ({}));
    assert.equal(sc.counts.miss, 3);
    assert.equal(sc.score, 0);
    assert.equal(sc.accuracy, 0);
  });

  it("strong hit locks early so feedback is instant", () => {
    const sc = new Scorer([notes[0]]);
    const ev = sc.update(0.95, { squat: 0.95 });
    assert.equal(ev.length, 1);
    assert.equal(sc.active(1).length, 0);
  });

  it("combo resets on miss", () => {
    const { sc } = run((t) => ({ squat: Math.abs(t - 1) < 0.1 ? 1 : 0, arms_up: t >= 2.8 && t < 3.6 ? 1 : 0 }));
    assert.equal(sc.counts.miss, 1);
    assert.equal(sc.maxCombo, 1);
  });

  it("accuracy is 0 before any judgement", () => assert.equal(new Scorer(notes).accuracy, 0));
});

describe("pointsFor", () => {
  it("combo multiplier caps at 2x", () => {
    assert.equal(pointsFor(GRADES[0], 0), 300);
    assert.equal(pointsFor(GRADES[0], 500), 600);
  });
});
