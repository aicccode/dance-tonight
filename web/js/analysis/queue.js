// Background analysis of pending songs: decode (Web Audio, resampled to
// 22050 Hz mono) on the page, then run the beat model in a worker.
import { api } from "../api.js";
import { currentLang, t } from "../i18n/index.js";

const SR = 22050;

async function decodeMono(bytes) {
  const ctx = new OfflineAudioContext(1, 1, SR);
  const buf = await ctx.decodeAudioData(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
  const n = buf.length;
  const y = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const ch = buf.getChannelData(c);
    for (let i = 0; i < n; i++) y[i] += ch[i] / buf.numberOfChannels;
  }
  return y;
}

export class AnalysisQueue extends EventTarget {
  constructor() {
    super();
    this.worker = null;
    this.running = false;
    this.current = null; // {id, title, progress}
    this.pendingIds = [];
  }

  #worker() {
    this.worker ??= new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    return this.worker;
  }

  #analyze(id, samples) {
    return new Promise((resolve, reject) => {
      const w = this.#worker();
      const cleanup = () => {
        w.removeEventListener("message", onMsg);
        w.removeEventListener("error", onErr);
      };
      const onMsg = ({ data }) => {
        if (data.id !== id) return;
        if (data.progress !== undefined) {
          this.current.progress = data.progress;
          this.#emit();
          return;
        }
        cleanup();
        data.error ? reject(new Error(data.error)) : resolve(data.analysis);
      };
      // a crashed/failed-to-load worker would otherwise hang the whole queue
      const onErr = () => {
        cleanup();
        this.worker = null; // rebuild on the next song
        reject(new Error(t("analysis.workerCrash")));
      };
      w.addEventListener("message", onMsg);
      w.addEventListener("error", onErr);
      w.postMessage({ id, samples, lang: currentLang() }, [samples.buffer]);
    });
  }

  #emit(extra = {}) {
    this.dispatchEvent(new CustomEvent("change", {
      detail: { current: this.current, remaining: this.pendingIds.length, ...extra },
    }));
  }

  /** Pick up every song that still needs analysis. Safe to call repeatedly. */
  async kick() {
    const songs = await api.songs();
    this.pendingIds = songs.filter((s) => s.status === "pending").map((s) => s.id);
    if (this.running) return;
    this.running = true;
    try {
      while (this.pendingIds.length) {
        const id = this.pendingIds.shift();
        const song = songs.find((s) => s.id === id) ?? { id, title: `#${id}` };
        this.current = { id, title: song.title, progress: 0 };
        this.#emit();
        try {
          const samples = await decodeMono(await api.songBytes(id));
          const analysis = await this.#analyze(id, samples);
          const saved = await api.saveAnalysis(id, analysis);
          this.#emit({ done: saved });
        } catch (err) {
          await api.songError(id, err.message);
          this.#emit({ failed: { id, error: err.message } });
        }
      }
    } finally {
      this.running = false;
      this.current = null;
      this.#emit({ idle: true });
    }
  }
}

export const analysisQueue = new AnalysisQueue();
