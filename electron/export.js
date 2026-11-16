// Encrypted data export/import (.dtx container).
//
// Format (zip):
//   manifest.json                      plain: version, identity, categories, file list
//   data.enc                           SM9(SM4 mode) of gzip(JSON payload)
//   music/<hash20>_<size><ext>.enc     SM9(SM4 mode) per song copy (optional)
//
// Crypto: SM9 (GB/T 33549) from the vendored smx library (vendor/smx, MIT).
// The KGC master key is derived from the user's account + passphrase
// (domain-separated SM3, reduced mod the SM9 group order), the SM9 identity
// is the account id. The same account+passphrase on another device decrypts;
// the key never leaves the user.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { gzipSync, gunzipSync, strToU8, strFromU8, unzipSync, Zip, ZipPassThrough } from "fflate";
import { getSM3, getSM9, SM9_HID_ENCRYPT, SM9_MODE_SM4 } from "../vendor/smx/index.js";
import { bytesToHex, hexToBytes } from "../vendor/smx/common/utils.js";
import { validateClip } from "../web/js/core/danceclip.js";
import { cleanRoutine } from "../web/js/core/choreo_edit.js";
import { clipMoveDefs } from "../web/js/core/clipmoves.js";
import { registerClipMoves } from "../web/js/dance/dancemoves.js";

export const EXPORT_VERSION = 1;
const SALT = "dance-tonight/data-export/v1";
const SM9_ORDER = 0xb640000002a3a6f1d603ab4ff58ec74449f2934b18ea8beee56ee19cd69ecf25n;
const HIDDEN_SETTINGS = new Set(["dashscope_key_enc"]); // machine-bound, never exported

export const CATEGORIES = [
  { id: "sessions", name: "锻炼记录" },
  { id: "body", name: "体重与腰围" },
  { id: "routines", name: "我的编舞" },
  { id: "dances", name: "导入的动捕" },
  { id: "music", name: "歌曲副本" },
  { id: "analysis", name: "节拍分析" },
  { id: "settings", name: "设置" },
];
const CAT_IDS = new Set(CATEGORIES.map((c) => c.id));

const sm9 = getSM9();
const sm3Hex = (s) => getSM3().updateString(s).hexDigest().toLowerCase();

/** Deterministic SM9 encryption master key from an optional account + passphrase.
 *  New exports are passphrase-only (account = ""); legacy .dtx packages bind
 *  the key to the account stored in their plain manifest, which importFrom
 *  picks up automatically. */
export function deriveMasterKey(account, passphrase) {
  const a = String(account ?? "").trim();
  const p = String(passphrase ?? "");
  if (p.length < 8) throw new Error("口令至少 8 位（用于派生加密密钥）");
  const lo = BigInt(`0x${sm3Hex(`${SALT}|${a}|${p}|lo`)}`);
  const hi = BigInt(`0x${sm3Hex(`${SALT}|${a}|${p}|hi`)}`);
  const ke = ((hi << 256n) | lo) % SM9_ORDER;
  if (ke === 0n) throw new Error("派生密钥无效，请更换口令");
  return ke.toString(16).padStart(64, "0");
}

const encBytes = (bytes, identity, ppub) =>
  hexToBytes(sm9.sm9Encrypt(bytes, identity, ppub, SM9_HID_ENCRYPT, SM9_MODE_SM4));

const decBytes = (bytes, identity, ke) => {
  const de = sm9.sm9GenEncUserKey(ke, identity);
  return sm9.sm9Decrypt(bytesToHex(bytes), identity, de, SM9_MODE_SM4);
};

/** Same content key as main.js: sha1 of the first 1MB + size. */
function contentKey(bytes) {
  const head = bytes.subarray(0, Math.min(bytes.length, 1 << 20));
  return `${createHash("sha1").update(head).digest("hex")}:${bytes.length}`;
}

function zipBytes(entries) {
  return new Promise((res, rej) => {
    const chunks = [];
    const zip = new Zip((err, data, final) => {
      if (err) return rej(err);
      if (data) chunks.push(data);
      if (final) res(concat(chunks));
    });
    for (const e of entries) {
      const f = new ZipPassThrough(e.name);
      zip.add(f);
      for (let off = 0; off < e.data.length; off += 1 << 20) {
        f.push(e.data.subarray(off, Math.min(e.data.length, off + (1 << 20))));
      }
      f.push(new Uint8Array(0), true);
    }
    zip.end();
  });
}

const concat = (list) => {
  const n = list.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(n);
  for (let i = 0, o = 0; i < list.length; i++) {
    out.set(list[i], o);
    o += list[i].length;
  }
  return out;
};

export class DataExporter {
  /** @param store Store, @param music MusicLibrary, @param dances Dances */
  constructor(store, music, dances) {
    this.store = store;
    this.music = music;
    this.dances = dances;
  }

