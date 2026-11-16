// Compare the JS beat tracker with reference beats (e.g. Beat This!).
//   node scripts/eval_beats.mjs <songs_dir> <ref.json>
// Decoding uses ffmpeg (test tooling only; the app decodes with Web Audio).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { analyzeSamples, SR } from "../web/js/analysis/beat.js";
import { analyzeBeatThis } from "../web/js/analysis/beatthis.js";

const [dir, refPath, engine = "js", modelPath = "assets/models/beat_this_final0.onnx"] = process.argv.slice(2);
let run = null;
if (engine === "beatthis") {
  const ort = await import("onnxruntime-web");
  ort.env.wasm.numThreads = 4;
  const session = await ort.InferenceSession.create(readFileSync(modelPath), { executionProviders: ["wasm"] });
  run = async (data, len) => {
    const out = await session.run({ spect: new ort.Tensor("float32", data, [1, len, 128]) });
    return { beat: out.beat.data, downbeat: out.downbeat.data };
  };
}
const ref = JSON.parse(readFileSync(refPath, "utf8"));

function fMeasure(est, refB, tol = 0.07) {
  let hit = 0, j = 0;
  for (const r of refB) {
    while (j < est.length && est[j] < r - tol) j++;
    if (j < est.length && Math.abs(est[j] - r) <= tol) { hit++; j++; }
  }
  const p = hit / Math.max(1, est.length), rc = hit / Math.max(1, refB.length);
  return p + rc ? (2 * p * rc) / (p + rc) : 0;
}

let ok = 0, fsum = 0, n = 0;
for (const [file, r] of Object.entries(ref)) {
  const raw = execFileSync("ffmpeg", ["-v", "quiet", "-i", join(dir, file), "-f", "f32le", "-ac", "1", "-ar", String(SR), "-"], { maxBuffer: 1 << 30 });
  const y = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
  const t0 = performance.now();
  const a = run ? await analyzeBeatThis(y, run) : analyzeSamples(y);
  const ms = performance.now() - t0;
  const ratio = a.tempo / r.tempo;
  const tempoOk = Math.abs(ratio - 1) < 0.04;
  const f = fMeasure(a.beats, r.beats);
  ok += tempoOk; fsum += f; n++;
  console.log(`${tempoOk ? "✔" : "✘"} js ${a.tempo.toFixed(1).padStart(6)} ref ${r.tempo.toFixed(1).padStart(6)}  F=${f.toFixed(2)}  ${(ms / 1000).toFixed(1)}s  ${r.title}`);
}
console.log(`tempo correct ${ok}/${n}, mean F-measure ${(fsum / n).toFixed(3)}`);
