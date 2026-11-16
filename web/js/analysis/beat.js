// Beat tracking in pure JS (no deps), modelled on librosa:
//   mel spectrogram -> onset strength -> tempo (windowed autocorrelation with a
//   log-normal tempo prior) -> Ellis (2007) dynamic-programming beat tracker.
// Works in browsers, Web Workers and Node.

import { t } from "../i18n/index.js";
export const SR = 22050;
export const N_FFT = 2048;
export const HOP = 512;
const N_MELS = 128;
const TOP_DB = 80;
const AC_WINDOW_S = 8.9; // ~384 frames, like librosa's tempogram
// librosa centres its prior at 120 BPM and often reports ballads at double
// tempo; a slightly lower centre fixes that (checked against Beat This!).
const PRIOR_BPM = 105;
const PRIOR_STD_OCT = 0.9;
const MIN_BPM = 50;
const MAX_BPM = 210;
const TIGHTNESS = 100;

export class BeatError extends Error {}

// ---------------------------------------------------------------- FFT
function makeFFT(n) {
  const levels = Math.log2(n);
  if (!Number.isInteger(levels)) throw new Error("FFT size must be a power of 2");
  const rev = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    let r = 0;
    for (let b = 0; b < levels; b++) r |= ((i >>> b) & 1) << (levels - 1 - b);
    rev[i] = r;
  }
  const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    cos[i] = Math.cos((2 * Math.PI * i) / n);
    sin[i] = -Math.sin((2 * Math.PI * i) / n);
  }
  const re = new Float64Array(n), im = new Float64Array(n);
  /** In-place complex FFT of a real frame; returns power spectrum (n/2+1). */
  return function power(frame, out) {
    for (let i = 0; i < n; i++) {
      re[rev[i]] = frame[i];
      im[rev[i]] = 0;
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >>> 1, step = n / size;
      for (let start = 0; start < n; start += size) {
        for (let k = 0; k < half; k++) {
          const c = cos[k * step], s = sin[k * step];
          const a = start + k, b = a + half;
          const tr = re[b] * c - im[b] * s;
          const ti = re[b] * s + im[b] * c;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
    for (let k = 0; k <= n / 2; k++) out[k] = re[k] * re[k] + im[k] * im[k];
    return out;
  };
}

// ---------------------------------------------------------------- mel
const hzToMel = (f) => {
  // Slaney scale (librosa default, htk=False)
  const fSp = 200 / 3, minLogHz = 1000, minLogMel = minLogHz / fSp, logstep = Math.log(6.4) / 27;
  return f >= minLogHz ? minLogMel + Math.log(f / minLogHz) / logstep : f / fSp;
};
const melToHz = (m) => {
  const fSp = 200 / 3, minLogHz = 1000, minLogMel = minLogHz / fSp, logstep = Math.log(6.4) / 27;
  return m >= minLogMel ? minLogHz * Math.exp(logstep * (m - minLogMel)) : fSp * m;
};

function melFilters(sr, nFft, nMels) {
  const nBins = nFft / 2 + 1;
  const fftFreqs = Array.from({ length: nBins }, (_, k) => (k * sr) / nFft);
  const mMin = hzToMel(0), mMax = hzToMel(sr / 2);
  const pts = Array.from({ length: nMels + 2 }, (_, i) => melToHz(mMin + ((mMax - mMin) * i) / (nMels + 1)));
  const filters = [];
  for (let m = 0; m < nMels; m++) {
    const lo = pts[m], ce = pts[m + 1], hi = pts[m + 2];
    const enorm = 2 / (hi - lo); // slaney normalisation
    const w = [];
    let start = -1;
    for (let k = 0; k < nBins; k++) {
      const f = fftFreqs[k];
      const v = Math.max(0, Math.min((f - lo) / (ce - lo), (hi - f) / (hi - ce))) * enorm;
      if (v > 0) {
        if (start < 0) start = k;
        w.push(v);
      } else if (start >= 0) break;
    }
    filters.push({ start: Math.max(0, start), w: Float64Array.from(w) });
  }
  return filters;
}

// ---------------------------------------------------------------- features
/** Reflect-pad like numpy 'reflect' (centered STFT). */
function padReflect(y, pad) {
  const out = new Float32Array(y.length + 2 * pad);
  out.set(y, pad);
  for (let i = 0; i < pad; i++) {
    out[pad - 1 - i] = y[Math.min(y.length - 1, i + 1)];
    out[pad + y.length + i] = y[Math.max(0, y.length - 2 - i)];
  }
  return out;
}

/**
 * Onset strength envelope + RMS per frame.
 * @returns {{onset: Float64Array, rms: Float64Array, nFrames: number}}
 */
export function onsetAndRms(y, sr = SR) {
  const padded = padReflect(y, N_FFT / 2);
  const nFrames = 1 + Math.floor((padded.length - N_FFT) / HOP);
  const win = new Float64Array(N_FFT);
  for (let i = 0; i < N_FFT; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N_FFT); // periodic hann
  const fft = makeFFT(N_FFT);
  const filters = melFilters(sr, N_FFT, N_MELS);
  const frame = new Float64Array(N_FFT);
  const pow = new Float64Array(N_FFT / 2 + 1);
  const melDb = new Float32Array(nFrames * N_MELS);
  const rms = new Float64Array(nFrames);
  let maxDb = -Infinity;

  for (let t = 0; t < nFrames; t++) {
    const off = t * HOP;
    let sq = 0;
    for (let i = 0; i < N_FFT; i++) {
      const v = padded[off + i];
      sq += v * v;
      frame[i] = v * win[i];
    }
    rms[t] = Math.sqrt(sq / N_FFT);
    fft(frame, pow);
    for (let m = 0; m < N_MELS; m++) {
      const { start, w } = filters[m];
      let s = 0;
      for (let k = 0; k < w.length; k++) s += w[k] * pow[start + k];
      const db = 10 * Math.log10(Math.max(1e-10, s));
      melDb[t * N_MELS + m] = db;
      if (db > maxDb) maxDb = db;
    }
  }
  const floor = maxDb - TOP_DB;
  for (let i = 0; i < melDb.length; i++) if (melDb[i] < floor) melDb[i] = floor;

  // spectral flux (lag 1), mean over mel bands; shift to align with frame centres
  const raw = new Float64Array(nFrames);
  for (let t = 1; t < nFrames; t++) {
    let s = 0;
    for (let m = 0; m < N_MELS; m++) {
      const d = melDb[t * N_MELS + m] - melDb[(t - 1) * N_MELS + m];
      if (d > 0) s += d;
    }
    raw[t] = s / N_MELS;
  }
  const pad = 1 + N_FFT / (2 * HOP);
  const onset = new Float64Array(nFrames);
  for (let t = pad; t < nFrames; t++) onset[t] = raw[t - pad + 1];
  return { onset, rms, nFrames };
}

const framesToTime = (f, sr = SR) => (f * HOP) / sr;

/** RMS per HOP frame (centred, N_FFT window) — cheap, no FFT. */
export function rmsFrames(y) {
  const half = N_FFT / 2;
  const n = 1 + Math.floor(y.length / HOP);
  const out = new Float64Array(n);
  for (let t = 0; t < n; t++) {
    const c = t * HOP;
    let s = 0;
    for (let i = c - half; i < c + half; i++) {
      const v = y[i < 0 ? -i : i >= y.length ? 2 * y.length - 2 - i : i] ?? 0;
      s += v * v;
    }
    out[t] = Math.sqrt(s / N_FFT);
  }
  return out;
}

// ---------------------------------------------------------------- tempo
/** Mean windowed autocorrelation (tempogram) of the onset envelope. */
export function tempogram(onset, sr = SR) {
  const win = Math.round((AC_WINDOW_S * sr) / HOP);
  const maxLag = Math.min(win - 1, Math.round((60 * sr) / HOP / MIN_BPM) + 1);
  const ac = new Float64Array(maxLag + 1);
  const hop = Math.max(1, win >> 1);
  let count = 0;
  for (let s = 0; s + win <= onset.length || (s === 0 && onset.length > maxLag); s += hop) {
    const e = Math.min(onset.length, s + win);
    const local = new Float64Array(maxLag + 1);
    for (let lag = 0; lag <= maxLag; lag++) {
      let acc = 0;
      for (let i = s; i + lag < e; i++) acc += onset[i] * onset[i + lag];
      local[lag] = acc;
    }
    if (local[0] > 0) {
      for (let lag = 0; lag <= maxLag; lag++) ac[lag] += local[lag] / local[0];
      count++;
    }
    if (e === onset.length) break;
  }
  if (count) for (let lag = 0; lag <= maxLag; lag++) ac[lag] /= count;
  return ac;
}

/** Tempo (BPM) from the tempogram, weighted by a log-normal prior. */
export function estimateTempo(onset, sr = SR) {
  const ac = tempogram(onset, sr);
  const fps = sr / HOP;
  let best = 0, bestLag = 0;
  for (let lag = 1; lag < ac.length; lag++) {
    const bpm = (60 * fps) / lag;
    if (bpm < MIN_BPM || bpm > MAX_BPM) continue;
    const prior = Math.exp(-0.5 * ((Math.log2(bpm) - Math.log2(PRIOR_BPM)) / PRIOR_STD_OCT) ** 2);
    const score = ac[lag] * prior;
    if (score > best) {
      best = score;
      bestLag = lag;
    }
  }
  if (!bestLag) return 0;
  // parabolic interpolation for sub-frame lag precision
  const [a, b, c] = [ac[bestLag - 1] ?? 0, ac[bestLag], ac[bestLag + 1] ?? 0];
  const denom = a - 2 * b + c;
  const shift = denom ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / denom)) : 0;
  return (60 * fps) / (bestLag + shift);
}

