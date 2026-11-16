// One song play-through: calibrate -> play -> results.
import { computeFeatures, thighNorm, toPoints } from "./features.js";
import { MISS, Scorer, matchAll } from "./judge.js";
import { t } from "./i18n/index.js";
import { MOVE_UI } from "./moves.js";
import { completeGuided, DANCE_MOVES, guidedTip } from "./dance/dancemoves.js";
import {
  GRADE_COLOR, GRADE_TEXT, coverRect, drawBeatPulse, drawCenterText, drawNote,
  drawPopups, drawSkeleton, drawVideo,
} from "./render.js";

const CALIB_SECONDS = 1.2;
const CALIB_CUE_EVERY_S = 6;
const HP_DELTA = { perfect: 3, great: 1, good: -4, miss: -14 };
const SPEED_RAMP = 0.12;
const LEG_MOVES = new Set(["squat", "knee_l", "knee_r", "jack", "cross_l", "cross_r"]);
// clip move names come from user-imported files; they must not inject HTML
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export class Game {
  /**
   * @param o.canvas, o.video, o.audio  DOM elements
   * @param o.detector  from createPoseDetector
   * @param o.chart     /api/songs/:id/chart response
   * @param o.moves     move catalog (names)
   * @param o.hud       { score, combo, acc, progress, next, hint }
   * @param o.settings  { latencyMs, skeleton, eyesClosed, speedRamp }
   * @param o.mode      "train" | "speed"
   * @param o.voice     VoiceCoach | null
   * @param o.coach     Coach | null
   */
  constructor(o) {
    Object.assign(this, o);
    this.ctx = this.canvas.getContext("2d");
    this.scorer = new Scorer(this.chart.notes);
    this.popups = [];
    this.phase = "calibrate";
    this.calib = [];
    this.calibStart = null;
    this.baseline = o.baseline ?? null;
    this.beatIdx = 0;
    this.paused = false;
    this.approach = Math.max(1.2, (2 * 60) / this.chart.tempo);
    this.needLegs = this.chart.notes.some((n) => LEG_MOVES.has(n.move));
    this.mode = o.mode ?? "train";
    this.voice = o.voice ?? null;
    this.coach = o.coach ?? null;
    this.hp = 100;
    this.failed = false;
    this.dangerSaid = false;
    this.missRun = 0;
    this.rateStep = 0;
    this.calibCue = {};
  }

  run() {
    return new Promise((resolve) => {
      this.resolve = resolve;
      this.onKey = (e) => this.#key(e);
      this.onEnded = () => this.#end(false);
      window.addEventListener("keydown", this.onKey);
      this.audio.addEventListener("ended", this.onEnded);
      this.audio.playbackRate = 1;
      this.voice?.prepare(this.chart, {
        eyesClosed: !!this.settings.eyesClosed, ticks: !!this.settings.eyesClosed, countIn: true,
      });
      this.coach?.follow(() => ({
        notes: this.chart.notes, t: this.phase === "play" ? this.songTime : -10, bpm: this.chart.tempo,
      }));
      this.#frame();
    });
  }

  #key(e) {
    if (e.code === "Escape") this.#end(true);
    else if (e.code === "Space") {
      e.preventDefault();
      if (this.phase === "calibrate") {
        this.baseline ??= { thigh: { l: 0.6, r: 0.6 } }; // reuse last calibration if any
        this.#startPlay();
      } else if (this.phase === "play") {
        this.paused = !this.paused;
        this.paused ? this.audio.pause() : this.audio.play();
        if (this.voice) this.voice.enabled = !this.paused;
      }
    }
  }

  #startPlay() {
    this.phase = "play";
    this.audio.currentTime = 0;
    this.audio.play();
    this.voice?.say(this.mode === "speed" ? "speed.start" : "calib.done");
  }

  /** Throttled calibration voice prompt. */
  #calibSay(key) {
    const now = performance.now() / 1000;
    if (!this.voice || now - (this.calibCue[key] ?? -99) < CALIB_CUE_EVERY_S) return;
    this.calibCue = { [key]: now };
    this.voice.say(key, { duck: false });
  }

  get songTime() {
    return this.audio.currentTime - (this.settings.latencyMs ?? 0) / 1000;
  }

  #frame = () => {
    if (this.phase === "done") return;
    try {
      this.#render();
    } finally {
      // keep the loop alive even if one frame throws (e.g. a missing move entry)
      requestAnimationFrame(this.#frame);
    }
  };

  #render() {
    const c = this.canvas;
    if (c.width !== c.clientWidth || c.height !== c.clientHeight) {
      c.width = c.clientWidth;
      c.height = c.clientHeight;
    }
    const v = this.video;
    const rect = coverRect(v.videoWidth || 16, v.videoHeight || 9, c.width, c.height);
    const lm = this.detector.detect(v);
    const aspect = (v.videoWidth || 16) / (v.videoHeight || 9);
    const pts = lm ? toPoints(lm, aspect) : null;
    const f = pts ? computeFeatures(pts, this.baseline) : null;

    drawVideo(this.ctx, v, rect);
    if (this.settings.skeleton !== false) drawSkeleton(this.ctx, lm, rect);

    if (this.phase === "calibrate") this.#calibrate(pts, f);
    else this.#play(f);
  }

  #calibrate(pts, f) {
    const now = performance.now() / 1000;
    const ok = f && f.lowerVisible && f.upperVisible && f.wristUp.l < -0.3 && f.wristUp.r < -0.3;
    if (!ok) {
      this.calib = [];
      this.calibStart = null;
    } else {
      this.calibStart ??= now;
      this.calib.push(thighNorm(pts));
    }
    const p = this.calibStart ? Math.min(1, (now - this.calibStart) / CALIB_SECONDS) : 0;
    if (!f || !f.lowerVisible) this.#calibSay("calib.enter");
    else if (!ok) this.#calibSay("calib.stand");
    const msg = !f ? t("game.noPerson")
      : !f.lowerVisible ? t("game.moveBack")
      : !ok ? t("game.standStill") : t("game.holdStill").replace("{p}", Math.round(p * 100));
    drawCenterText(this.ctx, [
      { text: t("game.calibrate"), size: 0.06, color: "#ffd60a" },
      { text: msg },
      { text: t("game.calibHint"), size: 0.03, weight: 400, color: "#aaa" },
    ]);
    if (p >= 1) {
      const avg = (s) => this.calib.reduce((a, t) => a + t[s], 0) / this.calib.length;
      this.baseline = { thigh: { l: avg("l"), r: avg("r") } };
      this.#startPlay();
    }
  }

  #play(f) {
    const t = this.songTime;
    const ctx = this.ctx;
    const matches = completeGuided(matchAll(f), this.mode);

    if (!this.paused) {
      this.voice?.update(t);
      for (const ev of this.scorer.update(t, matches)) {
        this.#popup(ev);
        this.#react(ev, t);
      }
      if (this.mode === "speed") this.#ramp(t);
      if (this.failed) {
        this.#end(false);
        return;
      }
      // a custom sequence ends with its last move: fade the music, then finish
      if (this.chart.endAt) {
        this.audio.volume = Math.max(0, Math.min(1, this.chart.endAt - t));
        if (t >= this.chart.endAt) {
          this.#end(false);
          return;
        }
      }
    }

    // beat pulse
    const beats = this.chart.beats;
    while (this.beatIdx + 1 < beats.length && beats[this.beatIdx + 1] <= t) this.beatIdx++;
    const sinceBeat = t - beats[this.beatIdx];
    drawBeatPulse(ctx, sinceBeat >= 0 ? Math.exp(-sinceBeat * 8) : 0);

    // notes: upcoming within approach window + active ones
    const active = new Set(this.scorer.active(t).map((n) => n.id));
    const visible = [];
    for (let i = this.scorer.cursor; i < this.scorer.notes.length; i++) {
      const n = this.scorer.notes[i];
      if (n.t - t > this.approach) break;
      if (!this.scorer.results.has(n.id)) visible.push(n);
    }
    for (const n of visible.reverse()) {
      const m = active.has(n.id) ? matches[n.move] : 0;
      drawNote(ctx, n, n.t - t, this.approach, m, this.moves[n.move]?.name ?? n.move);
    }
    drawPopups(ctx, this.popups, t);
    if (t < (this.chart.notes[0]?.t ?? 0) - 0.5) {
      drawCenterText(ctx, [{ text: t("game.ready"), size: 0.07 }, { text: `${Math.ceil(this.chart.notes[0].t - t)}` }]);
    }
    if (this.paused) drawCenterText(ctx, [{ text: t("game.paused"), size: 0.07 }, { text: t("game.pausedHint") }]);
    this.#hud(t, f, visible);
  }

  /** Voice/coach reactions and speed-mode HP. */
  #react(ev, t) {
    const g = ev.grade.name;
    this.missRun = g === "miss" ? this.missRun + 1 : 0;
    if (ev.combo > 0 && ev.combo % 10 === 0) {
      this.coach?.cheer();
      this.voice?.maybeSay(["fb.nice1", "fb.nice2", "fb.combo"][(ev.combo / 10) % 3], t);
    } else if (this.missRun === 3) {
      this.voice?.maybeSay(this.mode === "speed" ? "fb.keep" : "fb.miss", t);
    }
    if (this.mode !== "speed") return;
    this.hp = Math.max(0, Math.min(100, this.hp + HP_DELTA[g]));
    if (this.hp <= 0) this.failed = true;
    else if (this.hp < 30 && !this.dangerSaid) {
      this.dangerSaid = true;
      this.voice?.maybeSay("speed.danger", t);
    } else if (this.hp > 55) this.dangerSaid = false;
  }

  /** Speed mode: music gradually speeds up (pitch preserved). */
  #ramp(t) {
    if (!this.settings.speedRamp) return;
    const rate = 1 + SPEED_RAMP * Math.min(1, Math.max(0, t / this.chart.duration));
    this.audio.playbackRate = Math.round(rate * 100) / 100;
    const step = Math.floor((rate - 1) / 0.04);
    if (step > this.rateStep) {
      this.rateStep = step;
      this.voice?.maybeSay("speed.faster", t);
    }
  }

  #popup(ev) {
    const ui = MOVE_UI[ev.note.move];
    if (!ui) return; // unknown move: skip the popup instead of killing the frame
    const { width: W, height: H } = this.canvas;
    this.popups = [
      ...this.popups.filter((p) => this.songTime - p.born < 1),
      {
        text: ev.grade === MISS ? "MISS" : `${GRADE_TEXT[ev.grade.name]}${ev.combo > 4 ? ` ×${ev.combo}` : ""}`,
        color: GRADE_COLOR[ev.grade.name],
        x: ui.zone[0] * W,
        y: ui.zone[1] * H - Math.min(W, H) * 0.1,
        born: this.songTime,
      },
    ];
  }

  #hud(t, f, visible) {
    const h = this.hud;
    const s = this.scorer;
    h.score.textContent = s.score.toLocaleString();
    h.combo.textContent = s.combo > 1 ? `${s.combo} COMBO` : "";
    h.acc.textContent = s.judged ? `${Math.round(s.accuracy * 100)}%` : "--";
    h.progress.style.width = `${Math.min(100, (t / this.chart.duration) * 100)}%`;
    if (h.hp) h.hp.style.width = `${this.hp}%`;
    const upcoming = visible.slice(-1).concat(
      s.notes.slice(s.cursor).filter((n) => n.t > t + this.approach).slice(0, 5),
    );
    const html = upcoming
      .slice(0, 6)
      .map((n) => `<span title="${esc(this.moves[n.move]?.name)}">${MOVE_UI[n.move]?.icon ?? "✨"}${MOVE_UI[n.move]?.arrow ?? ""}</span>`)
      .join("");
    if (h.next.innerHTML !== html) h.next.innerHTML = html;
    const first = visible[visible.length - 1];
    const guided = this.mode === "dance" && DANCE_MOVES[first?.move]?.guided;
    const hint = guided
      ? `${MOVE_UI[first.move]?.icon ?? "✨"} ${guidedTip(first.move, (t - first.t) / first.hold)}`
      : !f ? t("game.notVisible")
      : this.needLegs && !f.lowerVisible ? t("game.legsVisible")
      : first ? MOVE_UI[first.move]?.tip ?? "" : "";
    if (h.hint.textContent !== hint) h.hint.textContent = hint;
  }

  #end(quit) {
    if (this.phase === "done") return;
    const played = this.audio.currentTime;
    this.phase = "done";
    this.audio.pause();
    this.audio.playbackRate = 1;
    this.audio.volume = 1;
    window.removeEventListener("keydown", this.onKey);
    this.coach?.idle();
    this.audio.removeEventListener("ended", this.onEnded);
    if (!quit) this.scorer.finishAll(); // quitting shouldn't count unplayed notes as misses
    const s = this.scorer;
    const moveCounts = {};
    for (const ev of s.results.values()) {
      if (ev.grade !== MISS) moveCounts[ev.note.move] = (moveCounts[ev.note.move] ?? 0) + 1;
    }
    if (this.voice) {
      this.voice.reset();
      this.voice.enabled = true;
      if (!quit) {
        const good = s.accuracy >= (this.chart.plan.target_accuracy ?? 0.7);
        this.voice.say(this.mode === "speed" ? (this.failed ? "speed.fail" : "speed.clear") : good ? "end.good" : "end.ok", { duck: false });
      }
    }
    this.resolve({
      quit,
      mode: this.mode,
      failed: this.failed,
      moveCounts,
      tempo: this.chart.tempo,
      score: s.score,
      accuracy: s.accuracy,
      max_combo: s.maxCombo,
      counts: { ...s.counts },
      duration_s: Math.max(1, played),
      baseline: this.baseline,
    });
  }
}
