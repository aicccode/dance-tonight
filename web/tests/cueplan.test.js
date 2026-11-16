import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { mirrorPose, POSES, poseWeights } from "../js/coach/choreo.js";
import { LEAD_S, groupKey, planCues, startsGroup } from "../js/voice/cueplan.js";

const dur = () => 0.5;
const beats = Array.from({ length: 200 }, (_, i) => 0.5 + i * 0.5);
const N = (t, move, hold = 0) => ({ t, move, hold });

describe("cue planner", () => {
  const notes = [N(4, "knee_l"), N(5, "knee_r"), N(6, "knee_l"), N(7, "knee_r"), N(9, "squat"), N(11, "squat", 1.5)];

  it("groups alternating pairs and announces them once", () => {
    assert.equal(groupKey(notes, 0), "pair.knee");
    assert.deepEqual(notes.map((_, i) => startsGroup(notes, i)), [true, false, false, false, true, true]);
    assert.equal(groupKey(notes, 4), "move.squat");
    assert.equal(groupKey(notes, 5), "hold.squat");
  });

  it("each cue ends LEAD_S before its beat; count-in on preceding beats", () => {
    const plan = planCues(notes, beats, dur, { countIn: true });
    const keys = plan.map((c) => c.key);
    assert.deepEqual(keys, ["count.3", "count.2", "count.1", "pair.knee", "move.squat", "hold.squat"]);
    const knee = plan.find((c) => c.key === "pair.knee");
    assert.ok(Math.abs(knee.at + 0.5 + LEAD_S - 4) < 1e-9);
  });

  it("eyes-closed mode calls left/right on every alternating note", () => {
    const keys = planCues(notes, beats, dur, { eyesClosed: true, countIn: false }).map((c) => c.key);
    assert.deepEqual(keys.slice(0, 4), ["pair.knee", "side.r", "side.l", "side.r"]);
  });

  it("drops side calls that would overlap; never overlaps cues", () => {
    const fast = Array.from({ length: 12 }, (_, i) => N(4 + i * 0.35, i % 2 ? "punch_r" : "punch_l"));
    const plan = planCues(fast, beats, dur, { eyesClosed: true, countIn: false });
    for (let i = 1; i < plan.length; i++) assert.ok(plan[i].at >= plan[i - 1].at + 0.5);
    assert.equal(plan[0].key, "pair.punch");
  });

  it("adds halfway / last-stretch encouragement for long songs", () => {
    const keys = planCues(notes, beats, dur, { countIn: false, songDuration: 200 }).map((c) => c.key);
    assert.ok(keys.includes("fb.half") && keys.includes("fb.last"));
  });

  it("empty chart -> no cues", () => assert.deepEqual(planCues([], beats, dur), []));
});

describe("choreography", () => {
  it("right-side poses mirror left-side ones", () => {
    // Mirroring canonicalizes signed zero; -0 and 0 are the same joint angle.
    assert.deepEqual(POSES.knee_r.leftUpperLeg, [-95, 0, 0]);
    assert.deepEqual(mirrorPose(mirrorPose(POSES.cross_l)), POSES.cross_l);
    for (const m of ["arms_up", "punch_l", "punch_r", "squat", "knee_l", "knee_r", "jack", "cross_l", "cross_r", "bend_l", "bend_r"]) {
      assert.ok(POSES[m], m);
    }
  });

  it("coach hits the pose exactly on the beat and releases after", () => {
    const notes = [N(2, "squat"), N(4, "jack", 1)];
    assert.equal(poseWeights(notes, 0).wNext, 0);
    const at = poseWeights(notes, 2);
    assert.equal(at.prev.move, "squat");
    assert.equal(at.wPrev, 1);
    const mid = poseWeights(notes, 3);
    assert.ok(mid.wPrev === 0 && mid.wNext === 0);
    const hold = poseWeights(notes, 4.8);
    assert.equal(hold.prev.move, "jack");
    assert.equal(hold.wPrev, 1);
    assert.ok(poseWeights(notes, 3.9).wNext > 0.5);
  });
});
