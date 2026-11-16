// Electron main process: window, app:// protocol, permissions and IPC.
import { createHash } from "node:crypto";
import { existsSync, openSync, readFileSync, readSync, closeSync, readdirSync, statSync } from "node:fs";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, app, dialog, ipcMain, protocol, session, shell, systemPreferences } from "electron";

import { Avatars } from "./avatars.js";
import { Dances, MAX_CLIP_BYTES } from "./dances.js";
import { DataExporter, CATEGORIES, EXPORT_VERSION } from "./export.js";
import { MusicLibrary } from "./music.js";
import { cleanRoutine } from "../web/js/core/choreo_edit.js";
import { clipMoveDefs } from "../web/js/core/clipmoves.js";
import { registerClipMoves } from "../web/js/dance/dancemoves.js";
import { setLocale } from "../web/js/i18n/index.js";
import { Service } from "./service.js";
import { Store, localDate } from "./store.js";
import { VoicePacks } from "./voices.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WEB = join(ROOT, "web");
const ASSETS = join(ROOT, "assets");
const AUDIO_EXT = new Set([".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac", ".opus", ".webm"]);
const MAX_SONG_BYTES = 200 * 1024 * 1024;

if (process.env.DT_FAKE_CAMERA) {
  app.commandLine.appendSwitch("use-fake-device-for-media-stream");
  app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
}
if (process.env.DT_USER_DATA) app.setPath("userData", process.env.DT_USER_DATA);
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } },
]);

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".wasm": "application/wasm",
  ".svg": "image/svg+xml", ".png": "image/png", ".onnx": "application/octet-stream",
  ".task": "application/octet-stream", ".mp3": "audio/mpeg",
};
const CSP_BASE = [
  "default-src 'self' blob: data:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "media-src 'self' blob: mediastream:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
];

