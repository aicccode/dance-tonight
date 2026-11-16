import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { MOTIONS, sampleMotion } from "../js/coach/dance_motions.js";
import { lerpAngle, mirrorPose } from "../js/coach/motion.js";
import { ALL_BONES } from "../js/coach/choreo.js";
import { generateDanceChart, routineById, ROUTINES, segmentNotes, validateRoutine } from "../js/core/dance.js";
import { completeGuided, DANCE_MOVES } from "../js/dance/dancemoves.js";
import { makeAnalysis } from "./core.test.js";

const PHASES = [0, 0.25, 0.5, 0.75, 1];
const GUIDED = Object.keys(DANCE_MOVES).filter((id) => DANCE_MOVES[id].guided);

describe("multi-beat dance motions", () => {
  it("adds thirteen guided variants with real keyframe sequences", () => {
    assert.equal(GUIDED.length, 13);
    for (const id of GUIDED) {
      assert.ok(DANCE_MOVES[id].beats >= 2, `${id} duration`);
      assert.ok(DANCE_MOVES[id].steps.length >= 2, `${id} teaching steps`);
      assert.ok(MOTIONS[id].length >= 4, `${id} keyframes`);
      for (const phase of PHASES) {
        const pose = sampleMotion(id, phase);
        assert.ok(pose, `${id} pose at ${phase}`);
        for (const value of Object.values(pose)) {
          if (Array.isArray(value)) assert.ok(value.every(Number.isFinite), `${id} finite Euler`);
          else assert.ok(Number.isFinite(value), `${id} finite scalar`);
        }
      }
    }
  });

  it("drives every motion bone and includes depth translation", () => {
    const bones = new Set(Object.values(MOTIONS).flatMap((keys) =>
      keys.flatMap((k) => Object.entries(k.pose).filter(([, v]) => Array.isArray(v)).map(([k]) => k))));
    for (const bone of bones) assert.ok(ALL_BONES.includes(bone), `missing ${bone}`);
    const wave = sampleMotion("body_wave", 0.5);
    assert.ok(Math.abs(wave.hipsZ) > 0.02, "body wave must travel in depth, not only side-to-side");
  });

  it("full turns accumulate through side and back to 360 degrees", () => {
    for (const [id, sign] of [["turn_l", 1], ["turn_r", -1]]) {
      assert.equal(sampleMotion(id, 0).turn, 0);
      assert.equal(sampleMotion(id, 0.5).turn, sign * 180);
      assert.equal(sampleMotion(id, 1).turn, sign * 360);
      const angles = [0.2, 0.35, 0.5, 0.65, 0.8].map((p) => sampleMotion(id, p).turn * sign);
      for (let i = 1; i < angles.length; i++) assert.ok(angles[i] > angles[i - 1], `${id} keeps turning`);
    }
    assert.equal(sampleMotion("back_wave", 0.5).turn, 180, "back wave faces away for its middle phrase");
    assert.equal(sampleMotion("back_wave", 1).turn, 360, "back wave returns through a full turn");
  });

  it("mirrors every motion including signed travel and turn direction", () => {
    for (const id of GUIDED.filter((m) => m.endsWith("_l"))) {
      const right = `${id.slice(0, -2)}_r`;
      for (const phase of PHASES) {
        assert.deepEqual(sampleMotion(right, phase), mirrorPose(sampleMotion(id, phase)), `${id} at ${phase}`);
      }
    }
  });

  it("does not unwind a completed turn when blending to a front-facing pose", () => {
    assert.equal(lerpAngle(360, 0, 0.5), 360);
    assert.equal(lerpAngle(-360, 0, 0.5), -360);
    assert.equal(lerpAngle(350, 10, 0.5), 360);
  });

  it("non-turn motions use more than one distinct body shape", () => {
    for (const id of GUIDED.filter((m) => !m.startsWith("turn_"))) {
      const shapes = new Set(PHASES.map((p) => JSON.stringify(sampleMotion(id, p))));
      assert.ok(shapes.size >= 3, `${id} only has ${shapes.size} shapes`);
    }
  });
});

describe("multi-beat routine timing and guided scoring", () => {
  it("all routines reserve enough slots for every motion", () => {
    for (const routine of ROUTINES) assert.equal(validateRoutine(routine), null, routine.id);
    assert.ok(routineById("fluid_flow"));
    assert.ok(routineById("turn_stage"));
  });

  it("chart and segment notes hold complex moves for their full beat count", () => {
    const routine = routineById("turn_stage");
    const analysis = makeAnalysis(120, 90);
    const notes = generateDanceChart(analysis, routine);
    const turn = notes.find((n) => n.move === "turn_l");
    assert.ok(turn, "turn appears in generated chart");
    assert.equal(turn.hold, 2, "four beats at 120 BPM");
    assert.ok(turn.t + turn.hold <= analysis.duration - 2);

    const segment = routine.segments.find((s) => s.name === "旋转");
    const practice = segmentNotes(segment, 80);
    assert.equal(practice[0].hold, 3, "four beats at 80 BPM");
    assert.equal(practice[1].t - practice[0].t, 3);
  });

  it("guided moves complete without camera features, only in dance mode", () => {
    const guided = completeGuided({ disco_l: 0.25 }, "dance");
    for (const id of GUIDED) assert.equal(guided[id], 1, id);
    assert.equal(guided.disco_l, 0.25, "existing moves keep their match");
    const training = { body_wave: 0 };
    assert.equal(completeGuided(training, "train"), training);
    assert.equal(training.body_wave, 0, "input is not mutated");
  });
});
