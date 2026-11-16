import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";

import { generateDanceChart, routineById, ROUTINES, segmentNotes, validateRoutine } from "../js/core/dance.js";
import { CUES } from "../js/core/cues.js";
import { DANCE_MATCHERS, DANCE_MOVES } from "../js/dance/dancemoves.js";
import { MATCHERS, matchAll } from "../js/judge.js";
import { MOVE_UI } from "../js/moves.js";
import { groupKey, startsGroup } from "../js/voice/cueplan.js";
import { POSES, mirrorPose } from "../js/coach/choreo.js";
import { MOTIONS } from "../js/coach/dance_motions.js";
import { computeFeatures, LM, thighNorm, toPoints } from "../js/features.js";
import { POSES as SYN, pose } from "./poses.js";

import { makeAnalysis } from "./core.test.js";

const baseline = { thigh: thighNorm(toPoints(SYN.stand)) };
const feats = (lm) => computeFeatures(toPoints(lm), baseline);

// mirrors of the synthetic left poses
const SYN_ALL = { ...SYN, disco_r: null, vogue_r: null, floss_r: null, hip_sway_r: null, dab_r: null };

describe("dance catalog completeness", () => {
  it("every dance move has matcher, UI, coach pose and voice cue", () => {
    for (const id of Object.keys(DANCE_MOVES)) {
      assert.ok(MATCHERS[id], `matcher ${id}`);
      assert.ok(MOVE_UI[id], `ui ${id}`);
      assert.ok(POSES[id] || MOTIONS[id], `pose or motion ${id}`);
      assert.ok(CUES[`move.${id}`], `cue ${id}`);
    }
  });
  it("paired moves mirror cleanly", () => {
    for (const [id, m] of Object.entries(DANCE_MOVES)) {
      if (!m.pair) continue;
      assert.equal(DANCE_MOVES[m.pair]?.pair, id);
      assert.ok(POSES[m.pair] || MOTIONS[m.pair], `mirror pose of ${id}`);
    }
    for (const id of Object.keys(POSES).filter((k) => k.endsWith("_l"))) {
      assert.deepEqual(mirrorPose(mirrorPose(POSES[id])), POSES[id]);
      if (POSES[id].hipsX != null) {
        assert.equal(POSES[id.replace(/_l$/, "_r")].hipsX, -POSES[id].hipsX, `hip translation ${id}`);
      }
    }
  });
  it("pair cues exist for every alternating family", () => {
    for (const [id, m] of Object.entries(DANCE_MOVES)) {
      if (m.pair && id.endsWith("_l")) assert.ok(CUES[`pair.${id.slice(0, -2)}`], `pair cue ${id}`);
    }
  });
});

