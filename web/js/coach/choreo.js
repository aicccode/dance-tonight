// Coach choreography: peak poses per move on VRM normalized humanoid bones,
// plus the timing curve that makes the coach hit each pose exactly on the beat.
//
// Conventions (VRM 1.0 normalized bones, avatar facing the camera at +Z,
// avatar's left = +X). Angles are Euler XYZ in degrees.
//   leftUpperArm  z: -72 arm down, 0 T-pose, +75 up      (right arm: negate)
//   leftUpperArm  y: -90 arm forward                       (right arm: negate)
//   leftLowerArm  y: -90 elbow bent forward               (right arm: negate)
//   *UpperLeg     x: -90 thigh forward/up, *LowerLeg x: +90 knee bent
//   leftUpperLeg  z: + moves the foot outward             (right leg: negate)
//   spine x: + bends forward, z: + leans to avatar's right, y: + right shoulder forward
//
// hipsX/hipsY/hipsZ/hipsDrop move the hips (metres); turn is continuous root
// yaw in degrees. The coach MIRRORS the player: for "knee_l" (player's left
// knee) she lifts her RIGHT knee, which appears on the player's screen side.
import { mirrorPose } from "./motion.js";
import { MOTIONS } from "./dance_motions.js";
export { mirrorPose } from "./motion.js";

export const READY = {
  leftUpperArm: [0, 0, -72],
  rightUpperArm: [0, 0, 72],
  leftLowerArm: [0, -12, 0],
  rightLowerArm: [0, 12, 0],
};

const LEFT_DEFS = {
  // player's left → coach's right side
  punch_l: {
    rightUpperArm: [0, 0, 0],
    rightLowerArm: [0, 0, 0],
    leftUpperArm: [0, -55, -55],
    leftLowerArm: [0, -125, 0],
    spine: [0, 8, 4],
  },
  knee_l: {
    rightUpperLeg: [-95, 0, 0],
    rightLowerLeg: [95, 0, 0],
    leftUpperArm: [0, -35, -60],
    leftLowerArm: [0, -95, 0],
    rightUpperArm: [0, 30, 60],
    rightLowerArm: [0, 95, 0],
    hipsY: 0.02,
  },
  cross_l: {
    rightUpperLeg: [-95, 0, 18],
    rightLowerLeg: [100, 0, 0],
    spine: [18, -22, 0],
    chest: [10, -10, 0],
    leftUpperArm: [0, -45, -25],
    leftLowerArm: [0, -135, 0],
    rightUpperArm: [0, 0, 35],
    rightLowerArm: [0, 30, 0],
  },
  bend_l: {
    spine: [0, 0, 15],
    chest: [0, 0, 12],
    leftUpperArm: [0, 0, 95],
    leftLowerArm: [0, 0, 20],
    rightUpperArm: [0, 20, 60],
    rightLowerArm: [0, 70, 0],
  },
  // toe touch = hinge at the hip: pelvis pitches forward as a unit, thighs
  // counter-rotate so the legs stay vertical and feet planted
  toe_touch: {
    hipsRot: [75, 0, 0],
    leftUpperLeg: [-75, 0, 2],
    rightUpperLeg: [-75, 0, -2],
    spine: [10, 0, 0],
    chest: [8, 0, 0],
    head: [12, 0, 0],
    leftUpperArm: [15, -75, -12],
    rightUpperArm: [15, 75, 12],
    leftLowerArm: [12, -12, 0],
    rightLowerArm: [12, 12, 0],
    hipsDrop: 0.12,
  },
  // right knee up and out to her right (player's left)
  knee_out_l: {
    rightUpperLeg: [-92, 0, 34],
    rightLowerLeg: [72, 0, 0],
    leftUpperArm: [0, 0, -60],
    rightUpperArm: [0, 35, 55],
    rightLowerArm: [0, 80, 0],
    hipsY: 0.02,
  },
  // right leg kicked straight forward (player's left)
  kick_l: {
    rightUpperLeg: [-84, 0, 6],
    rightLowerLeg: [6, 0, 0],
    rightFoot: [12, 0, 0],
    leftUpperArm: [0, 0, -55],
    rightUpperArm: [0, 55, 45],
    leftLowerArm: [0, -20, 0],
    rightLowerArm: [0, 25, 0],
    spine: [-6, -8, 0],
  },
  // ---- dance moves (player-left variants; _r auto-mirrored) ----
  // coach raises HER right arm (screen-left), slanted up-out
  disco_l: {
    rightUpperArm: [0, -8, -65],
    rightLowerArm: [0, 0, -2],
    leftUpperArm: [0, 0, -75],
    leftLowerArm: [0, -10, 0],
    spine: [0, -6, 0],
  },
  // right arm bends over the head into a frame, left arm straight out
  vogue_l: {
    rightUpperArm: [0, 0, -72],
    rightLowerArm: [0, 0, -62],
    leftUpperArm: [0, 0, 2],
    leftLowerArm: [0, -5, 0],
    spine: [0, -8, -3],
  },
  // both arms low to HER right (screen-left), one in front and one behind;
  // hips counter-sway to her left
  floss_l: {
    rightUpperArm: [0, 35, 50],
    rightLowerArm: [0, 0, -5],
    leftUpperArm: [0, 35, -140],
    leftLowerArm: [0, 0, -5],
    hipsX: 0.1,
    spine: [0, -12, 18],
  },
  // hips to HER right (screen-left), torso counter-leans so the shoulders
  // stay centered instead of the whole avatar sliding sideways
  hip_l: {
    hipsX: -0.11,
    spine: [0, 0, -20],
    chest: [0, 0, -5],
    leftUpperArm: [0, -15, -55],
    rightUpperArm: [0, 15, 55],
    leftLowerArm: [0, 0, -80],
    rightLowerArm: [0, 0, 80],
  },
  // right arm up-out, left forearm across the face, head bowed to her right
  dab_l: {
    rightUpperArm: [0, -10, -50],
    rightLowerArm: [0, 0, -5],
    leftUpperArm: [0, -35, 50],
    leftLowerArm: [0, 0, 130],
    head: [35, 0, 20],
    spine: [22, -8, 10],
    chest: [22, 0, 5],
  },
};

