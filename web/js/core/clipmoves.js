// Motion-capture clips as choreography moves: each clip is one guided move that
// plays whole, at its captured speed, wherever it sits in a sequence. Pure and
// three.js-free: used by the main process (validation) and the renderer.
import { clipSections } from "./danceclip.js";

export const CLIP_REF_BPM = 100; // beats are counted at this tempo
export const CLIP_PREFIX = "clip:";
export const isClipMove = (id) => typeof id === "string" && id.startsWith(CLIP_PREFIX);

const STEPS = ["看清教练的整体路线和方向", "跟上重心转移和手臂线条", "注意转身和朝向的变化", "完整做完，衔接下一个动作"];

/** Approximate beats of a clip at the reference tempo (for display and practice chunks). */
export function clipBeats(seconds) {
  return Math.max(1, Math.round((seconds * CLIP_REF_BPM) / 60));
}

/** {moveId: def}: each usable clip is one move, played whole at its own speed. */
export function clipMoveDefs(clips) {
  const out = {};
  for (const c of clips ?? []) {
    if (c.error || !(c.duration > 0) || typeof c.id !== "string") continue;
    out[`${CLIP_PREFIX}${c.id}`] = {
      name: c.name, pair: null, icon: "💃", zone: [0.5, 0.42], color: "#c77dff", guided: true, steps: STEPS,
      // natural length: `seconds` wins over beats when timing a note
      seconds: c.duration, beats: clipBeats(c.duration),
      clip: c.id, start: 0, end: c.duration, style: c.style ?? "", user: c.kind === "user",
      tip: `跟着教练跳完整段「${c.name}」（真人动捕，${c.duration.toFixed(1)} 秒）`,
    };
  }
  return out;
}

/** Older routines referenced clip sections ("clip:<id>:<n>"): use the whole clip. */
export const wholeClipId = (move) => (isClipMove(move) ? move.replace(/:(p?\d+)$/, "") : move);
