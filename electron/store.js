// Local JSON data store (no native modules => painless Win/macOS/Linux builds).
// data.json holds settings, songs, sessions and body log; per-song analyses
// live in analysis/<id>.json to keep the main file small. Writes are atomic.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";

const EMPTY = { version: 1, settings: {}, songs: [], sessions: [], body: [], routines: [], nextSongId: 1, nextSessionId: 1 };
export const MAX_ROUTINES = 200;

const now = () => new Date().toISOString().slice(0, 19);
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function writeAtomic(path, text) {
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, text);
  renameSync(tmp, path);
}

export class Store {
  constructor(dir) {
    this.dir = dir;
    this.file = join(dir, "data.json");
    this.analysisDir = join(dir, "analysis");
    mkdirSync(this.analysisDir, { recursive: true });
    this.data = existsSync(this.file)
      ? { ...EMPTY, ...JSON.parse(readFileSync(this.file, "utf8")) }
      : structuredClone(EMPTY);
  }

  save() {
    writeAtomic(this.file, JSON.stringify(this.data));
  }

  // ---------------- settings ----------------
  getSetting(key, fallback = null) {
    return this.data.settings[key] ?? fallback;
  }

  setSetting(key, value) {
    if (value === null || value === undefined) delete this.data.settings[key];
    else this.data.settings[key] = value;
    this.save();
  }

  // ---------------- songs ----------------
  listSongs() {
    return this.data.songs.map((s) => ({ ...s }));
  }

  getSong(id) {
    const s = this.data.songs.find((x) => x.id === Number(id));
    return s ? { ...s } : null;
  }

  findSongByPath(path) {
    return this.data.songs.find((s) => s.path === path) ?? null;
  }

  /** Register a file; analysis comes later. Same path or same content = same song. */
  addSong({ path, title, size, key, source = null }) {
    const existing = this.findSongByPath(path) ?? (key ? this.data.songs.find((s) => s.key === key) : null);
    if (existing) return { ...existing };
    const song = {
      id: this.data.nextSongId++, path, source, title, size, key,
      status: "pending", duration: null, tempo: null, engine: null, error: null, created_at: now(),
    };
    this.data.songs.push(song);
    this.save();
    return { ...song };
  }

  saveAnalysis(id, analysis) {
    const song = this.data.songs.find((x) => x.id === Number(id));
    if (!song) return null;
    writeAtomic(join(this.analysisDir, `${song.id}.json`), JSON.stringify(analysis));
    Object.assign(song, {
      status: "ready", duration: analysis.duration, tempo: analysis.tempo, engine: analysis.engine, error: null,
    });
    this.save();
    return { ...song };
  }

  markSongError(id, error) {
    const song = this.data.songs.find((x) => x.id === Number(id));
    if (!song) return;
    Object.assign(song, { status: "error", error: String(error).slice(0, 200) });
    this.save();
  }

  getAnalysis(id) {
    const p = join(this.analysisDir, `${Number(id)}.json`);
    return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
  }

  /** Point a song at its managed copy, remembering where it came from. */
  moveSong(id, path) {
    const song = this.data.songs.find((x) => x.id === Number(id));
    if (!song) return null;
    if (song.path !== path) song.source ??= song.path;
    song.path = path;
    if (song.status === "error" && /找不到/.test(song.error ?? "")) Object.assign(song, { status: "pending", error: null });
    this.save();
    return { ...song };
  }

  /** How many songs still use this file. */
  songsAt(path) {
    return this.data.songs.filter((s) => s.path === path).length;
  }

  removeSong(id) {
    const before = this.data.songs.length;
    this.data.songs = this.data.songs.filter((s) => s.id !== Number(id));
    rmSync(join(this.analysisDir, `${Number(id)}.json`), { force: true });
    this.save();
    return this.data.songs.length < before;
  }

  // ---------------- user choreography ----------------
  listRoutines() {
    return structuredClone(this.data.routines);
  }