describe("coach dance poses match their instructions", () => {
  const DEG = Math.PI / 180;
  const quat = (euler = [0, 0, 0]) => new THREE.Quaternion().setFromEuler(
    new THREE.Euler(euler[0] * DEG, euler[1] * DEG, euler[2] * DEG),
  );
  // Normalized VRM arms start in a T-pose: left +X, right -X. These vectors
  // describe the coach's own body (screen left is therefore negative X).
  const arm = (move, side) => {
    const p = POSES[move];
    const upperQ = quat(p[`${side}UpperArm`]);
    const lowerQ = upperQ.clone().multiply(quat(p[`${side}LowerArm`]));
    const rest = new THREE.Vector3(side === "left" ? 1 : -1, 0, 0);
    const upper = rest.clone().applyQuaternion(upperQ);
    const lower = rest.clone().applyQuaternion(lowerQ);
    return {
      upper, lower,
      elbow: upper.clone().multiplyScalar(0.28),
      wrist: upper.clone().multiplyScalar(0.28).add(lower.clone().multiplyScalar(0.24)),
    };
  };
  const sides = (move) => move.endsWith("_l")
    ? { raised: "right", other: "left", direction: -1 }
    : { raised: "left", other: "right", direction: 1 };

  for (const move of ["disco_l", "disco_r"]) {
    it(`${move}: one straight arm points up-out, the other stays down`, () => {
      const { raised, other, direction } = sides(move);
      const up = arm(move, raised), down = arm(move, other);
      assert.ok(up.wrist.y > 0.45 && up.wrist.x * direction > 0.2, JSON.stringify(up.wrist));
      assert.ok(up.lower.y > 0.65, "forearm should continue upward, not fold forward");
      assert.ok(down.wrist.y < -0.35, "other hand should be low");
    });
  }

  it("hands_out: both arms are horizontal at shoulder height", () => {
    for (const side of ["left", "right"]) {
      const a = arm("hands_out", side);
      assert.ok(Math.abs(a.wrist.y) < 0.12);
      assert.ok(Math.abs(a.wrist.x) > 0.45);
    }
  });

  it("clap: palms meet in front of the chest, below shoulder height", () => {
    const l = arm("clap", "left"), r = arm("clap", "right");
    assert.ok(Math.abs(l.wrist.x) < 0.1 && Math.abs(r.wrist.x) < 0.1);
    assert.ok(l.wrist.y < -0.12 && r.wrist.y < -0.12, "hands should be at chest level");
    assert.ok(l.wrist.y > -0.5 && r.wrist.y > -0.5);
  });

  it("heart: bent arms bring both wrists together above the head", () => {
    const l = arm("heart", "left"), r = arm("heart", "right");
    assert.ok(Math.abs(l.wrist.x) < 0.1 && Math.abs(r.wrist.x) < 0.1, "wrists must meet");
    assert.ok(l.wrist.y > 0.42 && r.wrist.y > 0.42, "hands must be overhead");
    assert.ok(l.lower.x < -0.5 && r.lower.x > 0.5, "forearms angle inward");
  });

  for (const move of ["vogue_l", "vogue_r"]) {
    it(`${move}: overhead elbow bends into a frame while the other arm extends`, () => {
      const { raised, other } = sides(move);
      const frame = arm(move, raised), out = arm(move, other);
      assert.ok(frame.elbow.y > 0.2, "elbow is overhead");
      assert.ok(frame.lower.x * (raised === "right" ? 1 : -1) > 0.55, "forearm crosses inward");
      assert.ok(Math.abs(out.wrist.y) < 0.15 && Math.abs(out.wrist.x) > 0.45);
    });
  }

  for (const move of ["floss_l", "floss_r"]) {
    it(`${move}: both arms swing low to one side and hips counter-sway`, () => {
      const { direction } = sides(move);
      for (const side of ["left", "right"]) {
        const a = arm(move, side);
        assert.ok(a.wrist.y < 0.05, `${side} arm must not point upward`);
        assert.ok(a.wrist.x * direction > 0.12, `${side} wrist swings with the other arm`);
      }
      assert.ok(POSES[move].hipsX * direction < -0.05, "hips move opposite the arms");
    });
  }

  for (const move of ["hip_l", "hip_r"]) {
    it(`${move}: hips travel to the named side with hands at the waist`, () => {
      const { direction } = sides(move);
      assert.ok(POSES[move].hipsX * direction > 0.05);
      for (const side of ["left", "right"]) {
        const a = arm(move, side);
        assert.ok(a.wrist.y < -0.25 && a.wrist.y > -0.65, "hands are near hip level");
        assert.ok(a.lower.x * (side === "left" ? -1 : 1) > 0.35, "forearms bend inward");
      }
    });
  }

  for (const move of ["dab_l", "dab_r"]) {
    it(`${move}: one arm rises, the other crosses the face, head bows into the dab`, () => {
      const { raised, other, direction } = sides(move);
      const up = arm(move, raised), across = arm(move, other);
      assert.ok(up.wrist.y > 0.35 && up.wrist.x * direction > 0.2);
      assert.ok(across.lower.x * direction > 0.55, "opposite forearm crosses the face");
      assert.ok(Math.abs(across.lower.y) < 0.65, "crossing forearm is roughly horizontal");
      assert.ok(POSES[move].head[0] > 5, "head bows forward");
      assert.ok(POSES[move].head[2] * -direction > 8, "head leans toward the raised arm");
    });
  }
});

