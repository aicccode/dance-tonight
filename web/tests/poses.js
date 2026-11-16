// Synthetic MediaPipe-like landmarks (raw camera image, player's left = +x).
import { LM } from "../js/features.js";

const STAND = {
  [LM.NOSE]: [0.5, 0.15],
  [LM.LS]: [0.58, 0.3], [LM.RS]: [0.42, 0.3],
  [LM.LE]: [0.6, 0.42], [LM.RE]: [0.4, 0.42],
  [LM.LW]: [0.6, 0.53], [LM.RW]: [0.4, 0.53],
  [LM.LH]: [0.55, 0.58], [LM.RH]: [0.45, 0.58],
  [LM.LK]: [0.55, 0.75], [LM.RK]: [0.45, 0.75],
  [LM.LA]: [0.55, 0.92], [LM.RA]: [0.45, 0.92],
};

export function pose(overrides = {}, visibility = 0.99) {
  const pts = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility }));
  for (const [i, [x, y]] of Object.entries({ ...STAND, ...overrides })) {
    pts[i] = { x, y, visibility };
  }
  return pts;
}

/** Shift several landmarks by (dx, dy). */
export function shift(ids, dx, dy, base = STAND) {
  return Object.fromEntries(ids.map((i) => [i, [base[i][0] + dx, base[i][1] + dy]]));
}

export const UPPER = [LM.NOSE, LM.LS, LM.RS, LM.LE, LM.RE, LM.LW, LM.RW, LM.LH, LM.RH];

