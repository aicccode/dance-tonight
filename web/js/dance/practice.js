// Dance segment practice: the coach loops a segment slowly, voice calls each
// move, and the meter shows your live match. Counts completed loops.
import { computeFeatures, toPoints } from "../features.js";
import { MATCHERS } from "../judge.js";
import { MOVE_UI } from "../moves.js";
import { coverRect, drawSkeleton, drawVideo } from "../render.js";
import { t } from "../i18n/index.js";
import { dancePair, DANCE_MOVES, guidedTip } from "./dancemoves.js";
import { segmentNotes } from "../core/dance.js";

const COOLDOWN = 0.45; // min seconds before repeating the same cue
const LOOP_HANG = 0.6; // silence at the end of each loop

export class DancePractice {
  /**
   * @param o.canvas, o.video, o.detector, o.coach (Coach), o.voice (VoiceCoach|null)
   * @param o.els {meter, tip, seg, loops}
   */
  constructor(o) {
    Object.assign(this, o);
    this.ctx = this.canvas.getContext("2d");
    this.baseline = null;
    this.running = false;
    this.notes = [];
    this.period = 1;
    this.t0 = 0;
    this.idx = -1;
    this.loops = 0;
    this.lastT = 0;
    this.said = { key: null, at: -9 };
    this.runGen = 0;
  }

  /** Start looping one segment. */
  load(segment, bpm = 80) {
    this.notes = segmentNotes(segment, bpm);
    const last = this.notes.at(-1);
    this.period = last ? last.t + last.hold + LOOP_HANG : 2;
    this.t0 = performance.now() / 1000;
    this.idx = -1;
    this.loops = 0;
    this.lastT = 0;
    this.coach?.demoNotes(this.notes.map((n) => ({ ...n })), bpm, LOOP_HANG);
    this.els.loops.textContent = "0";
  }

  start() {
    if (this.running) return;
    this.running = true;
    const gen = ++this.runGen; // a pending callback from a stopped run must not keep looping
    const loop = () => {
      if (!this.running || gen !== this.runGen) return;
      try {
        this.#frame();
      } finally {
        requestAnimationFrame(loop);
      }
    };
    requestAnimationFrame(loop);
  }

  stop() {
    this.running = false;
  }

  get time() {
    return (performance.now() / 1000 - this.t0) % this.period;
  }

  #frame() {
    const c = this.canvas, v = this.video;
    if (c.width !== c.clientWidth || c.height !== c.clientHeight) {
      c.width = c.clientWidth;
      c.height = c.clientHeight;
    }
    const rect = coverRect(v.videoWidth || 16, v.videoHeight || 9, c.width, c.height);
    const lm = this.detector.detect(v);
    drawVideo(this.ctx, v, rect, 0.2);
    drawSkeleton(this.ctx, lm, rect, "#c77dff");
    const f = lm ? computeFeatures(toPoints(lm, (v.videoWidth || 16) / (v.videoHeight || 9)), this.baseline) : null;

    const t = this.time;
    if (t < this.lastT - 0.5) {
      this.loops++;
      this.els.loops.textContent = String(this.loops);
    }
    this.lastT = t;

    // active note + meter
    // Prefer a note whose hold is actually playing; an approaching note must
    // not steal the final beat of a four-count motion.
    let active = null, approaching = null;
    for (const n of this.notes) {
      if (n.t <= t && t <= n.t + n.hold + 0.45) active = n;
      else if (n.t - 0.25 <= t && t < n.t) approaching ??= n;
    }
    active ??= approaching;
    const guided = !!DANCE_MOVES[active?.move]?.guided;
    const phase = guided ? Math.max(0, Math.min(1, (t - active.t) / active.hold)) : 0;
    const s = guided ? 1 : f && active ? MATCHERS[active.move](f) : 0;
    const meter = guided ? phase : s;
    this.els.meter.style.width = `${Math.round(meter * 100)}%`;
    this.els.meter.style.background = s >= 0.85 ? "#ffd60a" : "#c77dff";
    const tip = guided ? `${MOVE_UI[active.move].icon} ${guidedTip(active.move, phase)}`
      : !f ? t("game.notVisible")
      : !active ? t("game.ready")
      : `${MOVE_UI[active.move].icon} ${MOVE_UI[active.move].tip}`;
    if (this.els.tip.textContent !== tip) this.els.tip.textContent = tip;

    // voice: announce each note as it becomes active (pair cue once per pair)
    const i = this.notes.indexOf(active);
    if (i >= 0 && i !== this.idx) {
      this.idx = i;
      const move = active.move;
      const prev = this.notes[i - 1];
      const pair = dancePair(move);
      const key = pair && prev && prev.move === pair ? `pair.${pair.replace(/_[lr]$/, "")}` : `move.${move}`;
      const now = performance.now() / 1000;
      if (this.voice && key !== this.said.key || now - this.said.at > COOLDOWN) {
        this.said = { key, at: now };
        this.voice?.say(key, { duck: false });
      }
    }
  }
}
