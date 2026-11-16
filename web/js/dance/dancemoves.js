// Dance move catalog: matchers (features -> 0..1) and screen UI.
// Coach poses live in choreo.js; voice lines in core/cues.js; keep this file
// dependency-free (judge.js imports it).

const ramp = (v, lo, hi) => {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
};

/** Player's-left pose (side _l always means the PLAYER's left). */
export const DANCE_MOVES = {
  disco_l: { name: "迪斯科指天", pair: "disco_r", icon: "☝️", arrow: "←", zone: [0.16, 0.2], color: "#ff6b9d", tip: "左臂斜向上指，右手放低，跟着节拍点" },
  disco_r: { name: "迪斯科指天", pair: "disco_l", icon: "☝️", arrow: "→", zone: [0.84, 0.2], color: "#ff6b9d", tip: "右臂斜向上指，左手放低，跟着节拍点" },
  hands_out: { name: "双手外展", pair: null, icon: "👐", zone: [0.5, 0.45], color: "#4cc9f0", tip: "双臂向两侧平举，与肩同高" },
  clap: { name: "踏步拍手", pair: null, icon: "👏", zone: [0.5, 0.55], color: "#f72585", tip: "双手在胸前拍在一起，可以原地踏步" },
  heart: { name: "双手比心", pair: null, icon: "❤️", zone: [0.5, 0.18], color: "#ff4d6d", tip: "双手举过头顶并在头顶合在一起" },
  vogue_l: { name: "时尚造型", pair: "vogue_r", icon: "💃", arrow: "←", zone: [0.2, 0.24], color: "#c77dff", tip: "左手举过头顶弯成框，右手向右侧平伸" },
  vogue_r: { name: "时尚造型", pair: "vogue_l", icon: "💃", arrow: "→", zone: [0.8, 0.24], color: "#c77dff", tip: "右手举过头顶弯成框，左手向左侧平伸" },
  floss_l: { name: "甩手", pair: "floss_r", icon: "🌊", arrow: "←", zone: [0.18, 0.55], color: "#06d6a0", tip: "双臂一起甩向左侧，胯向右侧顶" },
  floss_r: { name: "甩手", pair: "floss_l", icon: "🌊", arrow: "→", zone: [0.82, 0.55], color: "#06d6a0", tip: "双臂一起甩向右侧，胯向左侧顶" },
  hip_l: { name: "扭胯", pair: "hip_r", icon: "🌀", arrow: "←", zone: [0.28, 0.62], color: "#ffd166", tip: "胯向左侧顶出去，手可以叉腰" },
  hip_r: { name: "扭胯", pair: "hip_l", icon: "🌀", arrow: "→", zone: [0.72, 0.62], color: "#ffd166", tip: "胯向右侧顶出去，手可以叉腰" },
  dab_l: { name: "达布", pair: "dab_r", icon: "🙆", arrow: "↙", zone: [0.2, 0.3], color: "#90e0ef", tip: "左臂向斜上方举起，头向左臂方向低下去" },
  dab_r: { name: "达布", pair: "dab_l", icon: "🙆", arrow: "↘", zone: [0.8, 0.3], color: "#90e0ef", tip: "右臂向斜上方举起，头向右臂方向低下去" },
  bounce: { name: "弹跳律动", pair: null, icon: "🕺", zone: [0.5, 0.72], color: "#b5e48c", tip: "双膝微屈，跟着节拍上下弹动" },
  body_wave: { name: "身体波浪", pair: null, icon: "🌊", zone: [0.5, 0.48], color: "#48cae4", beats: 4, guided: true, tip: "四拍身体波浪：从胸口到髋部逐节传递", steps: ["头胸先向前引领", "胸口下沉、膝盖微屈", "髋部向前把波浪送回去", "从腿到躯干逐节伸展"] },
  body_roll: { name: "身体绕环", pair: null, icon: "⭕", zone: [0.5, 0.5], color: "#80ed99", beats: 4, guided: true, tip: "胯部绕环，上身反向保持线条", steps: ["重心前移，胸口打开", "胯向左侧，上身向右保持延伸", "重心后移，背部保持圆顺", "胯向右侧回到前方，连成圆圈"] },
  arm_wave_l: { name: "左臂波浪", pair: "arm_wave_r", icon: "〰️", arrow: "←", zone: [0.2, 0.34], color: "#64dfdf", beats: 2, guided: true, tip: "左肩、肘、腕依次接力", steps: ["左肩提起，手臂向左侧延伸", "左肘先起，手腕自然下垂", "肘部落下，手腕向外送", "指尖延伸后放松回收"] },
  arm_wave_r: { name: "右臂波浪", pair: "arm_wave_l", icon: "〰️", arrow: "→", zone: [0.8, 0.34], color: "#64dfdf", beats: 2, guided: true, tip: "右肩、肘、腕依次接力", steps: ["右肩提起，手臂向右侧延伸", "右肘先起，手腕自然下垂", "肘部落下，手腕向外送", "指尖延伸后放松回收"] },
  chest_pop: { name: "胸口震点", pair: null, icon: "💥", zone: [0.5, 0.36], color: "#ff70a6", beats: 2, guided: true, tip: "屈膝放松，胸口前后做两次震点", steps: ["屈膝放松，双手守在胸前", "胸口快速向前弹出", "胸口回收，背部拉开", "再弹一次，停稳在重拍"] },
  shoulder_roll: { name: "肩膀绕环", pair: null, icon: "🎡", zone: [0.5, 0.26], color: "#b388ff", beats: 2, guided: true, tip: "双肩交替绕环，手臂保持松弛", steps: ["左肩向前上提", "右肩接力，胸口轻微转动", "左肩向后落下", "双肩连成交替滚动"] },
  step_touch_l: { name: "左侧并步", pair: "step_touch_r", icon: "👣", arrow: "←", zone: [0.24, 0.7], color: "#ffd166", beats: 2, guided: true, tip: "左脚侧踏，右脚轻点并拢", steps: ["左脚向侧后方踏出", "重心推到左侧，双臂打开", "右脚收回轻点", "膝盖弹动，准备换方向"] },
  step_touch_r: { name: "右侧并步", pair: "step_touch_l", icon: "👣", arrow: "→", zone: [0.76, 0.7], color: "#ffd166", beats: 2, guided: true, tip: "右脚侧踏，左脚轻点并拢", steps: ["右脚向侧后方踏出", "重心推到右侧，双臂打开", "左脚收回轻点", "膝盖弹动，准备换方向"] },
  grapevine_l: { name: "左侧交叉步", pair: "grapevine_r", icon: "🍇", arrow: "←", zone: [0.2, 0.68], color: "#ff9770", beats: 4, guided: true, tip: "向左侧走交叉步：侧踏、后交叉、再侧踏、点地", steps: ["左脚侧踏，身体略转向侧面", "右脚从后方交叉", "左脚再次侧踏", "右脚点地并回到正面"] },
  grapevine_r: { name: "右侧交叉步", pair: "grapevine_l", icon: "🍇", arrow: "→", zone: [0.8, 0.68], color: "#ff9770", beats: 4, guided: true, tip: "向右侧走交叉步：侧踏、后交叉、再侧踏、点地", steps: ["右脚侧踏，身体略转向侧面", "左脚从后方交叉", "右脚再次侧踏", "左脚点地并回到正面"] },
  turn_l: { name: "向左旋转", pair: "turn_r", icon: "🔄", arrow: "↺", zone: [0.28, 0.42], color: "#f15bb5", beats: 4, guided: true, tip: "四拍向左转完一圈，经过侧面和背面", steps: ["右脚站稳，左肩蓄力", "左肩带动向左转，经过侧面", "继续转过背面，左膝轻轻收起", "转完 360°，左脚落地回正"] },
  turn_r: { name: "向右旋转", pair: "turn_l", icon: "🔃", arrow: "↻", zone: [0.72, 0.42], color: "#f15bb5", beats: 4, guided: true, tip: "四拍向右转完一圈，经过侧面和背面", steps: ["左脚站稳，右肩蓄力", "右肩带动向右转，经过侧面", "继续转过背面，右膝轻轻收起", "转完 360°，右脚落地回正"] },
  back_wave: { name: "背身波浪", pair: null, icon: "🌙", zone: [0.5, 0.46], color: "#9b5de5", beats: 4, guided: true, tip: "转到背面停留做波浪，再同方向转回正面", steps: ["第一拍转到背面，双脚站稳", "背对镜头，胸口和背部向前引领", "保持背面，让波浪传递到髋部", "最后一拍继续同方向转身回正"] },
};