describe("dance matchers on synthetic poses", () => {
  const EXPECT = {
    disco_l: "disco_l", hands_out: "hands_out", clap: "clap", heart: "heart",
    vogue_l: "vogue_l", floss_l: "floss_l", hip_sway_l: "hip_l", dab_l: "dab_l", bounce: "bounce",
  };
  for (const [poseName, move] of Object.entries(EXPECT)) {
    it(`${move} pose scores high`, () => {
      const m = matchAll(feats(SYN_ALL[poseName]));
      assert.ok(m[move] >= 0.8, `${move}=${m[move]?.toFixed(2)}`);
    });
  }
  it("standing scores low on all dance moves", () => {
    const m = matchAll(feats(SYN.stand));
    for (const move of Object.keys(DANCE_MATCHERS)) assert.ok(m[move] < 0.2, `${move}=${m[move].toFixed(2)}`);
  });
  it("left/right poses are not confused", () => {
    const mk = (lm, a, b) => { const m = matchAll(feats(lm)); assert.ok(m[a] >= 0.8, `${a}=${m[a].toFixed(2)}`); assert.ok(m[b] < 0.25, `${b}=${m[b].toFixed(2)}`); };
    mk(SYN_ALL.disco_l, "disco_l", "disco_r");
    mk(SYN_ALL.vogue_l, "vogue_l", "vogue_r");
    mk(SYN_ALL.floss_l, "floss_l", "floss_r");
    mk(SYN_ALL.hip_sway_l, "hip_l", "hip_r");
    mk(SYN_ALL.dab_l, "dab_l", "dab_r");
  });
  it("dab accepts a head bow without a torso lean", () => {
    // Align hips under the shoulders to remove torso tilt while keeping the
    // nose below them; head-only dab is a valid alternative to a torso lean.
    const upright = SYN_ALL.dab_l.map((p, i) => ({
      ...p, x: p.x + ([LM.LH, LM.RH].includes(i) ? 0.06 : 0),
    }));
    const f = feats(upright);
    assert.ok(Math.abs(f.tilt.l) < 0.1, `torso tilt=${f.tilt.l}`);
    assert.ok(f.headDrop > 0.08, `head drop=${f.headDrop}`);
    assert.ok(matchAll(f).dab_l >= 0.8);
  });
});

describe("dance charts", () => {
  it("routines are valid and patterns are 8 beats", () => {
    for (const r of ROUTINES) {
      assert.equal(validateRoutine(r), null);
      assert.ok(r.segments.length >= 3);
      for (const s of r.segments) assert.equal(s.pattern.length, 8);
    }
  });

  it("chart follows the pattern, on beats, deterministic", () => {
    const routine = routineById("disco_groove");
    const a = makeAnalysis(120, 90, 0.8);
    const notes = generateDanceChart(a, routine);
    assert.ok(notes.length > 40);
    const beatSet = new Set(a.beats);
    const byPhrase = new Map();
    for (const n of notes) {
      assert.ok(beatSet.has(n.t), "on beat");
      assert.equal(n.hold, 0);
      if (!byPhrase.has(n.phrase)) byPhrase.set(n.phrase, []);
      byPhrase.get(n.phrase).push(n.move);
    }
    for (const [p, moves] of byPhrase) {
      const pattern = routine.segments[p % routine.segments.length].pattern;
      assert.deepEqual(moves, pattern.filter(Boolean), `phrase ${p} moves`);
    }
    assert.deepEqual(generateDanceChart(a, routine), notes);
  });

  it("respects lead-in and tail", () => {
    const a = makeAnalysis(100, 60);
    for (const n of generateDanceChart(a, routineById("street_swag"))) {
      assert.ok(n.t >= 3.0 && n.t <= 58.0, `t=${n.t}`);
    }
  });

  it("segmentNotes puts notes on the slow grid", () => {
    const seg = routineById("disco_groove").segments[0];
    const notes = segmentNotes(seg, 80);
    assert.deepEqual(notes.map((n) => n.move), ["disco_l", "disco_l", "disco_r", "disco_r"]);
    const gap = notes[1].t - notes[0].t;
    assert.ok(Math.abs(gap - 1.5) < 1e-9, `gap ${gap}`);
  });

  it("cue planner speaks pair cues for dance alternations", () => {
    const notes = segmentNotes(routineById("street_swag").segments[0], 80)
      .map((n) => ({ ...n, hold: 0 }));
    assert.equal(groupKey(notes, 0), "pair.floss");
    assert.equal(startsGroup(notes, 0), true);
    assert.equal(startsGroup(notes, 1), false);
  });
});

describe("new features", () => {
  it("wristGap, hipShift, headDrop measure the right things", () => {
    const stand = feats(SYN.stand);
    assert.ok(Math.abs(stand.wristGap - 0.2 / stand.scale) < 1e-6);
    assert.ok(Math.abs(stand.hipShift.l) < 1e-9 && Math.abs(stand.hipShift.r) < 1e-9);
    assert.ok(stand.headDrop < -0.5);
    const sway = feats(SYN_ALL.hip_sway_l);
    assert.ok(sway.hipShift.l > 0.2, `hipShift.l=${sway.hipShift.l}`);
    const dab = feats(SYN_ALL.dab_l);
    assert.ok(dab.headDrop > -0.1, `headDrop=${dab.headDrop.toFixed(2)}`);
    assert.ok(dab.tilt.l > 10, `tilt=${dab.tilt.l.toFixed(1)}`);
  });
});
