// Move catalog. Side suffix _l/_r is always the PLAYER's own left/right.
// group: cardio | abs | legs — used to pick moves by song energy.

export const MOVES = {
  arms_up: { name: "双手上举", group: "cardio", level: 1, pair: null },
  punch_l: { name: "左侧冲拳", group: "cardio", level: 1, pair: "punch_r" },
  punch_r: { name: "右侧冲拳", group: "cardio", level: 1, pair: "punch_l" },
  squat: { name: "深蹲", group: "legs", level: 1, pair: null },
  knee_l: { name: "左提膝", group: "abs", level: 1, pair: "knee_r" },
  knee_r: { name: "右提膝", group: "abs", level: 1, pair: "knee_l" },
  jack: { name: "开合跳", group: "cardio", level: 2, pair: null },
  cross_l: { name: "左膝碰右肘", group: "abs", level: 2, pair: "cross_r" },
  cross_r: { name: "右膝碰左肘", group: "abs", level: 2, pair: "cross_l" },
  bend_l: { name: "左侧弯", group: "abs", level: 3, pair: "bend_r" },
  bend_r: { name: "右侧弯", group: "abs", level: 3, pair: "bend_l" },
  // v0.3: more core/leg work (user feedback: abs undertrained)
  toe_touch: { name: "摸脚尖", group: "abs", level: 1, pair: null },
  knee_out_l: { name: "左侧提膝", group: "abs", level: 2, pair: "knee_out_r" },
  knee_out_r: { name: "右侧提膝", group: "abs", level: 2, pair: "knee_out_l" },
  kick_l: { name: "左前踢腿", group: "legs", level: 2, pair: "kick_r" },
  kick_r: { name: "右前踢腿", group: "legs", level: 2, pair: "kick_l" },
};

/** Rough energy cost (MET, kcal/kg/h) while performing each move. */
export const MOVE_MET = {
  arms_up: 6.0, punch_l: 7.0, punch_r: 7.0, squat: 8.0, knee_l: 5.5, knee_r: 5.5,
  jack: 9.0, cross_l: 6.5, cross_r: 6.5, bend_l: 4.5, bend_r: 4.5,
  toe_touch: 5.0, knee_out_l: 6.0, knee_out_r: 6.0, kick_l: 6.5, kick_r: 6.5,
};

/** Moves that can be turned into a hold note. */
export const HOLDABLE = new Set(["squat", "bend_l", "bend_r", "arms_up", "toe_touch"]);

export const movesForLevel = (level) =>
  Object.keys(MOVES).filter((m) => MOVES[m].level <= level);
