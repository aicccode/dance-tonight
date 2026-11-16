// Move matchers (features -> 0..1) and the note scorer. Pure, no DOM.
import { DANCE_MATCHERS } from "./dance/dancemoves.js";

/** Linear ramp: lo->0, hi->1, clamped. Works decreasing when lo > hi. */
export function ramp(v, lo, hi) {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, (v - lo) / (hi - lo)));
}

const legs = (f, score) => (f.lowerVisible ? score : 0);

const punch = (s) => (f) => ramp(f.armOut[s], 0.45, 0.8) * ramp(f.wristShoulderDy[s], 0.6, 0.25);
const knee = (s, o) => (f) => legs(f, ramp(f.thigh[s], 0.6, 0.25) * ramp(f.thigh[o], 0.5, 0.75));
const cross = (s) => (f) => legs(f, 0.7 * ramp(f.cross[s], 0.9, 0.45) + 0.3 * ramp(f.thigh[s], 0.8, 0.4));
const bend = (s, o) => (f) => 0.75 * ramp(f.tilt[s], 6, 18) + 0.25 * ramp(f.wristUp[o], -0.1, 0.2);

export const MATCHERS = {
  arms_up: (f) => Math.min(ramp(f.wristUp.l, -0.05, 0.25), ramp(f.wristUp.r, -0.05, 0.25)),
  punch_l: punch("l"),
  punch_r: punch("r"),
  // depth by knee angle when ankles are visible (robust to camera distance and
  // torso lean); fall back to the thigh-length ratio otherwise
  squat: (f) => {
    if (!f.lowerVisible) return 0;
    const depth = (s) => (f.kneeAngle[s] != null
      ? ramp(f.kneeAngle[s], 165, 110)
      : ramp(f.thigh[s], 0.85, 0.55));
    return Math.min(depth("l"), depth("r"));
  },
  knee_l: knee("l", "r"),
  knee_r: knee("r", "l"),
  jack: (f) =>
    legs(f, ramp(Math.min(f.wristAboveShoulder.l, f.wristAboveShoulder.r), 0, 0.35) *
      ramp(f.ankleSpread, 1.0, 1.5)),
  cross_l: cross("l"),
  cross_r: cross("r"),
  bend_l: bend("l", "r"),
  bend_r: bend("r", "l"),
  // hinge forward with both hands below the hips
  toe_touch: (f) => {
    if (!f.lowerVisible || f.hipAngle.l == null || f.hipAngle.r == null) return 0;
    // averaged hip angle: a forward hinge projects asymmetrically per side
    const hinge = ramp((f.hipAngle.l + f.hipAngle.r) / 2, 160, 135);
    return Math.min(hinge, ramp(f.wristBelow.l, 0.55, 0.95), ramp(f.wristBelow.r, 0.55, 0.95));
  },
  knee_out_l: (f) => legs(f, ramp(f.kneeOut.l, 0.25, 0.5) * ramp(f.thigh.l, 0.5, 0.28)),
  knee_out_r: (f) => legs(f, ramp(f.kneeOut.r, 0.25, 0.5) * ramp(f.thigh.r, 0.5, 0.28)),
  kick_l: (f) => legs(f, ramp(f.hipAnkle.l, 0.3, 0.55) * ramp(f.kneeAngle.l ?? 180, 150, 172)),
  kick_r: (f) => legs(f, ramp(f.hipAnkle.r, 0.3, 0.55) * ramp(f.kneeAngle.r ?? 180, 150, 172)),
  ...DANCE_MATCHERS,
};

export function matchAll(f) {
  const out = {};
  for (const [m, fn] of Object.entries(MATCHERS)) out[m] = f ? fn(f) : 0;
  return out;
}

