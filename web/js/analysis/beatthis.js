// Beat This! (Foscarin et al., ISMIR 2024) in JS: torchaudio-compatible log-mel
// preprocessing, chunked ONNX inference and the "minimal" postprocessor.
// The ONNX session is injected so this runs in Electron (WebGPU/WASM) and Node.
import { beatEnergy, rmsFrames } from "./beat.js";

export const BT_SR = 22050;
const N_FFT = 1024;
const HOP = 441; // 50 fps
const FPS = BT_SR / HOP;
const N_MELS = 128;
const F_MIN = 30;
const F_MAX = 11000;
const CHUNK = 1500;
const BORDER = 6;

const hzToMel = (f) => {
  const fSp = 200 / 3, minLogHz = 1000, minLogMel = minLogHz / fSp, logstep = Math.log(6.4) / 27;
  return f >= minLogHz ? minLogMel + Math.log(f / minLogHz) / logstep : f / fSp;
};
const melToHz = (m) => {
  const fSp = 200 / 3, minLogHz = 1000, minLogMel = minLogHz / fSp, logstep = Math.log(6.4) / 27;
  return m >= minLogMel ? minLogHz * Math.exp(logstep * (m - minLogMel)) : fSp * m;
};

/** torchaudio.functional.melscale_fbanks(norm=None, mel_scale="slaney"), sparse. */
function melBank() {
  const nFreqs = N_FFT / 2 + 1;
  const allFreqs = Array.from({ length: nFreqs }, (_, k) => (k * Math.floor(BT_SR / 2)) / (nFreqs - 1));
  const mMin = hzToMel(F_MIN), mMax = hzToMel(F_MAX);
  const fPts = Array.from({ length: N_MELS + 2 }, (_, i) => melToHz(mMin + ((mMax - mMin) * i) / (N_MELS + 1)));
  const bank = [];
  for (let m = 0; m < N_MELS; m++) {
    const lo = fPts[m], ce = fPts[m + 1], hi = fPts[m + 2];
    let start = -1;
    const w = [];
    for (let k = 0; k < nFreqs; k++) {
      const f = allFreqs[k];
      const v = Math.max(0, Math.min((f - lo) / (ce - lo), (hi - f) / (hi - ce)));
      if (v > 0) {
        if (start < 0) start = k;
        w.push(v);
      } else if (start >= 0) break;
    }
    bank.push({ start: Math.max(0, start), w: Float64Array.from(w) });
  }
  return bank;
}