const SYMMETRIC = {
  arms_up: {
    leftUpperArm: [0, 0, 78],
    rightUpperArm: [0, 0, -78],
    leftLowerArm: [0, 0, 5],
    rightLowerArm: [0, 0, -5],
    hipsY: 0.01,
  },
  jack: {
    leftUpperArm: [0, 0, 62],
    rightUpperArm: [0, 0, -62],
    leftUpperLeg: [0, 0, 18],
    rightUpperLeg: [0, 0, -18],
    hipsY: 0.04,
  },
  squat: {
    leftUpperLeg: [-78, 0, 8],
    rightUpperLeg: [-78, 0, -8],
    leftLowerLeg: [98, 0, 0],
    rightLowerLeg: [98, 0, 0],
    leftFoot: [-20, 0, 0],
    rightFoot: [-20, 0, 0],
    spine: [22, 0, 0],
    leftUpperArm: [0, -80, -10],
    rightUpperArm: [0, 80, 10],
    leftLowerArm: [0, 0, 0],
    rightLowerArm: [0, 0, 0],
    hipsDrop: 0.32, // fraction of leg length
  },
};

// symmetric dance moves
Object.assign(SYMMETRIC, {
  hands_out: {
    leftUpperArm: [0, 0, 2],
    rightUpperArm: [0, 0, -2],
    leftLowerArm: [0, -8, 0],
    rightLowerArm: [0, 8, 0],
  },
  clap: {
    leftUpperArm: [0, -58, -30],
    leftLowerArm: [0, -88, 0],
    rightUpperArm: [0, 58, 30],
    rightLowerArm: [0, 88, 0],
  },
  heart: {
    leftUpperArm: [0, 0, 75],
    rightUpperArm: [0, 0, -75],
    leftLowerArm: [0, 0, 55],
    rightLowerArm: [0, 0, -55],
    head: [-8, 0, 0],
  },
  bounce: {
    leftUpperLeg: [-34, 0, 6],
    rightUpperLeg: [-34, 0, -6],
    leftLowerLeg: [50, 0, 0],
    rightLowerLeg: [50, 0, 0],
    leftUpperArm: [0, -20, -55],
    rightUpperArm: [0, 20, 55],
    leftLowerArm: [0, -25, 0],
    rightLowerArm: [0, 25, 0],
    hipsDrop: 0.12,
  },
});

export const POSES = { ...SYMMETRIC };
for (const [move, pose] of Object.entries(LEFT_DEFS)) {
  POSES[move] = pose;
  POSES[move.replace(/_l$/, "_r")] = mirrorPose(pose);
}

/** Every bone driven by any pose (hips handled separately via hipsY/hipsDrop). */
export const ALL_BONES = [
  ...new Set([
    READY, ...Object.values(POSES),
    ...Object.values(MOTIONS).flatMap((keys) => keys.map((key) => key.pose)),
  ].flatMap((p) => Object.keys(p).filter((k) => Array.isArray(p[k])))),
];

export const ease = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

/**
 * Pose weights at song time t.
 * @returns {{prev: note|null, wPrev: number, next: note|null, wNext: number}}
 *   final pose = blend(blend(READY, prev, wPrev), next, wNext)
 */
export function poseWeights(notes, t, cursor = 0) {
  let i = Math.max(0, Math.min(cursor, notes.length));
  while (i > 0 && notes[i - 1].t > t) i--;
  while (i < notes.length && notes[i].t <= t) i++;
  const prev = notes[i - 1] ?? null;
  const next = notes[i] ?? null;

  let wPrev = 0;
  let prevEnd = -Infinity;
  if (prev) {
    prevEnd = prev.t + Math.max(prev.hold, 0.12);
    const gap = next ? next.t - prevEnd : Infinity;
    const release = Math.max(0.12, Math.min(0.35, gap * 0.5));
    wPrev = t <= prevEnd ? 1 : 1 - ease((t - prevEnd) / release);
  }
  let wNext = 0;
  if (next) {
    const room = next.t - Math.max(prevEnd, next.t - 1);
    const approach = Math.max(0.15, Math.min(0.42, room * 0.6));
    wNext = ease((t - (next.t - approach)) / approach);
  }
  return { prev, wPrev, next, wNext, cursor: i };
}