/** CSP allowing exactly the inline import map(s) of the page, by hash. */
function cspFor(html) {
  const hashes = [...html.matchAll(/<script type="importmap">([\s\S]*?)<\/script>/g)]
    .map((m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`);
  return [...CSP_BASE, `script-src 'self' 'wasm-unsafe-eval' blob: ${hashes.join(" ")}`].join("; ");
}

const ISOLATION = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
  "Cross-Origin-Resource-Policy": "same-origin",
};

/** app://bundle/<path> -> web/<path>; app://bundle/assets/<path> -> assets/<path>. */
function serveBundle(request) {
  const url = new URL(request.url);
  let rel = decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
  let base = WEB;
  if (rel.startsWith("assets/")) {
    base = ASSETS;
    rel = rel.slice("assets/".length);
  }
  const file = resolve(base, rel);
  if (!(file + sep).startsWith(base + sep) && file !== base) return new Response("forbidden", { status: 403 });
  if (!existsSync(file) || !statSync(file).isFile()) return new Response("not found", { status: 404 });
  const body = readFileSync(file);
  const headers = { "Content-Type": MIME[extname(file)] ?? "application/octet-stream", ...ISOLATION };
  if (extname(file) === ".html") headers["Content-Security-Policy"] = cspFor(body.toString("utf8"));
  return new Response(body, { headers });
}

// ---------------------------------------------------------------- services
let store, service, voices, avatars, dances, music, exporter;
const MOTION_EXT = ["fbx", "bvh", "vrma", "glb"];
const MAX_MOTION_FILES = 100;

/** Content key used to match songs with precomputed analysis packs. */
function fileKey(path) {
  const size = statSync(path).size;
  const fd = openSync(path, "r");
  try {
    const buf = Buffer.alloc(Math.min(size, 1 << 20));
    readSync(fd, buf, 0, buf.length, 0);
    return `${createHash("sha1").update(buf).digest("hex")}:${size}`;
  } finally {
    closeSync(fd);
  }
}

/** Copy audio files into the managed library and register them. */
async function addSongFiles(paths) {
  const added = [];
  for (const p of paths) {
    if (!AUDIO_EXT.has(extname(p).toLowerCase())) continue;
    try {
      const size = statSync(p).size;
      if (size > MAX_SONG_BYTES) continue;
      const key = fileKey(p);
      const copy = await music.import(p, key);
      const song = store.addSong({ path: copy, source: p, title: basename(p).replace(/\.[^.]+$/, ""), size, key });
      added.push(song);
    } catch (err) {
      if (err.fatal) throw err;
      console.warn("skip", p, err.message);
    }
  }
  return added;
}

function walk(dir, depth = 0, out = []) {
  if (depth > 4) return out;
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const p = join(dir, name);
    const st = statSync(p, { throwIfNoEntry: false });
    if (st?.isDirectory()) walk(p, depth + 1, out);
    else if (st?.isFile() && AUDIO_EXT.has(extname(p).toLowerCase())) out.push(p);
  }
  return out;
}

/** Wrap a handler so errors reach the renderer as plain messages. */
function handle(channel, fn) {
  ipcMain.handle(`dt:${channel}`, async (_e, ...args) => {
    try {
      return { ok: true, data: await fn(...args) };
    } catch (err) {
      return { ok: false, error: err.message || String(err) };
    }
  });
}

function registerIpc(win) {
  // the renderer owns the language choice; main-process texts (validation
  // errors that travel back over IPC) follow it
  handle("setLang", (lang) => setLocale(String(lang)));
  handle("state", () => service.state());
  handle("plan", () => service.plan());
  handle("restart", (d) => service.restart(d));
  handle("songs", () => service.songs());
  handle("chart", (id, day, mode) => service.chart(id, day, mode));
  handle("analysis", (id) => {
    const song = store.getSong(id);
    const analysis = store.getAnalysis(id);
    if (!song || !analysis) throw new Error("歌曲不存在或还没分析完");
    return analysis;
  });
  handle("leaderboard", (id, mode) => service.leaderboard(id, mode));
  handle("saveSession", (body) => service.saveSession(body));
  handle("sessions", (limit) => service.sessions(limit));
  handle("stats", () => service.stats());
  handle("logBody", (b) => service.logBody(b));

  // music library
  handle("addSongs", async (kind) => {
    const r = await dialog.showOpenDialog(win, kind === "folder"
      ? { title: "选择音乐文件夹", properties: ["openDirectory"] }
      : { title: "选择音乐", properties: ["openFile", "multiSelections"], filters: [{ name: "音乐", extensions: [...AUDIO_EXT].map((e) => e.slice(1)) }] });
    if (r.canceled) return [];
    const files = kind === "folder" ? r.filePaths.flatMap((d) => walk(d)) : r.filePaths;
    return addSongFiles(files);
  });
  handle("addSongPaths", (paths) => addSongFiles(paths.filter((p) => typeof p === "string")));
  handle("removeSong", (id) => {
    const song = store.getSong(id);
    const ok = store.removeSong(id);
    if (song && !store.songsAt(song.path)) music.remove(song.path);
    return ok;
  });
  handle("songBytes", (id) => {
    const song = store.getSong(id);
    if (!song) throw new Error("歌曲不存在");
    if (!existsSync(song.path)) throw new Error(`找不到文件：${song.source ?? song.path}（请在曲库删除后重新添加）`);
    return readFileSync(song.path);
  });
  handle("saveAnalysis", (id, analysis) => {
    if (!analysis || !Array.isArray(analysis.beats) || analysis.beats.length < 8) throw new Error("分析结果无效");
    return store.saveAnalysis(id, analysis);
  });
  handle("songError", (id, msg) => store.markSongError(id, msg));
  handle("revealSong", (id) => {
    const s = store.getSong(id);
    if (s) shell.showItemInFolder(s.path);
  });

  // voice packs (bundled, per UI language; replaceable with own recordings)
  handle("voices", () => voices.status());
  handle("cue", (lang, key) => {
    const p = voices.cuePath(lang, key);
    return p ? readFileSync(p) : null;
  });
  handle("importVoiceCues", (lang, files) => voices.importCues(lang, files));
  handle("importVoiceCue", (lang, key, bytes) => voices.importCue(lang, key, bytes));
  handle("cueInfo", (lang) => voices.cueInfo(lang));
  handle("resetVoicePack", (lang) => voices.reset(lang));

  // avatars
  handle("avatars", () => avatars.list());
  handle("avatarData", (id) => avatars.data(id));
  handle("importAvatar", async () => {
    const r = await dialog.showOpenDialog(win, { title: "选择 VRM 形象", properties: ["openFile"], filters: [{ name: "VRM", extensions: ["vrm"] }] });
    return r.canceled ? null : avatars.import(r.filePaths[0]);
  });
  handle("removeAvatar", (id) => avatars.remove(id));

  // user choreography (validated again here: the renderer is not trusted)
  handle("routines", () => store.listRoutines());
  handle("saveRoutine", (r) => {
    registerClipMoves(clipMoveDefs(dances.list())); // clip sections are valid moves too
    return store.saveRoutine(cleanRoutine(r));
  });
  handle("removeRoutine", (id) => store.removeRoutine(String(id)));

  // motion-capture dances
  handle("dances", () => dances.list());
  handle("danceData", (id) => dances.data(id));
  handle("saveDance", (clip) => dances.save(clip));
  handle("removeDance", (id) => dances.remove(id));
  // Multi-select: the renderer gets opaque tokens for exactly the files the
  // user picked, then reads them one at a time (never arbitrary paths).
  let motionPicks = new Map();
  handle("pickMotionFiles", async () => {
    const r = await dialog.showOpenDialog(win, {
      title: "选择动捕文件（可多选：Mixamo FBX / BVH / VRMA）", properties: ["openFile", "multiSelections"],
      filters: [{ name: "动作捕捉", extensions: MOTION_EXT }],
    });
    motionPicks = new Map();
    if (r.canceled) return [];
    return r.filePaths.slice(0, MAX_MOTION_FILES).map((p, i) => {
      const ext = extname(p).slice(1).toLowerCase();
      const size = statSync(p, { throwIfNoEntry: false })?.size ?? 0;
      const error = !MOTION_EXT.includes(ext) ? "不支持的文件格式"
        : size > MAX_CLIP_BYTES ? "文件太大（上限 60MB）" : size === 0 ? "文件为空或不存在" : null;
      const token = `${Date.now()}-${i}`;
      if (!error) motionPicks.set(token, p);
      return { token, name: basename(p, extname(p)), ext, size, error };
    });
  });
  handle("motionFileBytes", (token) => {
    const p = motionPicks.get(token);
    if (!p) throw new Error("文件已失效，请重新选择");
    motionPicks.delete(token);
    return readFileSync(p);
  });

  // imports
  handle("importFile", async (what) => {
    const r = await dialog.showOpenDialog(win, { title: what === "analysis" ? "选择节拍分析包" : "选择旧版数据", properties: ["openFile"], filters: [{ name: "JSON", extensions: ["json"] }] });
    if (r.canceled) return null;
    const data = JSON.parse(readFileSync(r.filePaths[0], "utf8"));
    if (what === "legacy") return store.importLegacy(data);
    // analysis pack: { "<sha1>:<size>": analysis }
    let matched = 0;
    for (const s of store.listSongs()) {
      const a = s.key && data[s.key];
      if (a && s.status !== "ready") {
        store.saveAnalysis(s.id, a);
        matched++;
      }
    }
    return { matched, total: Object.keys(data).length };
  });

  // data export / import (.dtx, SM9-encrypted)
  handle("exportData", async (opts) => {
    const r = await dialog.showSaveDialog(win, {
      title: "导出数据",
      defaultPath: `dance-tonight-${localDate()}.dtx`,
      filters: [{ name: "Dance Tonight 数据包", extensions: ["dtx"] }],
    });
    if (r.canceled || !r.filePath) return null;
    return exporter.exportTo(r.filePath, opts);
  });
  handle("importData", async (opts) => {
    const r = await dialog.showOpenDialog(win, {
      title: "导入数据包",
      properties: ["openFile"],
      filters: [{ name: "Dance Tonight 数据包", extensions: ["dtx"] }],
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return exporter.importFrom(r.filePaths[0], opts);
  });
  handle("exportInfo", () => ({ version: EXPORT_VERSION, categories: CATEGORIES }));
  handle("openExternal", (url) => {
    if (/^https:\/\/[\w.-]+\//.test(url)) shell.openExternal(url);
  });
}

// ---------------------------------------------------------------- window
async function createWindow() {
  const e2e = !!process.env.DT_E2E;
  const win = new BrowserWindow({
    width: 1360,
    height: 860,
    show: !e2e,
    paintWhenInitiallyHidden: true,
    backgroundColor: "#0b0d1a",
    title: "Dance Tonight · 100天",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(ROOT, "electron", "preload.cjs"),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      backgroundThrottling: !e2e,
      offscreen: e2e, // tests render without popping up a window
    },
  });
  registerIpc(win);
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (e, url) => {
    if (!url.startsWith("app://bundle/")) e.preventDefault();
  });
  await win.loadURL("app://bundle/index.html");
  return win;
}

app.whenReady().then(async () => {
  const userData = app.getPath("userData");
  store = new Store(join(userData, "data"));
  music = new MusicLibrary(join(userData, "music"));
  service = new Service(store);
  voices = new VoicePacks(join(userData, "tts"), join(ASSETS, "tts"));
  avatars = new Avatars(join(userData, "avatars"), join(ASSETS, "avatars"));
  dances = new Dances(join(userData, "dances"), join(ASSETS, "dances"));
  exporter = new DataExporter(store, music, dances);

  protocol.handle("app", serveBundle);
  const allowed = new Set(["media", "fullscreen", "speaker-selection"]);
  session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => cb(allowed.has(perm) && wc.getURL().startsWith("app://bundle/")));
  session.defaultSession.setPermissionCheckHandler((_wc, perm, origin) => allowed.has(perm) && String(origin).startsWith("app://bundle"));
  if (process.platform === "darwin") await systemPreferences.askForMediaAccess("camera").catch(() => false);

  await createWindow();
  // songs added before the library copied files: copy them in the background
  music.migrate(store).then((r) => {
    if (r.copied || r.missing || r.failed) console.log("music library:", r);
  }, (err) => console.warn("music migrate failed", err));
  app.on("activate", () => BrowserWindow.getAllWindows().length === 0 && createWindow());
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
