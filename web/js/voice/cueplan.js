// Plan when the coach speaks, so every cue FINISHES just before its beat.
// Pure function: (notes, beats, durations, options) -> sorted cue list.
import { MOVES } from "../core/moves.js";
import { DANCE_MOVES, dancePair } from "../dance/dancemoves.js";

const pairOf = (m) => MOVES[m]?.pair ?? dancePair(m);

export const LEAD_S = 0.12; // cue ends this long before the beat
const GAP_S = 0.06; // min silence between cues
const NEW_GROUP_GAP_S = 2.5;

const base = (move) => move.replace(/_[lr]$/, "");

/** Key announcing the group that starts at notes[i]. */
export function groupKey(notes, i) {
  const n = notes[i];
  if (n.hold > 0 && !DANCE_MOVES[n.move]?.guided) return `hold.${n.move}`;
  const next = notes[i + 1];
  const pair = pairOf(n.move);
  if (pair && next && next.move === pair) return `pair.${base(n.move)}`;
  return `move.${n.move}`;
}

/** Does notes[i] start a new group (different move family, or after a pause)? */
export function startsGroup(notes, i) {
  if (i === 0) return true;
  const a = notes[i - 1], b = notes[i];
  if (b.t - (a.t + a.hold) > NEW_GROUP_GAP_S) return true;
  if (b.hold > 0 || a.hold > 0) return true;
  const fam = (m) => (pairOf(m) ? base(m) : m);
  return fam(a.move) !== fam(b.move);
}

/**
 * @param notes      chart notes
 * @param beats      beat times
 * @param dur        (key) => seconds of audio for that cue
 * @param opts.eyesClosed  also call "左/右" on every alternating note
 * @param opts.countIn     count "三二一" on the beats before the first note
 * @param opts.songDuration  for halfway / final-stretch encouragements
 * @returns [{at, key, note?}]
 */
export function planCues(notes, beats, dur, opts = {}) {
  const cues = [];
  if (!notes.length) return cues;

  if (opts.countIn !== false) {
    // "三、二、一" on beats, finishing before the first move is announced
    const firstAt = notes[0].t - dur(groupKey(notes, 0)) - LEAD_S;
    const countDur = Math.max(dur("count.3"), dur("count.2"), dur("count.1")) + GAP_S;
    const before = beats.filter((b) => b + dur("count.1") + GAP_S <= firstAt);
    const spacing = before.length > 1 ? before[before.length - 1] - before[before.length - 2] : 0.5;
    let stride = 1;
    while (spacing * stride < countDur && stride < 8) stride *= 2;
    ["count.3", "count.2", "count.1"].forEach((key, k) => {
      const b = before[before.length - 1 - (2 - k) * stride];
      if (b !== undefined && b >= 0) cues.push({ at: b, key, kind: "count" });
    });
  }

  for (let i = 0; i < notes.length; i++) {
    const n = notes[i];
    let key = null;
    let kind = "side";
    if (startsGroup(notes, i)) {
      key = groupKey(notes, i);
      kind = "group";
    } else if (opts.eyesClosed && MOVES[n.move]?.pair) {
      key = n.move.endsWith("_l") ? "side.l" : "side.r";
    }
    if (key) cues.push({ at: n.t - dur(key) - LEAD_S, key, kind, note: i });
  }

  if (opts.songDuration > 60) {
    const half = opts.songDuration / 2;
    cues.push({ at: half, key: "fb.half", kind: "fb" });
    if (opts.songDuration > 100) cues.push({ at: opts.songDuration - 30, key: "fb.last", kind: "fb" });
  }

  // resolve overlaps: group/count cues win; side/feedback cues give way
  const priority = { count: 3, group: 2, side: 1, fb: 0 };
  cues.sort((a, b) => a.at - b.at);
  const out = [];
  for (const c of cues) {
    const prev = out[out.length - 1];
    const prevEnd = prev ? prev.at + dur(prev.key) + GAP_S : -Infinity;
    if (c.at >= prevEnd) {
      out.push(c);
    } else if (priority[c.kind] > priority[prev.kind]) {
      // try to start the important cue right after the earlier one, else replace it
      const latest = c.note !== undefined ? notes[c.note].t + 0.05 - dur(c.key) : c.at + 0.3;
      if (prevEnd <= latest) out.push({ ...c, at: prevEnd });
      else out[out.length - 1] = c;
    }
  }
  return out.filter((c) => c.at >= 0);
}
