// Dance routines: fixed choreography over a song's beats, plus the plan/meta
// used by the game engine. Each segment is one 8-beat phrase pattern
// (move id or null per beat); phrases cycle through the segments for the
// whole song, so a routine always fits any song length.
import { LEAD_IN_S, TAIL_S, PHRASE_BEATS } from "./chart.js";
import { DANCE_MOVES, moveHold } from "../dance/dancemoves.js";

export const ROUTINES = [
  {
    id: "disco_groove",
    name: "星光律动",
    desc: "迪斯科入门：指天、拍手、摆胯，动作大、节奏清楚",
    bpm: [95, 128],
    segments: [
      { name: "指天", pattern: ["disco_l", null, "disco_l", null, "disco_r", null, "disco_r", null] },
      { name: "拍手", pattern: ["clap", null, "clap", null, "clap", null, "hands_out", null] },
      { name: "摆胯", pattern: ["hip_l", null, "hip_r", null, "hip_l", null, "hip_r", null] },
      { name: "组合", pattern: ["disco_l", null, "disco_r", null, "floss_l", "floss_r", "heart", null] },
    ],
  },
  {
    id: "street_swag",
    name: "街区摇摆",
    desc: "街头风进阶：甩手、时尚造型、达布，适合快歌",
    bpm: [120, 155],
    segments: [
      { name: "甩手", pattern: ["floss_l", null, "floss_r", null, "floss_l", null, "floss_r", null] },
      { name: "造型", pattern: ["vogue_l", null, "vogue_l", null, "vogue_r", null, "vogue_r", null] },
      { name: "律动", pattern: ["bounce", null, "bounce", null, "dab_l", null, "dab_r", null] },
      { name: "组合", pattern: ["clap", "clap", "hands_out", null, "dab_l", "dab_r", "heart", null] },
    ],
  },
  {
    id: "fluid_flow",
    name: "流光身段",
    desc: "流畅线条进阶：手臂 wave、身体 rolling、胸肩 isolation 与背身组合",
    bpm: [85, 115],
    segments: [
      { name: "手臂波浪", pattern: ["arm_wave_l", null, "arm_wave_r", null, "arm_wave_l", null, "arm_wave_r", null] },
      { name: "身体线条", pattern: ["body_wave", null, null, null, "body_roll", null, null, null] },
      { name: "胸肩控制", pattern: ["chest_pop", null, "shoulder_roll", null, "chest_pop", null, "shoulder_roll", null] },
      { name: "背身组合", pattern: ["step_touch_l", null, "step_touch_r", null, "back_wave", null, null, null] },
    ],
  },
  {
    id: "turn_stage",
    name: "旋转舞台",
    desc: "空间感进阶：并步、交叉步、完整 360° 转身和背身波浪",
    bpm: [95, 125],
    segments: [
      { name: "并步", pattern: ["step_touch_l", null, "step_touch_r", null, "step_touch_l", null, "step_touch_r", null] },
      { name: "交叉步", pattern: ["grapevine_l", null, null, null, "grapevine_r", null, null, null] },
      { name: "旋转", pattern: ["turn_l", null, null, null, "turn_r", null, null, null] },
      { name: "波浪收尾", pattern: ["body_wave", null, null, null, "back_wave", null, null, null] },
    ],
  },
];

export const DANCE_MIN_INTERVAL_S = 0.25;

export function dancePlan() {
  return {
    day: 0, phase: "舞蹈表演", level: 2, beats_per_note: 1, minutes: 0, hold_prob: 0,
    min_interval_s: DANCE_MIN_INTERVAL_S, recovery: false,
    focus: "跟着教练把这段舞完整跳下来，动作越大越帅",
    target_accuracy: 0.7, met: 6.5,
  };
}

function firstBeatIndex(beats, downbeats) {
  const down = new Set(downbeats);
  let i = beats.findIndex((t) => t >= LEAD_IN_S && (down.size === 0 || down.has(t)));
  if (i < 0) i = beats.findIndex((t) => t >= LEAD_IN_S);
  return i < 0 ? beats.length : i;
}

const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * Place a routine onto a song: phrase n uses segments[n % segments.length],
 * beat slot b takes pattern[b]. Deterministic; works with any song length.
 */
