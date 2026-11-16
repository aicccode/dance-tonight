// Multi-beat dance choreography. Times are normalized within each note; the
// catalog supplies the beat duration. All left variants are player-left, so the
// coach uses her right side and the generated _r variants are exact mirrors.
import { makeMotion, mirrorMotion, sampleKeys } from "./motion.js";

const LEG_L = [0, 0, 2], LEG_R = [0, 0, -2];
const KNEE = [0, 0, 0];

const SOFT_ARMS = {
  leftUpperArm: [0, -18, -58], rightUpperArm: [0, 18, 58],
  leftLowerArm: [0, -24, 0], rightLowerArm: [0, 24, 0],
};
const WAIST_ARMS = {
  leftUpperArm: [0, -15, -55], rightUpperArm: [0, 15, 55],
  leftLowerArm: [0, 0, -80], rightLowerArm: [0, 0, 80],
};
const SOFT_LEGS = {
  leftUpperLeg: [-10, 0, 3], rightUpperLeg: [-10, 0, -3],
  leftLowerLeg: [18, 0, 0], rightLowerLeg: [18, 0, 0],
};

const WAVE_BASE = {
  ...SOFT_ARMS, spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0],
  leftUpperLeg: LEG_L, rightUpperLeg: LEG_R,
  leftLowerLeg: KNEE, rightLowerLeg: KNEE,
  hipsZ: 0, hipsDrop: 0, turn: 0,
};
const ROLL_BASE = {
  ...WAIST_ARMS, ...SOFT_LEGS, spine: [10, 0, 0], chest: [5, 0, 0],
  hipsX: 0, hipsZ: 0.07, hipsDrop: 0.05, turn: 0,
};
const ARM_WAVE_BASE = {
  rightUpperArm: [0, 0, -5], rightLowerArm: [0, 0, 0], rightHand: [0, 0, 0],
  leftUpperArm: WAIST_ARMS.leftUpperArm, leftLowerArm: WAIST_ARMS.leftLowerArm,
  spine: [0, 0, 0], chest: [0, 0, 0], turn: 0,
};
const POP_BASE = {
  leftUpperArm: [0, -52, -32], rightUpperArm: [0, 52, 32],
  leftLowerArm: [0, -72, 0], rightLowerArm: [0, 72, 0],
  ...SOFT_LEGS, spine: [0, 0, 0], chest: [0, 0, 0],
  hipsZ: 0, hipsDrop: 0.04, turn: 0,
};
const SHOULDER_BASE = {
  leftUpperArm: [0, -45, -38], rightUpperArm: [0, 45, 38],
  leftLowerArm: [0, -82, 0], rightLowerArm: [0, 82, 0],
  leftShoulder: [0, 0, 0], rightShoulder: [0, 0, 0],
  chest: [0, 0, 0], head: [0, 0, 0], ...SOFT_LEGS, hipsDrop: 0.04, turn: 0,
};
const STEP_BASE = {
  ...SOFT_ARMS, leftUpperLeg: LEG_L, rightUpperLeg: LEG_R,
  leftLowerLeg: KNEE, rightLowerLeg: KNEE,
  spine: [0, 0, 0], hipsX: 0, hipsDrop: 0.02, turn: 0,
};
const GRAPE_BASE = {
  leftUpperArm: [0, -12, -12], rightUpperArm: [0, 12, 12],
  leftLowerArm: [0, -15, 0], rightLowerArm: [0, 15, 0],
  leftUpperLeg: LEG_L, rightUpperLeg: LEG_R,
  leftLowerLeg: KNEE, rightLowerLeg: KNEE,
  spine: [0, 0, 0], hipsX: 0, hipsDrop: 0.04, turn: 0,
};
const TURN_BASE = {
  ...SOFT_ARMS, leftUpperLeg: LEG_L, rightUpperLeg: LEG_R,
  leftLowerLeg: KNEE, rightLowerLeg: KNEE,
  spine: [0, 0, 0], hipsDrop: 0.02, turn: 0,
};
const TURN_SPIN = {
  leftUpperArm: [0, -55, -35], rightUpperArm: [0, 55, 35],
  leftLowerArm: [0, -70, 0], rightLowerArm: [0, 70, 0],
  leftUpperLeg: LEG_L, rightUpperLeg: [-28, 0, -8],
  leftLowerLeg: KNEE, rightLowerLeg: [38, 0, 0],
  spine: [0, -8, 0], hipsDrop: 0.08,
};
const BACK_BASE = {
  ...SOFT_ARMS, ...SOFT_LEGS, spine: [0, 0, 0], chest: [0, 0, 0], head: [0, 0, 0],
  hipsZ: 0, hipsDrop: 0.04, turn: 0,
};
const BACK_HOLD = {
  leftUpperArm: [0, 35, -35], rightUpperArm: [0, -35, 35],
  leftLowerArm: [0, -45, 0], rightLowerArm: [0, 45, 0],
  leftUpperLeg: [-16, 0, 3], rightUpperLeg: [-16, 0, -3],
  leftLowerLeg: [28, 0, 0], rightLowerLeg: [28, 0, 0],
  spine: [-5, 0, 0], chest: [-4, 0, 0], head: [0, 0, 0],
  hipsZ: 0, hipsDrop: 0.07,
};