  #normalizeCategories(categories) {
    const set = new Set((categories ?? CATEGORIES.map((c) => c.id)).filter((c) => CAT_IDS.has(c)));
    return Object.fromEntries(CATEGORIES.map((c) => [c.id, set.has(c.id)]));
  }

  #songsSnapshot() {
    return this.store.listSongs().map((s) => ({
      title: s.title, source: s.source, size: s.size, key: s.key,
      ext: (s.path?.match(/\.[^.]+$/)?.[0] ?? ".mp3").toLowerCase(),
      duration: s.duration, tempo: s.tempo, engine: s.engine,
    }));
  }

  /** Plain (unencrypted) snapshot of the selected categories. Used by .dtx export and cloud sync. */
  buildPayload(categories) {
    const cats = this.#normalizeCategories(categories);
    const payload = { version: EXPORT_VERSION, categories: cats };
    if (cats.settings) {
      const settings = { ...this.store.data.settings };
      for (const k of HIDDEN_SETTINGS) delete settings[k];
      payload.settings = settings;
    }
    if (cats.sessions) payload.sessions = structuredClone(this.store.data.sessions);
    if (cats.body) payload.body = this.store.bodyHistory();
    if (cats.routines) payload.routines = this.store.listRoutines();
    if (cats.dances) {
      payload.dances = this.dances.list()
        .filter((c) => c.kind === "user" && !c.error)
        .map((c) => this.dances.data(c.id));
    }
    if (cats.music || cats.analysis) {
      payload.songs = this.#songsSnapshot();
      if (cats.analysis) {
        payload.analysis = {};
        for (const s of this.store.listSongs()) {
          const a = s.key && this.store.getAnalysis(s.id);
          if (a && s.key) payload.analysis[s.key] = a;
        }
      }
    }
    return payload;
  }

  /** Same content as .dtx import, applied to a plain payload (cloud sync uses this). */
  applySnapshot(payload, categories) {
    const cats = this.#normalizeCategories(categories);
    const out = { errors: [], sessions: 0, body: 0, routines: 0, dances: 0, songs: 0, analyses: 0, skipped: 0 };
    if (!payload || payload.version !== EXPORT_VERSION) throw new Error("数据快照无效");

    if (cats.dances && Array.isArray(payload.dances)) {
      const known = this.dances.list()
        .filter((c) => c.kind === "user")
        .map((c) => `${c.name}|${c.duration?.toFixed(2)}`);
      for (const raw of payload.dances) {
        try {
          const clip = validateClip(raw);
          if (known.includes(`${clip.name}|${clip.duration.toFixed(2)}`)) { out.skipped++; continue; }
          this.dances.save(clip);
          out.dances++;
        } catch (err) {
          out.errors.push(`动捕 ${raw?.name ?? "?"}: ${err.message}`);
        }
      }
    }
    if (cats.settings && payload.settings) {
      for (const [k, v] of Object.entries(payload.settings)) {
        if (!HIDDEN_SETTINGS.has(k)) this.store.setSetting(k, v);
      }
    }
    if (cats.sessions && Array.isArray(payload.sessions)) {
      const seen = new Set(this.store.data.sessions.map((s) => `${s.created_at}|${s.score}`));
      for (const s of payload.sessions) {
        if (seen.has(`${s.created_at}|${s.score}`)) { out.skipped++; continue; }
        this.store.addSession({ ...s, id: undefined });
        out.sessions++;
      }
      this.store.save();
    }
    if (cats.body && Array.isArray(payload.body)) {
      for (const b of payload.body) {
        if (!b?.date) continue;
        this.store.logBody(b.date, b.weight_kg ?? null, b.waist_cm ?? null);
        out.body++;
      }
    }
    if (cats.analysis && payload.analysis) {
      const songs = this.store.listSongs().filter((s) => s.key);
      const byKey = new Map(songs.map((s) => [s.key, s]));
      for (const [key, a] of Object.entries(payload.analysis)) {
        const song = byKey.get(key);
        if (!song || song.status === "ready") { out.skipped++; continue; }
        if (!a || !Array.isArray(a.beats) || a.beats.length < 8) continue;
        this.store.saveAnalysis(song.id, a);
        out.analyses++;
      }
    }
    if (cats.routines && Array.isArray(payload.routines)) {
      registerClipMoves(clipMoveDefs(this.dances.list())); // clip sections are valid moves too
      for (const r of payload.routines) {
        try {
          this.store.saveRoutine(cleanRoutine(r));
          out.routines++;
        } catch (err) {
          out.errors.push(`编舞 ${r?.name ?? "?"}: ${err.message}`);
        }
      }
    }
    this.store.save();
    return out;
  }

  /** Register a single song from raw bytes (cloud sync file download). */
  importSongBytes(key, ext, bytes) {
    if (!/^[0-9a-f]{40}:\d+$/.test(String(key ?? ""))) throw new Error("无效的歌曲指纹");
    const copy = this.music.write(key, ext ?? ".mp3", Buffer.from(bytes));
    return this.store.addSong({
      path: copy, source: null, title: basename(copy).replace(/\.[^.]+$/, ""),
      size: bytes.length, key,
    });
  }

  /** Build the .dtx export file. Returns a summary. */
  async exportTo(path, { account, passphrase, categories } = {}) {
    const identity = String(account ?? "").trim();
    const cats = this.#normalizeCategories(categories);
    const ke = deriveMasterKey(identity, passphrase);
    const ppub = sm9.sm9EncMasterPublicKey(ke);

    const payload = this.buildPayload(categories);
    const entries = [];
    const files = [];

    const data = gzipSync(strToU8(JSON.stringify(payload)));
    entries.push({ name: "data.enc", data: encBytes(data, identity, ppub) });

    if (cats.music) {
      for (const s of this.store.listSongs()) {
        if (!s.key || !existsSync(s.path)) continue;
        const raw = readFileSync(s.path);
        const enc = encBytes(raw, identity, ppub);
        const [hash, size] = s.key.split(":");
        const name = `music/${hash.slice(0, 20)}_${size}${s.path.match(/\.[^.]+$/)?.[0] ?? ".mp3"}`;
        entries.push({ name: `${name}.enc`, data: enc });
        files.push({ entry: `${name}.enc`, key: s.key, size: raw.length });
      }
    }

    const manifest = {
      version: EXPORT_VERSION, app: "dance-tonight", created_at: new Date().toISOString(),
      identity: identity || null, categories: cats, encrypted: "SM9/SM4", files,
    };
    entries.unshift({ name: "manifest.json", data: strToU8(JSON.stringify(manifest, null, 1)) });

    writeFileSync(path, await zipBytes(entries));
    return {
      path, identity, categories: cats,
      songs: payload.songs?.length ?? 0, sessions: payload.sessions?.length ?? 0,
      body: payload.body?.length ?? 0, routines: payload.routines?.length ?? 0,
      dances: payload.dances?.length ?? 0, analyses: Object.keys(payload.analysis ?? {}).length,
      bytes: entries.reduce((a, e) => a + e.data.length, 0),
    };
  }

  /** Import from a .dtx file. Returns per-category counts and errors.
   *  Import is incremental: sessions are deduped by timestamp+score, dance
   *  clips by name+duration, songs by content hash; body entries upsert by
   *  date and analyses only fill songs that are not analysed yet. */
  async importFrom(path, { account, passphrase, categories } = {}) {
    const want = this.#normalizeCategories(categories);

    const z = unzipSync(new Uint8Array(readFileSync(path)));
    const manifest = JSON.parse(strFromU8(z["manifest.json"]));
    if (manifest?.version !== EXPORT_VERSION || manifest?.app !== "dance-tonight") {
      throw new Error("不是本应用的导出包（或版本不兼容）");
    }
    // legacy packages bound the key to an account (stored in the plain
    // manifest); passphrase-only packages carry no identity
    const identity = String(manifest.identity ?? "").trim();
    if (identity && account && identity !== String(account).trim()) {
      throw new Error("不是本账号的导出包（或版本不兼容）");
    }
    const ke = deriveMasterKey(identity, passphrase);

    const enc = z["data.enc"];
    if (!enc) throw new Error("导出包缺少数据文件");
    let payload;
    try {
      payload = JSON.parse(strFromU8(gunzipSync(decBytes(enc, identity, ke))));
    } catch {
      throw new Error("解密失败：口令不对");
    }

    // music lives as individual zip entries; decrypt + verify each one
    const out = { errors: [], sessions: 0, body: 0, routines: 0, dances: 0, songs: 0, analyses: 0, skipped: 0 };
    if (want.music && Array.isArray(payload.songs)) {
      const byName = new Map(manifest.files?.map((f) => [f.entry, f]) ?? []);
      const songsBefore = this.store.listSongs().length;
      for (const song of payload.songs) {
        try {
          const [hash, size] = String(song.key ?? "").split(":");
          const entryName = `music/${hash?.slice(0, 20)}_${size}${song.ext ?? ".mp3"}.enc`;
          const enc2 = byName.has(entryName) ? z[entryName] : null;
          if (!song.key || !enc2) { out.skipped++; continue; }
          const bytes = decBytes(enc2, identity, ke);
          if (contentKey(bytes) !== song.key) throw new Error("内容校验失败");
          this.music.write(song.key, song.ext ?? ".mp3", bytes);
          this.store.addSong({
            path: this.music.pathFor(song.key, `f${song.ext ?? ".mp3"}`),
            source: song.source ?? null, title: song.title ?? "song",
            size: song.size ?? bytes.length, key: song.key,
          });
        } catch (err) {
          out.errors.push(`歌曲 ${song.title ?? "?"}: ${err.message}`);
        }
      }
      out.songs = this.store.listSongs().length - songsBefore; // addSong dedupes by key
    }

    // everything else (dances, settings, sessions, body, analysis, routines)
    const applied = this.applySnapshot(payload, categories);
    out.errors.push(...applied.errors);
    for (const k of ["sessions", "body", "routines", "dances", "analyses", "skipped"]) out[k] += applied[k];
    return out;
  }
}