export const moveHold = (move, bpm) =>
  DANCE_MOVES[move]?.seconds ?? (DANCE_MOVES[move]?.beats ?? 0) * 60 / bpm; // clips keep their own length

/** Teaching steps for a guided motion, selected by its normalized phase. */
export function guidedTip(move, phase = 0) {
  const m = DANCE_MOVES[move];
  if (!m?.guided) return m?.tip ?? "";
  const p = Math.max(0, Math.min(0.999999, Number.isFinite(phase) ? phase : 0));
  const i = Math.min(m.steps.length - 1, Math.floor(p * m.steps.length));
  return `${i + 1}/${m.steps.length} ${m.steps[i]}`;
}

/** Dance is follow-along learning: complex notes complete without a pose match. */
export function completeGuided(matches, mode) {
  if (mode !== "dance") return matches;
  const out = { ...matches };
  for (const [id, move] of Object.entries(DANCE_MOVES)) if (move.guided) out[id] = 1;
  return out;
}

export const DANCE_NAMES = Object.fromEntries(
  Object.entries(DANCE_MOVES).map(([id, m]) => [id, { name: m.name }]),
);

/** Pair lookup shared by the cue planner (falls back to the fitness catalog). */
export const dancePair = (move) => DANCE_MOVES[move]?.pair ?? null;