const LEFT = {
  arm_wave_l: [
    { at: 0, pose: ARM_WAVE_BASE },
    { at: 0.25, pose: { rightUpperArm: [0, -12, -28], rightLowerArm: [0, 0, 35], rightHand: [0, 0, 22], chest: [0, -8, 0] } },
    { at: 0.5, pose: { rightUpperArm: [0, 10, 8], rightLowerArm: [0, 0, -42], rightHand: [0, 0, -25], chest: [0, 8, 0] } },
    { at: 0.75, pose: { rightUpperArm: [0, -15, -30], rightLowerArm: [0, 0, 30], rightHand: [0, 0, 20], chest: [0, -6, 0] } },
    { at: 1, pose: ARM_WAVE_BASE },
  ],
  step_touch_l: [
    { at: 0, pose: STEP_BASE },
    { at: 0.3, pose: { hipsX: -0.13, rightUpperLeg: [-12, 0, -20], rightLowerLeg: [24, 0, 0], leftUpperArm: [0, -25, -35], rightUpperArm: [0, 15, 35], spine: [0, -8, -4] } },
    { at: 0.58, pose: { hipsX: -0.16, rightUpperLeg: [0, 0, -4], rightLowerLeg: KNEE, leftUpperLeg: [-8, 0, -14], leftLowerLeg: [22, 0, 0], leftUpperArm: [0, -10, -65], rightUpperArm: [0, 30, 40], spine: [0, 8, 3] } },
    { at: 0.82, pose: { hipsX: -0.05, leftUpperLeg: LEG_L, leftLowerLeg: KNEE, spine: [0, 0, 0] } },
    { at: 1, pose: STEP_BASE },
  ],
  grapevine_l: [
    { at: 0, pose: GRAPE_BASE },
    { at: 0.2, pose: { hipsX: -0.12, turn: -15, rightUpperLeg: [-12, 0, -20], rightLowerLeg: [22, 0, 0], spine: [0, -12, 0] } },
    { at: 0.45, pose: { hipsX: -0.16, turn: 15, rightUpperLeg: LEG_R, rightLowerLeg: KNEE, leftUpperLeg: [-18, 25, -12], leftLowerLeg: [35, 0, 0], spine: [0, 18, 0] } },
    { at: 0.7, pose: { hipsX: -0.22, turn: -10, leftUpperLeg: LEG_L, leftLowerLeg: KNEE, rightUpperLeg: [-12, 0, -18], rightLowerLeg: [24, 0, 0], spine: [0, -12, 0] } },
    { at: 0.88, pose: { hipsX: -0.08, turn: 0, rightUpperLeg: LEG_R, rightLowerLeg: KNEE, leftUpperLeg: [-8, 0, -10], leftLowerLeg: [20, 0, 0], spine: [0, 0, 0] } },
    { at: 1, pose: GRAPE_BASE },
  ],
  turn_l: [
    { at: 0, pose: TURN_BASE },
    { at: 0.1, pose: { ...TURN_SPIN, turn: 0 } },
    { at: 0.25, pose: { ...TURN_SPIN, turn: 90 } },
    { at: 0.5, pose: { ...TURN_SPIN, turn: 180 } },
    { at: 0.75, pose: { ...TURN_SPIN, turn: 270 } },
    { at: 0.9, pose: { ...TURN_SPIN, turn: 360 } },
    { at: 1, pose: { ...TURN_BASE, turn: 360 } },
  ],
};