export const WINDOW = { before: 0.35, after: 0.45 };
export const GRADES = [
  { name: "perfect", min: 0.85, holdMin: 0.8, points: 300, weight: 1 },
  { name: "great", min: 0.65, holdMin: 0.6, points: 200, weight: 0.75 },
  { name: "good", min: 0.45, holdMin: 0.4, points: 100, weight: 0.5 },
];
export const MISS = { name: "miss", points: 0, weight: 0 };
const HIT = 0.65;
const PERFECT_TIMING = 0.25;
const EARLY_LOCK = 0.9;

/** Grade one note given its samples [{t, s}] collected inside its window. */
export function judgeNote(note, samples) {
  if (!samples.length) return { grade: MISS, best: 0, offset: null };
  if (note.hold > 0) {
    const inHold = samples.filter((p) => p.t >= note.t - 0.2 && p.t <= note.t + note.hold);
    const mean = inHold.length ? inHold.reduce((a, p) => a + p.s, 0) / inHold.length : 0;
    const grade = GRADES.find((g) => mean >= g.holdMin) ?? MISS;
    return { grade, best: mean, offset: null };
  }
  const best = Math.max(...samples.map((p) => p.s));
  const hit = samples.find((p) => p.s >= HIT);
  const offset = hit ? hit.t - note.t : null;
  let grade = GRADES.find((g) => best >= g.min) ?? MISS;
  if (grade.name === "perfect" && (offset === null || Math.abs(offset) > PERFECT_TIMING)) {
    grade = GRADES[1];
  }
  return { grade, best, offset };
}

export function pointsFor(grade, combo) {
  return Math.round(grade.points * (1 + Math.min(combo, 50) / 50));
}

/** Tracks every note's samples over time and emits judgement events. */
export class Scorer {
  constructor(notes) {
    this.notes = notes.map((n, i) => ({ ...n, id: i }));
    this.samples = new Map(this.notes.map((n) => [n.id, []]));
    this.results = new Map();
    this.score = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.counts = { perfect: 0, great: 0, good: 0, miss: 0 };
    this.cursor = 0; // first not-yet-finished note
  }

  /** Active (unjudged) notes whose window contains t. */
  active(t) {
    const out = [];
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t - WINDOW.before > t) break;
      if (!this.results.has(n.id) && t <= n.t + n.hold + WINDOW.after) out.push(n);
    }
    return out;
  }

  /**
   * @param t current song time (s)
   * @param matches {move: 0..1} for the current frame
   * @returns judgement events [{note, grade, points, combo, best}]
   */
  update(t, matches) {
    const events = [];
    for (const n of this.active(t)) {
      const s = matches[n.move] ?? 0;
      this.samples.get(n.id).push({ t, s });
      if (!n.hold && s >= EARLY_LOCK && t >= n.t - PERFECT_TIMING) events.push(this.#finish(n));
    }
    for (let i = this.cursor; i < this.notes.length; i++) {
      const n = this.notes[i];
      if (n.t + n.hold + WINDOW.after >= t) break;
      if (!this.results.has(n.id)) events.push(this.#finish(n));
    }
    while (this.cursor < this.notes.length && this.results.has(this.notes[this.cursor].id)) {
      this.cursor++;
    }
    return events;
  }

  /** Force-judge everything left (song ended / quit). */
  finishAll() {
    return this.notes.filter((n) => !this.results.has(n.id)).map((n) => this.#finish(n));
  }

  #finish(note) {
    const { grade, best, offset } = judgeNote(note, this.samples.get(note.id));
    this.combo = grade === MISS ? 0 : this.combo + 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    const points = pointsFor(grade, this.combo);
    this.score += points;
    this.counts[grade.name]++;
    const ev = { note, grade, points, combo: this.combo, best, offset };
    this.results.set(note.id, ev);
    return ev;
  }

  get judged() {
    return this.results.size;
  }

  get accuracy() {
    if (!this.results.size) return 0;
    let sum = 0;
    for (const ev of this.results.values()) sum += ev.grade.weight;
    return sum / this.results.size;
  }
}