// Shoulder-relative height is stable across arm/torso proportions; wristUp
// additionally requires the hand to be around/above head level, not just raised.
const overhead = (f, s, lo = 0.35, hi = 0.7) =>
  Math.min(ramp(f.wristAboveShoulder[s], lo, hi), ramp(f.wristUp[s], -0.05, 0.2));

const down = (f, s, o) =>
  Math.min(overhead(f, s), ramp(f.wristUp[o], -0.05, -0.42)) *
  ramp(f.headDrop, -0.15, -0.45); // disco keeps the head up (separates it from dab)

const chest = (f, s) =>
  Math.min(ramp(f.wristUp[s], -1.25, -0.8), ramp(f.wristUp[s], -0.2, -0.5));

const dab = (f, s, o) => {
  // The opposite hand must cross the centre and sit around the face. This
  // separates dab from disco without demanding a camera-specific nose depth.
  const faceHand = ramp(f.wristAboveShoulder[o], -0.35, -0.05) *
    ramp(f.wristAboveShoulder[o], 0.65, 0.4);
  // A dab may lean the whole torso or bow only the head toward the raised arm.
  const bow = Math.max(ramp(f.tilt[s], 3, 11), ramp(f.headDrop, -0.05, 0.1));
  return ramp(f.wristAboveShoulder[s], 0.3, 0.5) * bow *
    ramp(-f.armOut[o], -0.15, -0.05) * faceHand;
};

