// Song analysis + day plan -> timed move notes.
//  * Notes sit on beats; phrases are 8 beats aligned to downbeats.
//  * Phrase energy weights the move groups; abs always gets a real share.
//  * A pattern repeats for 2 phrases so it feels like learnable choreography.
//  * Quiet breakdowns: rest (level 1-2) or a static core hold (level 3+).
//  * Deterministic per (song seed, plan) so you can replay and beat your best.
import { HOLDABLE, MOVES, movesForLevel } from "./moves.js";

export const LEAD_IN_S = 3.0;
export const TAIL_S = 2.0;
export const PHRASE_BEATS = 8;
export const REST_ENERGY = 0.12;
export const SAME_MOVE_GAP_S = 0.6; // unpaired moves (squat, arms up) need time to reset
const PATTERN_REPEAT = 2;
const BREAKDOWN_HOLD_BEATS = 4;
const MAX_REST_PHRASES = 3;

const GROUP_WEIGHTS = {
  high: { cardio: 0.45, legs: 0.25, abs: 0.3 },
  mid: { cardio: 0.34, legs: 0.33, abs: 0.33 },
  low: { cardio: 0.1, legs: 0.2, abs: 0.7 },
};

/** Small deterministic PRNG (mulberry32). */
export function makeRng(seed) {
  let a = seed >>> 0;
  const random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    random,
    choice: (arr) => arr[Math.floor(random() * arr.length)],
    weighted(items, weights) {
      const total = weights.reduce((a, b) => a + b, 0);
      let r = random() * total;
      for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r < 0) return items[i];
      }
      return items[items.length - 1];
    },
  };
}

function pool(rng, energy, level, recovery, only) {
  const allowed = movesForLevel(level).filter((m) => !only || only.includes(m));
  const band = recovery || energy < 0.35 ? "low" : energy > 0.65 ? "high" : "mid";
  const w = GROUP_WEIGHTS[band];
  const groups = Object.keys(w).filter((g) => allowed.some((m) => MOVES[m].group === g));
  const group = rng.weighted(groups, groups.map((g) => w[g]));
  return allowed.filter((m) => MOVES[m].group === group);
}

function pickPattern(rng, candidates) {
  const first = rng.choice(candidates);
  const pair = MOVES[first].pair;
  if (pair) {
    const left = first.endsWith("_l") ? first : pair;
    return [left, MOVES[left].pair];
  }
  if (candidates.length > 1 && rng.random() < 0.5) {
    const second = rng.choice(candidates.filter((m) => m !== first));
    return MOVES[second].pair ? [first] : [first, second];
  }
  return [first];
}

function stepFor(interval, beatsPerNote, minInterval) {
  let step = Math.max(1, beatsPerNote);
  while (interval * step < minInterval) step *= 2;
  return step;
}

function startIndex(beats, downbeats) {
  const down = new Set(downbeats);
  let i = beats.findIndex((t) => t >= LEAD_IN_S && (down.size === 0 || down.has(t)));
  if (i < 0) i = beats.findIndex((t) => t >= LEAD_IN_S);
  return i < 0 ? beats.length : i;
}

function breakdownHold(rng, level, count) {
  const options = ["bend_l", "bend_r", "squat"].filter((m) => movesForLevel(level).includes(m));
  return rng.random() < 0.75 ? options[count % options.length] : "squat";
}

const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * @param analysis {duration, beats, downbeats, energy}
 * @param plan     from dayPlan()/speedPlan()
 * @param seed     integer (e.g. song id hash)
 * @param only     optional whitelist of moves
 */
export function generateChart(analysis, plan, seed, only = null) {
  const { beats, energy } = analysis;
  const endT = analysis.duration - TAIL_S;
  if (beats.length < 2) return [];

  const rng = makeRng(seed * 1000 + plan.level * 10 + (plan.recovery ? 1 : 0));
  const notes = [];
  let nextFree = 0;
  let pattern = [];
  let patternLeft = 0;
  let patternPos = 0;
  let restRun = 0;
  let holds = 0;
  const lastT = {};

  let i = startIndex(beats, analysis.downbeats ?? []);
  while (i + 1 < beats.length) {
    const end = Math.min(i + PHRASE_BEATS, beats.length);
    const len = end - i;
    let e = 0;
    for (let j = i; j < end; j++) e += energy[j];
    e /= len;
    const interval = (beats[end - 1] - beats[i]) / Math.max(1, len - 1) || 0.5;

    if (e < REST_ENERGY && restRun < MAX_REST_PHRASES) {
      restRun++;
      const t = beats[i];
      if (plan.level >= 3 && t >= nextFree && t <= endT) {
        const hold = r3(interval * BREAKDOWN_HOLD_BEATS);
        notes.push({ t: r3(t), move: breakdownHold(rng, plan.level, holds++), hold, beat: i });
        nextFree = t + hold + plan.min_interval_s;
      }
      i += PHRASE_BEATS;
      continue;
    }
    restRun = 0;

    if (patternLeft <= 0) {
      pattern = pickPattern(rng, pool(rng, e, plan.level, plan.recovery, only));
      patternLeft = PATTERN_REPEAT;
      patternPos = 0;
    }
    patternLeft--;

    let bpn = plan.beats_per_note;
    if (plan.level >= 4 && e < 0.65) bpn *= 2; // only loud parts go full speed
    const step = stepFor(interval, bpn, plan.min_interval_s);

    for (let j = i; j < end; j += step) {
      const t = beats[j];
      if (t > endT) break;
      if (t < nextFree || energy[j] < REST_ENERGY / 2) continue;
      const move = pattern[patternPos % pattern.length];
      if (!MOVES[move].pair && t - (lastT[move] ?? -9) < SAME_MOVE_GAP_S) continue;
      patternPos++;
      lastT[move] = t;
      let hold = 0;
      if (HOLDABLE.has(move) && rng.random() < plan.hold_prob) {
        hold = r3(interval * Math.max(2, step));
      }
      notes.push({ t: r3(t), move, hold, beat: j });
      nextFree = t + hold + plan.min_interval_s;
    }
    i += PHRASE_BEATS;
  }
  return notes;
}

/** Stable 31-bit seed from a string (song id/path). */
export function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 1) % 100000;
}