// ---------------------------------------------------------------- beats
function std(x) {
  let m = 0;
  for (const v of x) m += v;
  m /= x.length;
  let s = 0;
  for (const v of x) s += (v - m) ** 2;
  return Math.sqrt(s / Math.max(1, x.length - 1));
}

/** Ellis DP beat tracker. Returns beat frame indices. */
export function trackBeats(onset, bpm, sr = SR) {
  const n = onset.length;
  const period = (60 * sr) / HOP / bpm;
  const sd = std(onset) || 1;
  const norm = Float64Array.from(onset, (v) => v / sd);

  // local score: onset smoothed with a gaussian of width ~period/32
  const half = Math.round(period);
  const kernel = [];
  for (let k = -half; k <= half; k++) kernel.push(Math.exp(-0.5 * ((k * 32) / period) ** 2));
  const local = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -half; k <= half; k++) {
      const j = i + k;
      if (j >= 0 && j < n) s += norm[j] * kernel[k + half];
    }
    local[i] = s;
  }

  const cum = new Float64Array(n);
  const back = new Int32Array(n).fill(-1);
  const lo = Math.round(2 * period), hi = Math.max(1, Math.round(period / 2));
  const txwt = [];
  for (let d = hi; d <= lo; d++) txwt[d] = -TIGHTNESS * Math.log(d / period) ** 2;
  let localMax = 0;
  for (const v of local) if (v > localMax) localMax = v;
  let firstBeat = true;
  for (let i = 0; i < n; i++) {
    let best = -Infinity, arg = -1;
    for (let d = hi; d <= lo; d++) {
      const j = i - d;
      if (j < 0) break;
      const s = cum[j] + txwt[d];
      if (s > best) {
        best = s;
        arg = j;
      }
    }
    if (arg >= 0) {
      cum[i] = local[i] + best;
      back[i] = arg;
    } else {
      cum[i] = local[i];
    }
    // don't let beats start before the music does
    if (firstBeat && local[i] < 0.01 * localMax) back[i] = -1;
    else firstBeat = false;
  }

  // last beat: last local max of cum above half the median of maxima
  const maxima = [];
  for (let i = 1; i < n - 1; i++) if (cum[i] > cum[i - 1] && cum[i] >= cum[i + 1]) maxima.push(i);
  if (!maxima.length) return [];
  const med = [...maxima.map((i) => cum[i])].sort((a, b) => a - b)[maxima.length >> 1];
  let tail = maxima[maxima.length - 1];
  for (let k = maxima.length - 1; k >= 0; k--) {
    if (cum[maxima[k]] >= 0.5 * med) {
      tail = maxima[k];
      break;
    }
  }
  const beats = [];
  for (let i = tail; i >= 0; i = back[i]) beats.unshift(i);

  // trim weak beats at both ends (silence / fades)
  const smooth = beats.map((b, k) => {
    let s = 0, w = 0;
    for (let d = -2; d <= 2; d++) {
      const bb = beats[k + d];
      if (bb === undefined) continue;
      const hw = 0.5 - 0.5 * Math.cos((2 * Math.PI * (d + 3)) / 6);
      s += local[bb] * hw;
      w += hw;
    }
    return s / w;
  });
  const thr = 0.5 * Math.sqrt(smooth.reduce((a, v) => a + v * v, 0) / Math.max(1, smooth.length));
  let a = 0, b = beats.length;
  while (a < b && smooth[a] <= thr) a++;
  while (b > a && smooth[b - 1] <= thr) b--;
  return beats.slice(a, b);
}