export function generateDanceChart(analysis, routine) {
  if (routine.seq) return sequenceChart(analysis, routine.seq);
  const { beats } = analysis;
  const endT = analysis.duration - TAIL_S;
  const notes = [];
  let nextFree = 0;
  const segs = routine.segments;

  let phrase = 0;
  for (let i = firstBeatIndex(beats, analysis.downbeats ?? []); i + 1 < beats.length; i += PHRASE_BEATS, phrase++) {
    const pattern = segs[phrase % segs.length].pattern;
    const len = Math.min(PHRASE_BEATS, beats.length - i);
    for (let b = 0; b < len; b++) {
      const move = pattern[b];
      const t = beats[i + b];
      if (!move || t > endT || t < nextFree) continue;
      const hold = moveHold(move, analysis.tempo);
      if (t + hold > endT) continue; // never truncate a multi-beat motion at the tail
      notes.push({ t: r3(t), move, hold: r3(hold), beat: i + b, phrase });
      nextFree = t + Math.max(hold, DANCE_MIN_INTERVAL_S);
    }
  }
  return notes;
}

/**
 * A custom sequence, danced once from the first move to the last: each move
 * starts on the first beat after the previous one ends. Returns the notes;
 * `endAt` (end of the last move) is attached to the array.
 */
export function sequenceChart(analysis, seq) {
  const { beats } = analysis;
  const endT = analysis.duration - TAIL_S;
  const notes = [];
  let i = firstBeatIndex(beats, analysis.downbeats ?? []);
  for (const move of seq) {
    if (i >= beats.length) break;
    const t = beats[i];
    const hold = moveHold(move, analysis.tempo);
    if (t + hold > endT) break; // the song is over: stop at the last complete move
    notes.push({ t: r3(t), move, hold: r3(hold), beat: i, phrase: 0 });
    const free = t + Math.max(hold, DANCE_MIN_INTERVAL_S);
    while (i < beats.length && beats[i] < free - 1e-6) i++;
  }
  const last = notes.at(-1);
  notes.endAt = last ? r3(last.t + Math.max(last.hold, 60 / analysis.tempo) + 1) : null;
  return notes;
}

/** Slow-practice notes for one segment: pattern on a fixed beat grid, or a sequence back to back. */
export function segmentNotes(segment, bpm = 80) {
  const slot = 60 / bpm;
  if (segment.seq) {
    const notes = [];
    let t = 1.2;
    segment.seq.forEach((move, b) => {
      const hold = moveHold(move, bpm);
      notes.push({ t: r3(t), move, hold: r3(hold), beat: b });
      t += Math.max(1, Math.ceil(hold / slot - 1e-6)) * slot;
    });
    return notes;
  }
  const notes = [];
  segment.pattern.forEach((move, b) => {
    if (move) notes.push({ t: r3(1.2 + b * slot), move, hold: r3(moveHold(move, bpm)), beat: b });
  });
  return notes;
}

export function routineById(id) {
  return ROUTINES.find((r) => r.id === id) ?? null;
}

/** The routine at 1.0×: the middle of its suggested BPM range. */
export const routineTempo = (routine) => Math.round((routine.bpm[0] + routine.bpm[1]) / 2);

/** BPM distance used to suggest songs for a routine. */
export function bpmFit(tempo, routine) {
  const [lo, hi] = routine.bpm;
  if (tempo >= lo && tempo <= hi) return 0;
  return tempo < lo ? lo - tempo : tempo - hi;
}

export function routineMoves(routine) {
  const all = routine.seq ?? routine.segments.flatMap((s) => s.seq ?? s.pattern.filter(Boolean));
  return [...new Set(all)];
}

/** Guard used by tests and the UI: moves exist and reserved beats stay free. */
export function validateRoutine(routine) {
  const bad = routineMoves(routine).filter((m) => !DANCE_MOVES[m]);
  if (bad.length) return `未知动作: ${bad.join(",")}`;
  if (routine.seq) return null; // a sequence has no beat grid to overflow
  for (const segment of routine.segments) {
    for (let b = 0; b < segment.pattern.length; b++) {
      const move = segment.pattern[b];
      if (!move) continue;
      const beats = DANCE_MOVES[move].beats ?? 1;
      if (b + beats > segment.pattern.length) return `${segment.name}: ${move} 超出八拍段落`;
      for (let k = 1; k < beats; k++) {
        if (segment.pattern[b + k]) return `${segment.name}: ${move} 与 ${segment.pattern[b + k]} 的拍节重叠`;
      }
    }
  }
  return null;
}
