// Analysis worker: Beat This! via onnxruntime-web, JS DP tracker as fallback.
import { analyzeSamples } from "./beat.js";
import { analyzeBeatThis } from "./beatthis.js";
import { currentLang, setLocale } from "../i18n/index.js";

const MODEL_URL = new URL("../../assets/models/beat_this_final0.int8.onnx", import.meta.url).href;
let runner = null; // Promise<run fn | null>

async function loadRunner() {
  try {
    const ort = await import("../../vendor/ort/ort.wasm.min.mjs");
    ort.env.wasm.wasmPaths = new URL("../../vendor/ort/", import.meta.url).href;
    ort.env.wasm.numThreads = self.crossOriginIsolated
      ? Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1))
      : 1;
    const res = await fetch(MODEL_URL);
    if (!res.ok) throw new Error(`model ${res.status}`);
    const session = await ort.InferenceSession.create(new Uint8Array(await res.arrayBuffer()), {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
    });
    return async (data, len) => {
      const out = await session.run({ spect: new ort.Tensor("float32", data, [1, len, 128]) });
      return { beat: out.beat.data, downbeat: out.downbeat.data };
    };
  } catch (err) {
    console.warn("Beat This! unavailable, using JS beat tracker:", err);
    return null;
  }
}

self.onmessage = async ({ data }) => {
  const { id, samples, lang } = data;
  // the page owns the language choice; worker error texts follow it
  if (lang && lang !== currentLang()) setLocale(lang);
  try {
    runner ??= loadRunner();
    const run = await runner;
    let analysis = null;
    if (run) {
      analysis = await analyzeBeatThis(samples, run, (p) => self.postMessage({ id, progress: p }));
    }
    analysis ??= analyzeSamples(samples);
    self.postMessage({ id, analysis });
  } catch (err) {
    self.postMessage({ id, error: err.message || String(err) });
  }
};