/** Assume 4/4: pick the beat phase (0..3) with the strongest onsets. */
export function estimateDownbeats(beatTimes, onset, sr = SR) {
  if (beatTimes.length < 4) return [...beatTimes];
  const strength = beatTimes.map((t) => onset[Math.min(onset.length - 1, Math.round((t * sr) / HOP))]);
  let best = 0, phase = 0;
  for (let p = 0; p < 4; p++) {
    let s = 0, c = 0;
    for (let i = p; i < strength.length; i += 4) {
      s += strength[i];
      c++;
    }
    if (s / c > best) {
      best = s / c;
      phase = p;
    }
  }
  return beatTimes.filter((_, i) => i % 4 === phase);
}

function percentile(sorted, q) {
  const pos = (sorted.length - 1) * q, lo = Math.floor(pos), hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Loudness per beat, smoothed over ~1 bar and normalised to 0..1. */
export function beatEnergy(rms, beatTimes, sr = SR) {
  const fps = sr / HOP;
  const edges = [...beatTimes, beatTimes[beatTimes.length - 1] + 0.5];
  let raw = beatTimes.map((_, i) => {
    const a = Math.round(edges[i] * fps), b = Math.max(a + 1, Math.round(edges[i + 1] * fps));
    let s = 0, c = 0;
    for (let f = a; f < b && f < rms.length; f++) {
      s += rms[f];
      c++;
    }
    return c ? s / c : 0;
  });
  if (raw.length >= 4) {
    // np.convolve(raw, ones(4)/4, 'same')
    raw = raw.map((_, i) => {
      let s = 0;
      for (let k = -2; k <= 1; k++) s += raw[i + k] ?? 0;
      return s / 4;
    });
  }
  const sorted = [...raw].sort((a, b) => a - b);
  const lo = percentile(sorted, 0.05), hi = percentile(sorted, 0.95);
  if (hi - lo < 1e-9) return raw.map(() => 0.5);
  return raw.map((v) => Math.min(1, Math.max(0, (v - lo) / (hi - lo))));
}

const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * Full analysis of mono audio at SR (22050 Hz).
 * @returns {{engine, duration, tempo, beats, downbeats, energy}}
 */
export function analyzeSamples(y, sr = SR) {
  if (sr !== SR) throw new BeatError(`expected ${SR} Hz audio`);
  if (y.length < sr * 5) throw new BeatError(t("analysis.tooShort"));
  const { onset, rms } = onsetAndRms(y, sr);
  const bpm0 = estimateTempo(onset, sr);
  if (!bpm0) throw new BeatError(t("analysis.noBeat"));
  const frames = trackBeats(onset, bpm0, sr);
  if (frames.length < 8) throw new BeatError(t("analysis.noBeat"));
  const beats = frames.map((f) => framesToTime(f, sr));
  const diffs = beats.slice(1).map((b, i) => b - beats[i]).sort((a, b) => a - b);
  const tempo = 60 / diffs[diffs.length >> 1];
  return {
    engine: "js-dp",
    duration: r3(y.length / sr),
    tempo: Math.round(tempo * 10) / 10,
    beats: beats.map(r3),
    downbeats: estimateDownbeats(beats, onset, sr).map(r3),
    energy: beatEnergy(rms, beats, sr).map(r3),
  };
}
