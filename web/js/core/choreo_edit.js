// Editing user choreography: an ordered sequence of moves, danced from the
// first to the last. Each move takes its own length (1 beat, a multi-beat
// motion, or a whole motion-capture clip). Pure functions returning new
// arrays, plus validation shared by the renderer and the main process.
import { DANCE_MOVES } from "../dance/dancemoves.js";
import { wholeClipId } from "./clipmoves.js";
import { t } from "../i18n/index.js";

export const MAX_MOVES = 200;
export const CHUNK_BEATS = 8; // practice splits the sequence into ~8-beat parts

export const moveBeats = (move) => DANCE_MOVES[move]?.beats ?? 1;

export function insertAt(seq, index, move) {
  const i = Math.max(0, Math.min(seq.length, index));
  return [...seq.slice(0, i), move, ...seq.slice(i)];
}

export const removeIndex = (seq, index) => seq.filter((_, i) => i !== index);

/** Move item `from` so it lands before position `to` (as seen before the move). */
export function moveItem(seq, from, to) {
  if (from < 0 || from >= seq.length) return [...seq];
  const target = Math.max(0, Math.min(seq.length, to));
  if (target === from || target === from + 1) return [...seq];
  const out = [...seq];
  const [x] = out.splice(from, 1);
  out.splice(target > from ? target - 1 : target, 0, x);
  return out;
}

/** Same order with left/right moves swapped. */
export function mirrorSeq(seq) {
  return seq.map((m) => (DANCE_MOVES[m]?.pair && /_[lr]$/.test(m) ? DANCE_MOVES[m].pair : m));
}

/** Total length in beats (clips counted at the reference tempo). */
export const seqBeats = (seq) => seq.reduce((a, m) => a + moveBeats(m), 0);

/**
 * Practice parts: consecutive moves up to ~8 beats each; a long move (e.g. a
 * whole clip) is a part on its own. Order is never changed.
 */
export function chunkSequence(seq) {
  const parts = [];
  let cur = [], beats = 0;
  for (const m of seq) {
    const b = moveBeats(m);
    if (cur.length && beats + b > CHUNK_BEATS) {
      parts.push(cur);
      cur = [];
      beats = 0;
    }
    cur.push(m);
    beats += b;
  }
  if (cur.length) parts.push(cur);
  return parts.map((s, i) => ({ name: t("choreo.partName", { n: i + 1 }), seq: s }));
}

/** Suggested BPM range: long guided motions want a slower song. */
export function suggestBpm(seq) {
  const built = seq.filter((m) => !DANCE_MOVES[m]?.seconds);
  if (!built.length) return [90, 130];
  return Math.max(...built.map(moveBeats)) >= 4 ? [85, 120] : [95, 135];
}

export function newRoutine() {
  return { id: null, name: t("choreo.newName"), desc: "", bpm: [90, 130], seq: [] };
}

/** Flatten 8-beat segments into a sequence (keeps the order of moves). */
const flatten = (segments) => segments.flatMap((s) => s.seq ?? (s.pattern ?? []).filter(Boolean));

/** Copy a built-in routine as a starting point: its moves in order, once through. */
export function forkRoutine(routine) {
  return {
    id: null, name: t("choreo.forkName", { name: routine.name }).slice(0, 20), desc: routine.desc ?? "",
    bpm: [...routine.bpm], seq: routine.seq ? [...routine.seq] : flatten(routine.segments),
  };
}

/**
 * Bring a stored routine up to date: older ones were 8-beat segments and may
 * name clip sections; moves that no longer exist (a deleted clip) are dropped.
 * Returns {routine, removed}; never mutates the input.
 */
export function upgradeRoutine(raw) {
  let removed = 0;
  const seq = (raw.seq ?? flatten(raw.segments ?? [])).flatMap((m) => {
    if (Object.hasOwn(DANCE_MOVES, m)) return [m];
    const whole = wholeClipId(m);
    if (whole !== m && Object.hasOwn(DANCE_MOVES, whole)) return [whole];
    removed++;
    return [];
  });
  const { segments, ...rest } = raw;
  return { routine: { ...rest, seq }, removed };
}

/** A stored routine ready for the dance view: sequence + practice parts. */
export function withParts(routine) {
  return { ...routine, segments: chunkSequence(routine.seq) };
}

const text = (v, max) => String(v ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, max);

/** Validate untrusted routine data; returns a clean copy or throws. */
export function cleanRoutine(raw) {
  if (!raw || typeof raw !== "object") throw new Error(t("choreo.errInvalid"));
  const name = text(raw.name, 20);
  if (!name) throw new Error(t("choreo.errName"));
  const [lo, hi] = Array.isArray(raw.bpm) ? raw.bpm.map(Number) : [];
  if (![lo, hi].every((v) => Number.isInteger(v) && v >= 50 && v <= 220) || lo > hi) throw new Error(t("choreo.errBpm"));
  if (!Array.isArray(raw.seq)) throw new Error(t("choreo.errInvalid"));
  if (!raw.seq.length) throw new Error(t("choreo.errEmpty"));
  if (raw.seq.length > MAX_MOVES) throw new Error(t("choreo.errMax", { n: MAX_MOVES }));
  for (const m of raw.seq) {
    if (typeof m !== "string" || !Object.hasOwn(DANCE_MOVES, m)) throw new Error(t("choreo.errUnknown"));
  }
  const id = raw.id == null ? null : String(raw.id);
  if (id !== null && !/^user:[a-z0-9]{6,32}$/.test(id)) throw new Error(t("choreo.errId"));
  return { id, name, desc: text(raw.desc, 80), bpm: [lo, hi], seq: [...raw.seq], custom: true };
}
