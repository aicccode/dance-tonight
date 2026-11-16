// Single-move practice: live match meter + rep counter.
import { computeFeatures, toPoints } from "./features.js";
import { MATCHERS } from "./judge.js";
import { MOVE_UI } from "./moves.js";
import { coverRect, drawSkeleton, drawVideo } from "./render.js";

const REP_ON = 0.8;
const REP_OFF = 0.3;

export class Practice {
  constructor({ canvas, video, detector, baseline, els }) {
    Object.assign(this, { canvas, video, detector, baseline, els });
    this.ctx = canvas.getContext("2d");
    this.move = "squat";
    this.reps = 0;
    this.up = false;
    this.running = false;
    this.runGen = 0;
  }

  setMove(move) {
    this.move = move;
    this.reps = 0;
    this.up = false;
    this.els.tip.textContent = `${MOVE_UI[move].icon} ${MOVE_UI[move].tip}`;
    this.els.reps.textContent = "0";
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.setMove(this.move);
    const gen = ++this.runGen; // a pending callback from a stopped run must not keep looping
    const loop = () => {
      if (!this.running || gen !== this.runGen) return;
      try {
        this.#frame();
      } finally {
        requestAnimationFrame(loop);
      }
    };
    loop();
  }

  stop() {
    this.running = false;
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
    drawSkeleton(this.ctx, lm, rect, "#06d6a0");
    const f = lm ? computeFeatures(toPoints(lm, (v.videoWidth || 16) / (v.videoHeight || 9)), this.baseline) : null;
    const s = f ? MATCHERS[this.move](f) : 0;
    this.els.meter.style.width = `${Math.round(s * 100)}%`;
    this.els.meter.style.background = s >= 0.85 ? "#ffd60a" : "#06d6a0";
    if (!this.up && s >= REP_ON) {
      this.up = true;
      this.reps++;
      this.els.reps.textContent = String(this.reps);
    } else if (this.up && s < REP_OFF) {
      this.up = false;
    }
  }
}
