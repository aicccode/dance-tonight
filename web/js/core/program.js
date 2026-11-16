// 100-day progressive program: abs + fat loss + stamina.

export const TOTAL_DAYS = 100;

// [first, last, name, level, beatsPerNote, minutesStart, minutesEnd, holdProb, minIntervalS]
const PHASES = [
  [1, 14, "唤醒期", 1, 4, 10, 12, 0.0, 0.9],
  [15, 35, "燃脂期", 2, 2, 15, 20, 0.0, 0.7],
  [36, 63, "核心强化期", 3, 2, 20, 25, 0.2, 0.6],
  [64, 100, "冲刺期", 4, 1, 25, 30, 0.3, 0.5],
];

const FOCUS = {
  1: "熟悉动作：冲拳、深蹲、提膝、摸脚尖，全身入镜跟上节拍",
  2: "加入开合跳、交叉卷腹、侧提膝和前踢腿，心率拉起来",
  3: "侧弯+保持动作，核心持续发力",
  4: "每拍一个动作，挑战体能极限",
};

export const clampDay = (day) => Math.max(1, Math.min(TOTAL_DAYS, Math.trunc(day) || 1));

export function dayPlan(dayIn) {
  const day = clampDay(dayIn);
  const [first, last, phase, level, bpn0, m0, m1, hold, minIv] = PHASES.find(
    ([a, b]) => day >= a && day <= b,
  );
  const progress = (day - first) / Math.max(1, last - first);
  const minutes = Math.round(m0 + (m1 - m0) * progress);
  const bpn = level === 1 && day >= 8 ? 2 : bpn0;
  if (day % 7 === 0) {
    return {
      day, phase, level: Math.max(1, level - 1), beats_per_note: Math.min(4, bpn * 2),
      minutes: Math.max(8, Math.round(minutes * 0.6)), hold_prob: 0.3,
      min_interval_s: Math.max(minIv, 0.8), recovery: true,
      focus: "恢复日：低强度、动作做标准、拉伸核心", target_accuracy: 0.8, met: 4.0,
    };
  }
  return {
    day, phase, level, beats_per_note: bpn, minutes, hold_prob: hold, min_interval_s: minIv,
    recovery: false, focus: FOCUS[level],
    target_accuracy: Math.round((0.6 + 0.25 * (day / TOTAL_DAYS)) * 100) / 100,
    met: 4.5 + level,
  };
}

export const SPEED_MOVES = ["punch_l", "punch_r", "knee_l", "knee_r", "arms_up", "squat"];

/** Challenge mode for fast songs (DJ, 140-180 BPM): one move per beat. */
export function speedPlan() {
  return {
    day: 0, phase: "竞速挑战", level: 2, beats_per_note: 1, minutes: 0, hold_prob: 0,
    min_interval_s: 0.3, recovery: false,
    focus: "每拍一个动作，漏一个扣血，血条空了就结束", target_accuracy: 0.7, met: 9.0,
  };
}

/** kcal = MET * weight(kg) * hours. */
export const estimateKcal = (met, weightKg, seconds) =>
  Math.round(met * weightKg * (seconds / 3600) * 10) / 10;
