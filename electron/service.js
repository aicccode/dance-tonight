// Application service: everything the old HTTP API did, minus HTTP.
// Pure Node (no Electron imports) so it is unit-testable.
import { MOVES, MOVE_MET } from "../web/js/core/moves.js";
import { DANCE_MET } from "../web/js/dance/dancemoves.js";
import { SPEED_MOVES, TOTAL_DAYS, clampDay, dayPlan, estimateKcal, speedPlan } from "../web/js/core/program.js";
import { generateChart } from "../web/js/core/chart.js";
import { localDate } from "./store.js";

const DEFAULT_WEIGHT = 70;
const BASELINE_MET = 1.8; // light movement between notes
const MET_OF = (m) => MOVE_MET[m] ?? DANCE_MET[m] ?? null;
const MODES = new Set(["train", "speed", "dance"]);

export class ServiceError extends Error {}

const addDays = (iso, n) => {
  const [y, m, d] = iso.split("-").map(Number);
  return localDate(new Date(y, m - 1, d + n));
};
const daysBetween = (a, b) => {
  const [y1, m1, d1] = a.split("-").map(Number);
  const [y2, m2, d2] = b.split("-").map(Number);
  return Math.round((new Date(y2, m2 - 1, d2) - new Date(y1, m1 - 1, d1)) / 86400000);
};

function assertNumber(v, name, lo, hi) {
  if (typeof v !== "number" || !Number.isFinite(v) || v < lo || v > hi) {
    throw new ServiceError(`${name} 无效`);
  }
}

export class Service {
  constructor(store, { today = () => localDate() } = {}) {
    this.store = store;
    this.today = today;
  }

  startDate() {
    let sd = this.store.getSetting("start_date");
    if (!sd) {
      sd = this.today();
      this.store.setSetting("start_date", sd);
    }
    return sd;
  }

  currentDay() {
    return clampDay(daysBetween(this.startDate(), this.today()) + 1);
  }

  streak() {
    const done = new Set(this.store.dailyTotals().map((d) => d.date));
    let cur = this.today();
    if (!done.has(cur)) cur = addDays(cur, -1);
    let n = 0;
    while (done.has(cur)) {
      n++;
      cur = addDays(cur, -1);
    }
    return n;
  }

  state() {
    const day = this.currentDay();
    const today = this.store.dailyTotals().find((d) => d.date === this.today()) ?? {};
    return {
      day, total_days: TOTAL_DAYS, start_date: this.startDate(), plan: dayPlan(day),
      today_seconds: today.seconds ?? 0, today_kcal: today.kcal ?? 0,
      streak: this.streak(), weight_kg: this.store.latestWeight(), moves: MOVES,
    };
  }

  restart(startDate) {
    const d = startDate || this.today();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new ServiceError("日期格式应为 YYYY-MM-DD");
    this.store.setSetting("start_date", d);
    return this.state();
  }

  plan() {
    const sd = this.startDate();
    const totals = new Map(this.store.dailyTotals().map((d) => [d.date, d]));
    return Array.from({ length: TOTAL_DAYS }, (_, i) => {
      const p = dayPlan(i + 1);
      const date = addDays(sd, i);
      const t = totals.get(date);
      return { ...p, date, done_seconds: t?.seconds ?? 0, completed: !!t && t.seconds >= p.minutes * 60 * 0.8 };
    });
  }

  songs() {
    return this.store.listSongs().map((s) => ({
      ...s, best: this.store.bestScore(s.id), best_speed: this.store.bestScore(s.id, "speed"),
      best_dance: this.store.bestScore(s.id, "dance"),
    }));
  }

  chart(songId, day = null, mode = "train") {
    if (!MODES.has(mode)) throw new ServiceError("未知模式");
    const song = this.store.getSong(songId);
    const analysis = this.store.getAnalysis(songId);
    if (!song || !analysis) throw new ServiceError("歌曲不存在或还没分析完");
    const d = day ? clampDay(day) : this.currentDay();
    const [plan, only] = mode === "speed" ? [speedPlan(), SPEED_MOVES] : [dayPlan(d), null];
    return {
      song_id: song.id, mode, day: d, plan,
      tempo: analysis.tempo, duration: analysis.duration, beats: analysis.beats,
      notes: generateChart(analysis, plan, song.id, only),
      best: this.store.bestScore(song.id, mode),
    };
  }

  leaderboard(songId, mode = "speed") {
    if (!MODES.has(mode)) throw new ServiceError("未知模式");
    if (!this.store.getSong(songId)) throw new ServiceError("歌曲不存在");
    return this.store.leaderboard(songId, mode);
  }

  saveSession(body) {
    const mode = body.mode ?? "train";
    if (!MODES.has(mode)) throw new ServiceError("未知模式");
    assertNumber(body.score, "score", 0, 1e7);
    assertNumber(body.accuracy, "accuracy", 0, 1);
    assertNumber(body.max_combo, "max_combo", 0, 1e5);
    assertNumber(body.duration_s, "duration_s", 0.001, 4 * 3600);
    const day = body.day ? clampDay(body.day) : this.currentDay();
    const weight = this.store.latestWeight() ?? DEFAULT_WEIGHT;
    // energy = weight x sum(performed moves x their MET x one beat) + baseline.
    // Only notes actually hit (good or better) count; misses don't burn game kcal.
    let kcal = null;
    if (body.move_counts && Number.isFinite(body.tempo) && body.tempo >= 40 && body.tempo <= 240) {
      const beat = 60 / body.tempo;
      let work = BASELINE_MET * body.duration_s;
      for (const [move, n] of Object.entries(body.move_counts)) {
        const met = MET_OF(move);
        if (met && Number.isInteger(n) && n > 0 && n <= 100000) work += met * Math.min(n, 100000) * beat;
      }
      kcal = Math.round(((work * weight) / 3600) * 10) / 10;
    }
    if (kcal === null) {
      const met = mode === "speed" ? speedPlan().met : dayPlan(day).met;
      kcal = estimateKcal(met, weight, body.duration_s);
    }
    const prev = body.song_id ? this.store.bestScore(body.song_id, mode) : null;
    const counts = Object.fromEntries(
      Object.entries(body.counts ?? {}).filter(([k, v]) => /^[a-z]{1,10}$/.test(k) && Number.isInteger(v)),
    );
    const saved = this.store.addSession({
      song_id: body.song_id ?? null, mode, day, date: this.today(), score: Math.round(body.score),
      accuracy: body.accuracy, max_combo: body.max_combo, counts, duration_s: body.duration_s, kcal,
    });
    return { ...saved, previous_best: prev, new_best: prev === null || body.score > prev };
  }

  sessions(limit = 50) {
    return this.store.listSessions(Math.max(1, Math.min(500, limit)));
  }

  stats() {
    const totals = this.store.dailyTotals();
    return {
      days_trained: totals.length,
      total_seconds: totals.reduce((a, t) => a + t.seconds, 0),
      total_kcal: Math.round(totals.reduce((a, t) => a + t.kcal, 0) * 10) / 10,
      daily: totals,
      body: this.store.bodyHistory(),
    };
  }

  logBody({ weight_kg = null, waist_cm = null } = {}) {
    if (weight_kg == null && waist_cm == null) throw new ServiceError("至少填写体重或腰围");
    if (weight_kg != null) assertNumber(weight_kg, "体重", 20, 400);
    if (waist_cm != null) assertNumber(waist_cm, "腰围", 30, 300);
    return this.store.logBody(this.today(), weight_kg, waist_cm);
  }
}