/** Rough energy cost (MET) per dance move, used for kcal estimation. */
export const DANCE_MET = {
  disco_l: 5.5, disco_r: 5.5, hands_out: 5.0, clap: 5.5, heart: 5.0,
  vogue_l: 5.0, vogue_r: 5.0, floss_l: 6.5, floss_r: 6.5,
  hip_l: 5.5, hip_r: 5.5, dab_l: 5.0, dab_r: 5.0, bounce: 6.0,
  body_wave: 6.0, body_roll: 6.0, arm_wave_l: 5.0, arm_wave_r: 5.0,
  chest_pop: 6.0, shoulder_roll: 5.0, step_touch_l: 5.5, step_touch_r: 5.5,
  grapevine_l: 6.0, grapevine_r: 6.0, turn_l: 6.5, turn_r: 6.5, back_wave: 6.0,
};

export const DANCE_MATCHERS = {
  disco_l: (f) => down(f, "l", "r") * (0.5 + 0.5 * ramp(f.armOut.l, 0.05, 0.3)),
  disco_r: (f) => down(f, "r", "l") * (0.5 + 0.5 * ramp(f.armOut.r, 0.05, 0.3)),
  hands_out: (f) =>
    Math.min(ramp(f.armOut.l, 0.35, 0.6), ramp(f.armOut.r, 0.35, 0.6),
      ramp(f.wristShoulderDy.l, 0.45, 0.18), ramp(f.wristShoulderDy.r, 0.45, 0.18)),
  clap: (f) =>
    ramp(f.wristGap, 0.5, 0.22) * Math.min(chest(f, "l"), chest(f, "r")),
  heart: (f) =>
    ramp(f.wristGap, 0.45, 0.2) * Math.min(overhead(f, "l"), overhead(f, "r")),
  vogue_l: (f) =>
    overhead(f, "l") * ramp(f.armOut.r, 0.35, 0.62) * ramp(f.wristShoulderDy.r, 0.4, 0.15),
  vogue_r: (f) =>
    overhead(f, "r") * ramp(f.armOut.l, 0.35, 0.62) * ramp(f.wristShoulderDy.l, 0.4, 0.15),
  floss_l: (f) =>
    ramp(f.armOut.l, 0.08, 0.32) * ramp(-f.armOut.r, 0.08, 0.32) * ramp(f.hipShift.r, 0.03, 0.1),
  floss_r: (f) =>
    ramp(f.armOut.r, 0.08, 0.32) * ramp(-f.armOut.l, 0.08, 0.32) * ramp(f.hipShift.l, 0.03, 0.1),
  hip_l: (f) => ramp(f.hipShift.l, 0.05, 0.14),
  hip_r: (f) => ramp(f.hipShift.r, 0.05, 0.14),
  dab_l: (f) => dab(f, "l", "r"),
  dab_r: (f) => dab(f, "r", "l"),
  bounce: (f) =>
    f.lowerVisible
      ? Math.min(ramp(f.thigh.l, 0.97, 0.82), ramp(f.thigh.r, 0.97, 0.82))
      : 0,
  // Guided choreography deliberately has no camera-pose requirement. Game's
  // dance path upgrades these to completion via completeGuided(); matchAll
  // itself stays pure and training/scoring behavior is unchanged.
  ...Object.fromEntries(Object.entries(DANCE_MOVES)
    .filter(([, move]) => move.guided).map(([id]) => [id, () => 0])),
};

/**
 * Replace the registered motion-capture moves (see core/clipmoves.js). Clip
 * moves live in the same tables as built-in moves so charts, practice, voice
 * and scoring treat them like any other guided move.
 */
export function registerClipMoves(defs) {
  for (const table of [DANCE_MOVES, DANCE_NAMES, DANCE_MET]) {
    for (const id of Object.keys(table)) if (id.startsWith("clip:")) delete table[id];
  }
  for (const [id, def] of Object.entries(defs)) {
    DANCE_MOVES[id] = def;
    DANCE_NAMES[id] = { name: def.name };
    DANCE_MET[id] = 5.5; // flowing full-body dance
  }
}

