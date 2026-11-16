import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { BeatError, SR, analyzeSamples, beatEnergy, estimateDownbeats, rmsFrames } from "../js/analysis/beat.js";
import { BT_SR, analyzeBeatThis, chunkStarts, framesToBeats, logMel, pickPeaks } from "../js/analysis/beatthis.js";

/** Click track: `bpm`, accent every 4th beat, `seconds` long. */
function clicks(bpm, seconds, sr = SR) {
  const y = new Float32Array(sr * seconds);
  const len = 800;
  for (let k = 0, t = 0.5; t < seconds - 0.5; k++, t += 60 / bpm) {
    const s = Math.round(t * sr);
    for (let i = 0; i < len && s + i < y.length; i++) {
      const env = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / len);
      y[s + i] += Math.sin((2 * Math.PI * 1000 * i) / sr) * env * (k % 4 === 0 ? 1 : 0.5);
    }
  }
  return y;
}

describe("JS beat tracker", () => {
  it("finds tempo and evenly spaced beats on a click track", () => {
    const a = analyzeSamples(clicks(120, 20));
    assert.equal(a.engine, "js-dp");
    assert.ok(Math.abs(a.tempo - 120) < 3, `tempo ${a.tempo}`);
    assert.ok(Math.abs(a.duration - 20) < 0.01);
    const d = a.beats.slice(1).map((b, i) => b - a.beats[i]);
    assert.ok(d.every((x) => Math.abs(x - 0.5) < 0.05));
    assert.equal(a.energy.length, a.beats.length);
    assert.ok(a.energy.every((e) => e >= 0 && e <= 1));
  });

  it("rejects short or silent audio", () => {
    assert.throws(() => analyzeSamples(new Float32Array(SR)), BeatError);
    assert.throws(() => analyzeSamples(new Float32Array(SR * 10)), BeatError);
    assert.throws(() => analyzeSamples(new Float32Array(SR * 10), 44100), BeatError);
  });

  it("downbeats follow the accented phase", () => {
    const beats = Array.from({ length: 16 }, (_, i) => i * 0.5);
    const onset = new Float64Array(1000).fill(1);
    beats.forEach((b, i) => {
      if (i % 4 === 2) onset[Math.round((b * SR) / 512)] = 5;
    });
    assert.deepEqual(estimateDownbeats(beats, onset), beats.filter((_, i) => i % 4 === 2));
    assert.deepEqual(estimateDownbeats([1, 2], onset), [1, 2]);
  });

  it("energy is normalised and flat for constant loudness", () => {
    const rms = rmsFrames(new Float32Array(SR * 4).fill(0.5));
    assert.ok(Math.abs(rms[10] - 0.5) < 1e-6);
    assert.deepEqual(beatEnergy(rms, [0.5, 1, 1.5]), [0.5, 0.5, 0.5]); // <4 beats: no smoothing
    const e = beatEnergy(rms, [0.5, 1, 1.5, 2, 2.5, 3]);
    assert.ok(e.every((x) => x >= 0 && x <= 1));
  });
});

describe("Beat This! pipeline", () => {
  it("log-mel has 128 bins at 50 fps", () => {
    const { spect, T } = logMel(new Float32Array(BT_SR * 2));
    assert.equal(T, 1 + Math.floor((BT_SR * 2) / 441));
    assert.equal(spect.length, T * 128);
    assert.ok(spect.every((v) => v === 0)); // log1p(0)
  });

  it("chunking matches beat_this.split_piece", () => {
    // python: np.arange(-6, T-6, 1488), last moved to T-(1500-6) when T > 1488
    assert.deepEqual(chunkStarts(1000), [-6]);
    assert.deepEqual(chunkStarts(4000), [-6, 1482, 2506]);
  });

  it("peak picking: local max over 7 frames, >0, adjacent peaks merged", () => {
    const l = new Float32Array(30).fill(-5);
    l[5] = 2;
    l[7] = 1; // within ±3 of a bigger peak
    l[15] = 1;
    l[16] = 1; // plateau -> 15.5
    l[25] = -0.5; // below threshold
    assert.deepEqual(pickPeaks(l), [5, 15.5]);
  });

  it("downbeats snap to the nearest beat", () => {
    const beat = new Float32Array(200).fill(-5), down = new Float32Array(200).fill(-5);
    for (const f of [10, 35, 60, 85]) beat[f] = 3;
    down[36] = 3;
    const { beats, downbeats } = framesToBeats(beat, down);
    assert.deepEqual(beats, [0.2, 0.7, 1.2, 1.7]);
    assert.deepEqual(downbeats, [0.7]);
  });

  it("end-to-end with a fake model runner", async () => {
    const y = new Float32Array(BT_SR * 70); // > 1 chunk
    const seen = [];
    const run = async (data, len) => {
      seen.push(len);
      const beat = new Float32Array(len).fill(-5);
      for (let k = 0; k < len; k += 25) beat[k] = 4; // a beat every 0.5 s (in chunk frames)
      return { beat, downbeat: new Float32Array(len).fill(-5) };
    };
    const progress = [];
    const a = await analyzeBeatThis(y, run, (p) => progress.push(p));
    assert.equal(a.engine, "beat_this");
    assert.ok(seen.every((n) => n <= 1500));
    assert.equal(progress.at(-1), 1);
    assert.ok(a.beats.length > 100);
    assert.equal(a.energy.length, a.beats.length);
    const none = await analyzeBeatThis(new Float32Array(BT_SR * 10), async (d, len) => ({
      beat: new Float32Array(len).fill(-5), downbeat: new Float32Array(len).fill(-5),
    }));
    assert.equal(none, null);
  });
});