function fftMag(n) {
  const levels = Math.log2(n);
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < levels; b++) r |= ((i >>> b) & 1) << (levels - 1 - b);
    rev[i] = r;
  }
  const cos = Float64Array.from({ length: n / 2 }, (_, i) => Math.cos((2 * Math.PI * i) / n));
  const sin = Float64Array.from({ length: n / 2 }, (_, i) => -Math.sin((2 * Math.PI * i) / n));
  const re = new Float64Array(n), im = new Float64Array(n);
  return (frame, out) => {
    for (let i = 0; i < n; i++) {
      re[rev[i]] = frame[i];
      im[rev[i]] = 0;
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >>> 1, step = n / size;
      for (let s = 0; s < n; s += size) {
        for (let k = 0; k < half; k++) {
          const c = cos[k * step], si = sin[k * step], a = s + k, b = a + half;
          const tr = re[b] * c - im[b] * si, ti = re[b] * si + im[b] * c;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
    for (let k = 0; k <= n / 2; k++) out[k] = Math.hypot(re[k], im[k]);
  };
}

/** log1p(1000 * melspec) with torchaudio defaults used by Beat This!. Returns [T*128], T. */
export function logMel(y) {
  const pad = N_FFT / 2;
  const L = y.length;
  const at = (i) => {
    // numpy/torch 'reflect' padding
    if (i < 0) return y[Math.min(L - 1, -i)];
    if (i >= L) return y[Math.max(0, 2 * L - 2 - i)];
    return y[i];
  };
  const T = 1 + Math.floor(L / HOP);
  const win = Float64Array.from({ length: N_FFT }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT));
  const norm = 1 / Math.sqrt(N_FFT); // normalized="frame_length"
  const fft = fftMag(N_FFT);
  const bank = melBank();
  const frame = new Float64Array(N_FFT);
  const mag = new Float64Array(N_FFT / 2 + 1);
  const out = new Float32Array(T * N_MELS);
  for (let t = 0; t < T; t++) {
    const off = t * HOP - pad;
    for (let i = 0; i < N_FFT; i++) frame[i] = at(off + i) * win[i];
    fft(frame, mag);
    for (let m = 0; m < N_MELS; m++) {
      const { start, w } = bank[m];
      let s = 0;
      for (let k = 0; k < w.length; k++) s += w[k] * mag[start + k];
      out[t * N_MELS + m] = Math.log1p(1000 * s * norm);
    }
  }
  return { spect: out, T };
}

/** Same chunk starts as beat_this.inference.split_piece(avoid_short_end=True). */
export function chunkStarts(T) {
  const starts = [];
  for (let s = -BORDER; s < T - BORDER; s += CHUNK - 2 * BORDER) starts.push(s);
  if (T > CHUNK - 2 * BORDER) starts[starts.length - 1] = T - (CHUNK - BORDER);
  return starts;
}

/**
 * Run the model over the whole piece.
 * @param run async (Float32Array data, len) => {beat: Float32Array, downbeat: Float32Array}
 */
export async function predictFrames(spect, T, run, onProgress = () => {}) {
  const starts = chunkStarts(T);
  const beat = new Float32Array(T).fill(-1000);
  const down = new Float32Array(T).fill(-1000);
  // keep_first: later chunks are written first, earlier ones overwrite them
  const order = starts.map((s, i) => i).reverse();
  let done = 0;
  for (const i of order) {
    const s = starts[i];
    const a = Math.max(s, 0), b = Math.min(s + CHUNK, T);
    const left = Math.max(0, -s);
    const right = Math.max(0, Math.min(BORDER, s + CHUNK - T));
    const len = left + (b - a) + right;
    const data = new Float32Array(len * N_MELS);
    data.set(spect.subarray(a * N_MELS, b * N_MELS), left * N_MELS);
    const out = await run(data, len);
    for (let k = BORDER; k < len - BORDER; k++) {
      const f = s + k;
      if (f >= 0 && f < T) {
        beat[f] = out.beat[k];
        down[f] = out.downbeat[k];
      }
    }
    onProgress(++done / starts.length);
  }
  return { beat, down };
}

/** Peaks over a 7-frame window with logit > 0, adjacent peaks merged. */
export function pickPeaks(logits) {
  const peaks = [];
  for (let t = 0; t < logits.length; t++) {
    const v = logits[t];
    if (v <= 0) continue;
    let isMax = true;
    for (let k = Math.max(0, t - 3); k <= Math.min(logits.length - 1, t + 3); k++) {
      if (logits[k] > v) {
        isMax = false;
        break;
      }
    }
    if (isMax) peaks.push(t);
  }
  // deduplicate_peaks(width=1): groups of adjacent frames -> their mean
  const out = [];
  let group = [];
  for (const p of peaks) {
    if (group.length && p - group[group.length - 1] > 1) {
      out.push(group.reduce((a, b) => a + b) / group.length);
      group = [];
    }
    group.push(p);
  }
  if (group.length) out.push(group.reduce((a, b) => a + b) / group.length);
  return out;
}

export function framesToBeats(beatLogits, downLogits) {
  const beats = pickPeaks(beatLogits).map((f) => f / FPS);
  let downs = pickPeaks(downLogits).map((f) => f / FPS);
  if (beats.length) {
    downs = downs.map((d) => beats.reduce((best, b) => (Math.abs(b - d) < Math.abs(best - d) ? b : best)));
    downs = [...new Set(downs)].sort((a, b) => a - b);
  }
  return { beats, downbeats: downs };
}

const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * Full Beat This! analysis of mono audio at 22050 Hz.
 * @param run model runner, see predictFrames
 */
export async function analyzeBeatThis(y, run, onProgress) {
  const { spect, T } = logMel(y);
  const { beat, down } = await predictFrames(spect, T, run, onProgress);
  const { beats, downbeats } = framesToBeats(beat, down);
  if (beats.length < 8) return null;
  const diffs = beats.slice(1).map((b, i) => b - beats[i]).sort((a, b) => a - b);
  return {
    engine: "beat_this",
    duration: r3(y.length / BT_SR),
    tempo: Math.round((60 / diffs[diffs.length >> 1]) * 10) / 10,
    beats: beats.map(r3),
    downbeats: downbeats.map(r3),
    energy: beatEnergy(rmsFrames(y), beats).map(r3),
  };
}
