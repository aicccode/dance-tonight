// Renderer-side API: thin wrapper over the Electron IPC bridge (window.dt).
import { t } from "./i18n/index.js";
const call = (channel, ...args) => {
  if (!window.dt) return Promise.reject(new Error(t("api.needElectron")));
  return window.dt.call(channel, ...args);
};

const blobUrls = new Map();

export const api = {
  state: () => call("state"),
  plan: () => call("plan"),
  restart: (startDate) => call("restart", startDate),
  stats: () => call("stats"),
  logBody: (data) => call("logBody", data),
  sessions: (limit) => call("sessions", limit),
  saveSession: (data) => call("saveSession", data),

  songs: () => call("songs"),
  addSongs: (kind) => call("addSongs", kind),
  addSongPaths: (paths) => call("addSongPaths", paths),
  removeSong: (id) => call("removeSong", id),
  revealSong: (id) => call("revealSong", id),
  songBytes: (id) => call("songBytes", id),
  saveAnalysis: (id, analysis) => call("saveAnalysis", id, analysis),
  songError: (id, msg) => call("songError", id, msg),
  chart: (id, day, mode = "train") => call("chart", id, day ?? null, mode),
  analysis: (id) => call("analysis", id),
  leaderboard: (id, mode = "speed") => call("leaderboard", id, mode),

  /** Object URL for a song (cached per song while the app runs). */
  async audioUrl(id) {
    if (!blobUrls.has(id)) {
      const bytes = await call("songBytes", id);
      blobUrls.set(id, URL.createObjectURL(new Blob([bytes])));
    }
    return blobUrls.get(id);
  },

  voices: () => call("voices"),
  cue: (lang, key) => call("cue", lang, key),
  cueInfo: (lang) => call("cueInfo", lang),
  importVoiceCues: (lang, files) => call("importVoiceCues", lang, files),
  importVoiceCue: (lang, key, bytes) => call("importVoiceCue", lang, key, bytes),
  resetVoicePack: (lang) => call("resetVoicePack", lang),

  avatars: () => call("avatars"),
  avatarData: (id) => call("avatarData", id),
  importAvatar: () => call("importAvatar"),
  removeAvatar: (id) => call("removeAvatar", id),

  routines: () => call("routines"),
  saveRoutine: (r) => call("saveRoutine", r),
  removeRoutine: (id) => call("removeRoutine", id),

  dances: () => call("dances"),
  danceData: (id) => call("danceData", id),
  saveDance: (clip) => call("saveDance", clip),
  removeDance: (id) => call("removeDance", id),
  pickMotionFiles: () => call("pickMotionFiles"),
  motionFileBytes: (token) => call("motionFileBytes", token),

  importFile: (what) => call("importFile", what),
  openExternal: (url) => call("openExternal", url),
  pathForFile: (file) => window.dt?.pathForFile(file),

  exportInfo: () => call("exportInfo"),
  exportData: (opts) => call("exportData", opts),
  importData: (opts) => call("importData", opts),

  /** Tell the main process which language the UI uses (its error texts follow). */
  setLang: (lang) => call("setLang", lang),
};