  /** Insert or update an already-validated routine; returns the stored copy. */
  saveRoutine(routine) {
    const now = new Date().toISOString().slice(0, 19);
    const i = routine.id ? this.data.routines.findIndex((r) => r.id === routine.id) : -1;
    if (routine.id && i < 0) throw new Error("编舞不存在，可能已被删除");
    if (i < 0 && this.data.routines.length >= MAX_ROUTINES) throw new Error(`最多保存 ${MAX_ROUTINES} 套编舞`);
    const row = { ...structuredClone(routine), id: routine.id ?? `user:${randomBytes(6).toString("hex")}`, updated_at: now };
    if (i < 0) this.data.routines.push(row);
    else this.data.routines[i] = row;
    this.save();
    return structuredClone(row);
  }

  removeRoutine(id) {
    const before = this.data.routines.length;
    this.data.routines = this.data.routines.filter((r) => r.id !== id);
    if (this.data.routines.length !== before) this.save();
    return this.data.routines.length < before;
  }

  // ---------------- sessions ----------------
  addSession(s) {
    // created_at preserved when given (data import), else stamped now
    const row = { ...s, mode: s.mode ?? "train", id: this.data.nextSessionId++, created_at: s.created_at ?? now() };
    this.data.sessions.push(row);
    this.save();
    return { ...row };
  }

  listSessions(limit = 50) {
    return this.data.sessions.slice(-limit).reverse();
  }

  bestScore(songId, mode = "train") {
    let best = null;
    for (const s of this.data.sessions) {
      if (s.song_id === Number(songId) && s.mode === mode && (best === null || s.score > best)) best = s.score;
    }
    return best;
  }

  leaderboard(songId, mode, limit = 10) {
    return this.data.sessions
      .filter((s) => s.song_id === Number(songId) && s.mode === mode)
      .sort((a, b) => b.score - a.score || a.id - b.id)
      .slice(0, limit)
      .map(({ id, date, score, accuracy, max_combo, duration_s }) => ({ id, date, score, accuracy, max_combo, duration_s }));
  }

  dailyTotals() {
    const by = new Map();
    for (const s of this.data.sessions) {
      const d = by.get(s.date) ?? { date: s.date, day: s.day, seconds: 0, kcal: 0, accSum: 0, songs: 0 };
      d.seconds += s.duration_s;
      d.kcal += s.kcal;
      d.accSum += s.accuracy;
      d.songs++;
      by.set(s.date, d);
    }
    return [...by.values()]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(({ accSum, ...d }) => ({ ...d, accuracy: accSum / d.songs }));
  }

  // ---------------- body ----------------
  logBody(date, weight_kg, waist_cm) {
    let row = this.data.body.find((b) => b.date === date);
    if (!row) {
      row = { date, weight_kg: null, waist_cm: null };
      this.data.body.push(row);
      this.data.body.sort((a, b) => a.date.localeCompare(b.date));
    }
    if (weight_kg != null) row.weight_kg = weight_kg;
    if (waist_cm != null) row.waist_cm = waist_cm;
    this.save();
    return { ...row };
  }

  bodyHistory() {
    return this.data.body.map((b) => ({ ...b }));
  }

  latestWeight() {
    for (let i = this.data.body.length - 1; i >= 0; i--) {
      if (this.data.body[i].weight_kg != null) return this.data.body[i].weight_kg;
    }
    return null;
  }

  // ---------------- legacy import (old server version) ----------------
  importLegacy({ settings = {}, sessions = [], body = [] }) {
    let added = 0;
    if (settings.start_date) this.data.settings.start_date = settings.start_date;
    const seen = new Set(this.data.sessions.map((s) => s.created_at + s.score));
    for (const s of sessions) {
      if (seen.has(s.created_at + s.score)) continue;
      this.data.sessions.push({ ...s, song_id: null, legacy_song: s.title ?? null, id: this.data.nextSessionId++ });
      added++;
    }
    for (const b of body) {
      const row = this.data.body.find((x) => x.date === b.date);
      if (row) Object.assign(row, b);
      else this.data.body.push({ ...b });
    }
    this.data.body.sort((a, b) => a.date.localeCompare(b.date));
    this.save();
    return { sessions: added, body: body.length };
  }
}
