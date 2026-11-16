// Pure choreography math shared by static poses and multi-beat motions.

export const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const ease01 = (v) => {
  const x = clamp01(v);
  return x * x * (3 - 2 * x);
};

/** Mirror a pose: swap sides, negate y/z, signed hip travel and root turns. */
export function mirrorPose(pose) {
  const out = {};
  const clean = (v) => (v === 0 ? 0 : v); // keep -0 from breaking exact mirrors
  for (const [bone, v] of Object.entries(pose)) {
    if (!Array.isArray(v)) {
      out[bone] = clean(bone === "hipsX" || bone === "turn" ? -v : v);
      continue;
    }
    const name = bone.startsWith("left")
      ? `right${bone.slice(4)}`
      : bone.startsWith("right")
        ? `left${bone.slice(5)}`
        : bone;
    out[name] = [clean(v[0]), clean(-v[1]), clean(-v[2])];
  }
  return out;
}

/** Fill sparse keyframes forward, without mutating the definitions. */
export function makeMotion(keys) {
  let pose = {};
  return keys.map((key) => {
    pose = { ...pose, ...key.pose };
    return { at: key.at, pose };
  });
}

export function mirrorMotion(keys) {
  return keys.map((key) => ({ at: key.at, pose: mirrorPose(key.pose) }));
}

/** Sample a normalized [0,1] motion phase with smooth local interpolation. */
export function sampleKeys(keys, phase) {
  if (!keys?.length) return null;
  const p = clamp01(phase);
  if (p <= keys[0].at) return { ...keys[0].pose };
  if (p >= keys.at(-1).at) return { ...keys.at(-1).pose };
  const i = keys.findIndex((key) => key.at >= p);
  const a = keys[i - 1], b = keys[i];
  const w = ease01((p - a.at) / (b.at - a.at));
  const out = {};
  for (const key of Object.keys(a.pose)) {
    const av = a.pose[key], bv = b.pose[key];
    out[key] = Array.isArray(av)
      ? av.map((v, axis) => v + (bv[axis] - v) * w)
      : av + (bv - av) * w;
  }
  return out;
}

/** Interpolate orientation through the shortest arc (360 is equivalent to 0). */
export function lerpAngle(a, b, w) {
  const delta = ((b - a + 540) % 360) - 180;
  return a + delta * w;
}