export const POSES = {
  stand: pose(),
  arms_up: pose({ [LM.LW]: [0.62, 0.05], [LM.RW]: [0.38, 0.05], [LM.LE]: [0.62, 0.18], [LM.RE]: [0.38, 0.18] }),
  punch_l: pose({ [LM.LE]: [0.7, 0.3], [LM.LW]: [0.83, 0.31] }),
  punch_r: pose({ [LM.RE]: [0.3, 0.3], [LM.RW]: [0.17, 0.31] }),
  squat: pose({
    ...shift([LM.NOSE, LM.LS, LM.RS, LM.LE, LM.RE, LM.LW, LM.RW], 0, 0.06),
    [LM.LH]: [0.55, 0.7], [LM.RH]: [0.45, 0.7],
    [LM.LK]: [0.63, 0.72], [LM.RK]: [0.37, 0.72],
    [LM.LA]: [0.63, 0.92], [LM.RA]: [0.37, 0.92],
  }),
  knee_l: pose({ [LM.LK]: [0.56, 0.6], [LM.LA]: [0.56, 0.75] }),
  knee_r: pose({ [LM.RK]: [0.44, 0.6], [LM.RA]: [0.44, 0.75] }),
  jack: pose({
    [LM.LW]: [0.7, 0.1], [LM.RW]: [0.3, 0.1], [LM.LE]: [0.66, 0.2], [LM.RE]: [0.34, 0.2],
    [LM.LA]: [0.7, 0.92], [LM.RA]: [0.3, 0.92], [LM.LK]: [0.62, 0.75], [LM.RK]: [0.38, 0.75],
  }),
  // left knee up and across, right elbow down to it
  cross_l: pose({ [LM.LK]: [0.5, 0.58], [LM.LA]: [0.53, 0.72], [LM.RE]: [0.47, 0.5], [LM.RW]: [0.5, 0.4] }),
  cross_r: pose({ [LM.RK]: [0.5, 0.58], [LM.RA]: [0.47, 0.72], [LM.LE]: [0.53, 0.5], [LM.LW]: [0.5, 0.4] }),
  // ---- dance poses ----
  // left arm slanted up-out, right arm down
  disco_l: pose({ [LM.LE]: [0.64, 0.14], [LM.LW]: [0.72, 0.02], [LM.RE]: [0.41, 0.42], [LM.RW]: [0.4, 0.53] }),
  // both arms horizontal at shoulder height
  hands_out: pose({ [LM.LE]: [0.67, 0.3], [LM.LW]: [0.75, 0.31], [LM.RE]: [0.33, 0.3], [LM.RW]: [0.25, 0.31] }),
  // wrists together in front at chest height
  clap: pose({ [LM.LE]: [0.56, 0.36], [LM.LW]: [0.5, 0.3], [LM.RE]: [0.44, 0.36], [LM.RW]: [0.5, 0.3] }),
  // wrists together above head
  heart: pose({ [LM.LE]: [0.56, 0.16], [LM.LW]: [0.52, 0.02], [LM.RE]: [0.44, 0.16], [LM.RW]: [0.48, 0.03] }),
  // left arm overhead, right arm straight out
  vogue_l: pose({ [LM.LE]: [0.6, 0.12], [LM.LW]: [0.62, 0.0], [LM.RE]: [0.33, 0.3], [LM.RW]: [0.25, 0.31] }),
  // arms swung to player's left (raw +x), hips shifted to player's right
  floss_l: pose({
    [LM.LW]: [0.72, 0.45], [LM.LE]: [0.64, 0.42], [LM.LS]: [0.58, 0.3],
    [LM.RW]: [0.52, 0.45], [LM.RE]: [0.44, 0.4],
    [LM.LH]: [0.47, 0.58], [LM.RH]: [0.37, 0.58], [LM.LK]: [0.47, 0.75], [LM.RK]: [0.37, 0.75],
  }),
  // hips shifted to player's left
  hip_sway_l: pose({
    [LM.LH]: [0.62, 0.58], [LM.RH]: [0.52, 0.58], [LM.LK]: [0.62, 0.75], [LM.RK]: [0.52, 0.75],
    [LM.LA]: [0.62, 0.92], [LM.RA]: [0.52, 0.92],
  }),
  // left arm up-out, right forearm across the face, head leaned left
  dab_l: pose({
    [LM.LE]: [0.64, 0.2], [LM.LW]: [0.68, 0.12],
    [LM.NOSE]: [0.58, 0.34],
    [LM.LS]: [0.64, 0.31], [LM.RS]: [0.48, 0.31],
    [LM.RE]: [0.4, 0.4], [LM.RW]: [0.58, 0.3],
  }),
  // hinge forward, hands down by the ankles
  toe_touch: pose({
    [LM.NOSE]: [0.55, 0.56],
    [LM.LS]: [0.62, 0.52], [LM.RS]: [0.5, 0.52],
    [LM.LE]: [0.66, 0.62], [LM.RE]: [0.46, 0.62],
    [LM.LW]: [0.55, 0.88], [LM.RW]: [0.45, 0.88],
  }),
  // left knee swung out to the side at hip height
  knee_out_l: pose({
    [LM.LK]: [0.72, 0.56], [LM.LA]: [0.72, 0.66],
    [LM.LW]: [0.68, 0.42], [LM.LE]: [0.62, 0.4],
  }),
  // left leg kicked straight forward, foot above hip height
  kick_l: pose({
    [LM.LK]: [0.585, 0.5], [LM.LA]: [0.62, 0.42],
    [LM.LW]: [0.7, 0.2], [LM.LE]: [0.64, 0.28],
  }),
  // knees softly bent
  bounce: pose({ [LM.LK]: [0.55, 0.71], [LM.RK]: [0.45, 0.71], [LM.LA]: [0.55, 0.88], [LM.RA]: [0.45, 0.88] }),
  // lean torso toward player's left (+x), right arm overhead
  bend_l: pose({
    ...shift([LM.NOSE, LM.LS, LM.RS, LM.LE, LM.LW], 0.08, 0.01),
    [LM.RE]: [0.5, 0.2], [LM.RW]: [0.58, 0.08],
  }),
  bend_r: pose({
    ...shift([LM.NOSE, LM.LS, LM.RS, LM.RE, LM.RW], -0.08, 0.01),
    [LM.LE]: [0.5, 0.2], [LM.LW]: [0.42, 0.08],
  }),
};