const SYMMETRIC = {
  body_wave: [
    { at: 0, pose: WAVE_BASE },
    { at: 0.18, pose: { head: [10, 0, 0], chest: [14, 0, 0], spine: [6, 0, 0], hipsZ: 0.06, hipsDrop: 0.02 } },
    { at: 0.42, pose: { head: [-6, 0, 0], chest: [-10, 0, 0], spine: [-14, 0, 0], hipsZ: -0.06, hipsDrop: 0.1, leftUpperLeg: [-24, 0, 4], rightUpperLeg: [-24, 0, -4], leftLowerLeg: [40, 0, 0], rightLowerLeg: [40, 0, 0] } },
    { at: 0.68, pose: { head: [4, 0, 0], chest: [10, 0, 0], spine: [12, 0, 0], hipsZ: 0.08, hipsDrop: 0.05, leftUpperArm: [0, -55, -45], rightUpperArm: [0, 55, 45] } },
    { at: 0.86, pose: { head: [0, 0, 0], chest: [-4, 0, 0], spine: [-6, 0, 0], hipsZ: -0.03, hipsDrop: 0.03 } },
    { at: 1, pose: WAVE_BASE },
  ],
  body_roll: [
    { at: 0, pose: ROLL_BASE },
    { at: 0.25, pose: { hipsX: -0.12, hipsZ: 0, spine: [0, 0, -16], chest: [0, 0, -8] } },
    { at: 0.5, pose: { hipsX: 0, hipsZ: -0.08, spine: [-12, 0, 0], chest: [-6, 0, 0] } },
    { at: 0.75, pose: { hipsX: 0.12, hipsZ: 0, spine: [0, 0, 16], chest: [0, 0, 8] } },
    { at: 1, pose: ROLL_BASE },
  ],
  chest_pop: [
    { at: 0, pose: POP_BASE },
    { at: 0.18, pose: { chest: [18, 0, 0], spine: [-4, 0, 0], hipsZ: 0.04, hipsDrop: 0.03 } },
    { at: 0.38, pose: { chest: [-8, 0, 0], spine: [4, 0, 0], hipsZ: -0.03, hipsDrop: 0.1 } },
    { at: 0.58, pose: { chest: [16, 0, 0], spine: [-4, 0, 0], hipsZ: 0.04, hipsDrop: 0.03 } },
    { at: 0.8, pose: { chest: [-4, 0, 0], spine: [2, 0, 0], hipsZ: -0.02, hipsDrop: 0.08 } },
    { at: 1, pose: POP_BASE },
  ],
  shoulder_roll: [
    { at: 0, pose: SHOULDER_BASE },
    { at: 0.25, pose: { leftShoulder: [18, 0, 12], rightShoulder: [-8, 0, -6], chest: [0, -10, 4], head: [0, 0, -5] } },
    { at: 0.5, pose: { leftShoulder: [-12, 0, -8], rightShoulder: [16, 0, 10], chest: [0, 10, -4], head: [0, 0, 5] } },
    { at: 0.75, pose: { leftShoulder: [14, 0, 10], rightShoulder: [-10, 0, -8], chest: [0, -8, 3], head: [0, 0, -4] } },
    { at: 1, pose: SHOULDER_BASE },
  ],
  back_wave: [
    { at: 0, pose: BACK_BASE },
    { at: 0.25, pose: { ...BACK_HOLD, turn: 180 } },
    { at: 0.42, pose: { head: [-8, 0, 0], chest: [-12, 0, 0], spine: [-14, 0, 0], hipsZ: -0.07, hipsDrop: 0.11, turn: 180 } },
    { at: 0.62, pose: { head: [8, 0, 0], chest: [12, 0, 0], spine: [10, 0, 0], hipsZ: 0.07, hipsDrop: 0.06, leftUpperArm: [0, 20, -55], rightUpperArm: [0, -20, 55], turn: 180 } },
    { at: 0.75, pose: { ...BACK_HOLD, turn: 180 } },
    { at: 1, pose: { ...BACK_BASE, turn: 360 } },
  ],
};

export const MOTIONS = Object.fromEntries([
  ...Object.entries(SYMMETRIC).map(([id, keys]) => [id, makeMotion(keys)]),
  ...Object.entries(LEFT).flatMap(([id, keys]) => {
    const motion = makeMotion(keys);
    return [[id, motion], [`${id.slice(0, -2)}_r`, mirrorMotion(motion)]];
  }),
]);

export function sampleMotion(id, phase) {
  return sampleKeys(MOTIONS[id], phase);
}
