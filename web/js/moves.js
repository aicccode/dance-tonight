// Display info per move (fitness + dance). Zones are in the MIRRORED screen space (0..1),
import { DANCE_MOVES } from "./dance/dancemoves.js";
// so the player's left shows up on the left of the screen, like a mirror.

export const MOVE_UI = {
  arms_up: { icon: "🙌", zone: [0.5, 0.14], color: "#ffb703", tip: "双手举过头顶，手臂伸直" },
  punch_l: { icon: "👊", arrow: "←", zone: [0.14, 0.38], color: "#fb8500", tip: "左拳向左侧平推，与肩同高" },
  punch_r: { icon: "👊", arrow: "→", zone: [0.86, 0.38], color: "#fb8500", tip: "右拳向右侧平推，与肩同高" },
  squat: { icon: "🍑", arrow: "↓", zone: [0.5, 0.82], color: "#8ecae6", tip: "臀部向后坐，大腿接近水平，膝盖别内扣" },
  knee_l: { icon: "🦵", arrow: "↑", zone: [0.3, 0.68], color: "#e63946", tip: "左膝抬到髋部高度，收紧腹部" },
  knee_r: { icon: "🦵", arrow: "↑", zone: [0.7, 0.68], color: "#e63946", tip: "右膝抬到髋部高度，收紧腹部" },
  jack: { icon: "⭐", zone: [0.5, 0.45], color: "#ffd166", tip: "跳开双脚比肩宽，双手举过肩" },
  cross_l: { icon: "✖️", arrow: "↗", zone: [0.36, 0.55], color: "#c77dff", tip: "左膝上抬，右肘向下去碰它，转体卷腹" },
  cross_r: { icon: "✖️", arrow: "↖", zone: [0.64, 0.55], color: "#c77dff", tip: "右膝上抬，左肘向下去碰它，转体卷腹" },
  bend_l: { icon: "🌙", arrow: "↙", zone: [0.2, 0.2], color: "#06d6a0", tip: "右手举高，上身向左侧弯，感受右侧腹拉伸" },
  bend_r: { icon: "🌙", arrow: "↘", zone: [0.8, 0.2], color: "#06d6a0", tip: "左手举高，上身向右侧弯，感受左侧腹拉伸" },
  toe_touch: { icon: "🤸", arrow: "↓", zone: [0.5, 0.8], color: "#74c69d", tip: "腿伸直，俯身用双手去摸脚尖，感受腹部拉伸" },
  knee_out_l: { icon: "🦵", arrow: "↙", zone: [0.22, 0.58], color: "#f4a261", tip: "左膝向左侧打开抬起，膝盖到髋部高度" },
  knee_out_r: { icon: "🦵", arrow: "↘", zone: [0.78, 0.58], color: "#f4a261", tip: "右膝向右侧打开抬起，膝盖到髋部高度" },
  kick_l: { icon: "🦶", arrow: "↖", zone: [0.28, 0.48], color: "#e76f51", tip: "左腿伸直向前踢，腿踢到髋部以上高度" },
  kick_r: { icon: "🦶", arrow: "↗", zone: [0.72, 0.48], color: "#e76f51", tip: "右腿伸直向前踢，腿踢到髋部以上高度" },
  ...Object.fromEntries(Object.entries(DANCE_MOVES).map(([id, m]) => [id, {
    icon: m.icon, arrow: m.arrow ?? null, zone: m.zone, color: m.color, tip: m.tip,
  }])),
};
