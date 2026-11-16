// Motion-capture dance clips.
//
// A source rig (CMU/BVH, Mixamo FBX, VRMA) is baked into an avatar-independent
// clip: per humanoid bone, the world-space rotation *delta from the source's
// rest pose*, expressed in a canonical frame (+Y up, performer's left = +X,
// facing +Z at the first frame). Playback turns those deltas into VRM
// normalized-bone local rotations, correcting each limb for rest-pose
// differences (A-pose vs T-pose) so arms and legs point where the dancer's did.
import * as THREE from "three";
import { HUMAN_BONES } from "../core/danceclip.js";
import { t } from "../i18n/index.js";

export { HUMAN_BONES };

export const HUMAN_PARENT = {
  spine: "hips", chest: "spine", upperChest: "chest", neck: "upperChest", head: "neck",
  leftShoulder: "upperChest", leftUpperArm: "leftShoulder", leftLowerArm: "leftUpperArm", leftHand: "leftLowerArm",
  rightShoulder: "upperChest", rightUpperArm: "rightShoulder", rightLowerArm: "rightUpperArm", rightHand: "rightLowerArm",
  leftUpperLeg: "hips", leftLowerLeg: "leftUpperLeg", leftFoot: "leftLowerLeg", leftToes: "leftFoot",
  rightUpperLeg: "hips", rightLowerLeg: "rightUpperLeg", rightFoot: "rightLowerLeg", rightToes: "rightFoot",
};

/**
 * Bone -> joints its segment may point at (first present wins); the segment
 * direction in the rest pose drives rest-pose correction.
 */
export const SEGMENT = {
  hips: ["spine", "chest", "upperChest", "neck"], spine: ["chest", "upperChest", "neck"], chest: ["upperChest", "neck"],
  upperChest: ["neck"], neck: ["head"],
  ...Object.fromEntries(["left", "right"].flatMap((s) => [
    [`${s}Shoulder`, [`${s}UpperArm`]], [`${s}UpperArm`, [`${s}LowerArm`]], [`${s}LowerArm`, [`${s}Hand`]],
    [`${s}UpperLeg`, [`${s}LowerLeg`]], [`${s}LowerLeg`, [`${s}Foot`]], [`${s}Foot`, [`${s}Toes`]],
  ])),
};
/** End bones have no segment: they reuse their parent's correction. */
export const INHERIT_FIX = {
  head: "neck", leftHand: "leftLowerArm", rightHand: "rightLowerArm", leftToes: "leftFoot", rightToes: "rightFoot",
};

/**
 * Segment target for `bone`. `has(x)` says whether joint x exists; with `pos`
 * given, joints sitting on top of the bone (zero-length segments, e.g. CMU's
 * root/lowerback) are skipped.
 */
export function segmentChild(bone, has, pos) {
  return SEGMENT[bone]?.find((x) => has(x) && (!pos || pos(x).distanceToSquared(pos(bone)) > 1e-8)) ?? null;
}

/**
 * Full rest orientation of the torso bones from joint positions: lateral axis
 * from the hips (pelvis) or shoulders (spine and up), vertical from the bone's
 * segment. Unlike a limb's direction this also fixes twist, so a source whose
 * "rest" pose is really its first frame still lines up with a T-posed avatar.
 * `pos(bone)` returns a canonical-frame position or null.
 */
export function torsoFrames(pos) {
  const out = {};
  const lat = (a, b) => (pos(a) && pos(b) ? pos(a).sub(pos(b)) : null);
  const legs = lat("leftUpperLeg", "rightUpperLeg");
  const arms = lat("leftUpperArm", "rightUpperArm") ?? legs;
  let lastUp = null;
  for (const b of ["hips", "spine", "chest", "upperChest", "neck", "head"]) {
    if (!pos(b)) continue;
    const c = segmentChild(b, (x) => pos(x), pos);
    const up = c ? pos(c).sub(pos(b)) : lastUp;
    const side = (b === "hips" ? legs : arms)?.clone();
    if (!up || !side || up.lengthSq() < 1e-12) continue;
    up.normalize();
    lastUp = up;
    side.addScaledVector(up, -side.dot(up));
    if (side.lengthSq() < 1e-12) continue;
    side.normalize();
    const fwd = new THREE.Vector3().crossVectors(side, up);
    out[b] = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, up, fwd));
  }
  return out;
}

// "#" = left/right, "@" = l/r. Earlier aliases win.
const SIDED = {
  Shoulder: ["#shoulder", "@clavicle", "#collar", "@collar", "clavicle@", "@clav", "#clavicle"],
  UpperArm: ["#arm", "#upperarm", "@humerus", "@shldr", "#uparm", "@upperarm", "upperarm@", "@uparm"],
  LowerArm: ["#forearm", "#lowerarm", "@radius", "@forearm", "#elbow", "#lowarm", "lowerarm@", "forearm@", "@lowarm"],
  Hand: ["#hand", "@hand", "@wrist", "hand@", "#wrist"],
  UpperLeg: ["#upleg", "#upperleg", "@femur", "@thigh", "#thigh", "@upleg", "thigh@", "#hip"],
  LowerLeg: ["#leg", "#lowerleg", "@tibia", "@shin", "#shin", "#knee", "calf@", "#lowleg", "@leg", "@lowleg"],
  Foot: ["#foot", "@foot", "foot@", "#ankle"],
  Toes: ["#toebase", "#toes", "@toes", "#toe", "@toe", "toe@"],
};
const CENTRAL = {
  hips: ["hips", "pelvis", "hip", "root"],
  spine: ["spine", "lowerback", "abdomen", "spine01"],
  chest: ["chest", "spine1", "upperback", "spine02"],
  upperChest: ["upperchest", "spine2", "thorax", "chest2", "spine03"],
  neck: ["neck", "lowerneck", "neck1"],
  head: ["head"],
};

// FBXLoader drops the ":" (mixamorig:Hips -> mixamorigHips), so rig prefixes
// are stripped after flattening too.
export const normName = (n) => String(n).split(/[:|]/).pop().toLowerCase()
  .replace(/[^a-z0-9]/g, "").replace(/^(mixamorig\d*|bip\d+)(?=[a-z])/, "");

function aliases(bone) {
  if (CENTRAL[bone]) return CENTRAL[bone];
  const side = bone.startsWith("left") ? "left" : "right";
  const part = bone.slice(side.length);
  return SIDED[part].map((a) => a.replace("#", side).replace("@", side[0]));
}

/** {humanBone: sourceNodeName} for the bones a source rig provides. */
export function mapBones(names) {
  const byNorm = new Map();
  for (const n of names) if (!byNorm.has(normName(n))) byNorm.set(normName(n), n);
  const used = new Set();
  const out = {};
  for (const bone of HUMAN_BONES) {
    for (const a of aliases(bone)) {
      const src = byNorm.get(a);
      if (src && !used.has(src)) {
        out[bone] = src;
        used.add(src);
        break;
      }
    }
  }
  return out;
}

const AXES = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].map((a) => new THREE.Vector3(...a));
function snapAxis(v) {
  return v.copy(AXES.reduce((best, a) => (a.dot(v) > best.dot(v) ? a : best)));
}

const REQUIRED = ["hips", "leftUpperArm", "rightUpperArm", "leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg"];
const r5 = (v) => Math.round(v * 1e5) / 1e5 || 0;

/**
 * Bake an AnimationClip playing on `root` (a hierarchy whose current pose is the
 * rest pose) into a canonical clip.
 */
export function bakeClip({ root, clip, fps = 30, map, maxSeconds = 600, smooth = 2, trim = true }) {
  const nodes = {};
  root.traverse((o) => {
    if (o.name && !nodes[o.name]) nodes[o.name] = o;
  });
  map ??= mapBones(Object.keys(nodes));
  const missing = REQUIRED.filter((b) => !map[b]);
  if (missing.length) throw new Error(t("coach.missingBones", { bones: missing.join(", ") }));
  if (!(clip?.duration > 0)) throw new Error(t("coach.noAnim"));
  const bones = HUMAN_BONES.filter((b) => map[b]);

  root.updateMatrixWorld(true);
  const restQ = {}, restP = {};
  for (const b of bones) {
    restQ[b] = nodes[map[b]].getWorldQuaternion(new THREE.Quaternion());
    restP[b] = nodes[map[b]].getWorldPosition(new THREE.Vector3());
  }

  // canonical axes from the rest pose: up = hips -> head, left = right -> left
  const top = ["head", "neck", "upperChest", "chest", "spine"].find((b) => restP[b]);
  const up = top ? restP[top].clone().sub(restP.hips) : new THREE.Vector3(0, 1, 0);
  const knee = restP.leftLowerLeg.clone().add(restP.rightLowerLeg).multiplyScalar(0.5);
  if (!top || up.lengthSq() < 1e-12) up.copy(restP.hips).sub(knee);
  up.normalize();
  // Files are authored upright along a world axis, but the "rest" pose may be
  // the dancer's first frame (leaning, arms down): snap to the nearest axes so
  // a tilted start doesn't tilt the whole dance.
  snapAxis(up);
  const left = restP.leftUpperArm.clone().sub(restP.rightUpperArm)
    .add(restP.leftUpperLeg.clone().sub(restP.rightUpperLeg));
  left.addScaledVector(up, -left.dot(up)).normalize();
  snapAxis(left);
  const fwd = new THREE.Vector3().crossVectors(left, up);
  const toCanon = new THREE.Quaternion()
    .setFromRotationMatrix(new THREE.Matrix4().makeBasis(left, up, fwd)).invert();
  const toCanonInv = toCanon.clone().invert();

  const footY = ["leftFoot", "rightFoot"].filter((b) => restP[b])
    .map((b) => restP.hips.clone().sub(restP[b]).dot(up));
  const legLen = Math.max(footY.length ? Math.max(...footY) : restP.hips.clone().sub(knee).dot(up) * 2, 1e-6);

  const canonPos = (b) => (restP[b] ? restP[b].clone().applyQuaternion(toCanon) : null);
  const frame = {};
  for (const [b, q] of Object.entries(torsoFrames(canonPos))) frame[b] = q.toArray().map(r5);
  const rest = {};
  for (const b of bones) {
    const c = segmentChild(b, (x) => restP[x], (x) => restP[x]);
    if (c) rest[b] = restP[c].clone().sub(restP[b]).applyQuaternion(toCanon).normalize();
  }

  const frames = Math.max(2, Math.min(Math.round(clip.duration * fps), Math.round(maxSeconds * fps)) + 1);
  const mixer = new THREE.AnimationMixer(root);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true; // setTime(duration) must not wrap to 0
  action.play();
  const deltas = Object.fromEntries(bones.map((b) => [b, []]));
  const hips = [];
  const feet = ["leftFoot", "rightFoot"].filter((b) => map[b]);
  const ankles = []; // lowest ankle height per frame, to find the floor
  const sides = []; // performer's right->left vector per frame (canonical)
  const at = (b) => nodes[map[b]].getWorldPosition(new THREE.Vector3());
  const w = new THREE.Quaternion(), p = new THREE.Vector3();
  for (let f = 0; f < frames; f++) {
    mixer.setTime(Math.min(f / fps, clip.duration));
    root.updateMatrixWorld(true);
    for (const b of bones) {
      nodes[map[b]].getWorldQuaternion(w);
      const d = w.clone().multiply(restQ[b].clone().invert());
      deltas[b].push(toCanon.clone().multiply(d).multiply(toCanonInv));
    }
    nodes[map.hips].getWorldPosition(p);
    hips.push(p.clone().sub(restP.hips).applyQuaternion(toCanon).divideScalar(legLen));
    sides.push(at("leftUpperArm").sub(at("rightUpperArm")).add(at("leftUpperLeg").sub(at("rightUpperLeg")))
      .applyQuaternion(toCanon));
    if (feet.length) ankles.push(Math.min(...feet.map((b) => nodes[map[b]].getWorldPosition(new THREE.Vector3()).dot(up))));
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);

  // Height is relative to standing: the rest pose may sit anywhere (CMU puts
  // the root at the origin), so measure from the floor the ankles stand on.
  let lift = 0;
  if (ankles.length) {
    const floor = [...ankles].sort((a, b) => a - b)[Math.floor(ankles.length * 0.05)];
    const restUp = restP.hips.dot(up);
    lift = (restUp - floor) / legLen - 1; // rest hips height above that floor, minus one leg
  }

  // remove capture jitter, then drop the motionless lead-in/out
  let series = { deltas, hips };
  if (smooth > 0) {
    series = {
      deltas: Object.fromEntries(bones.map((b) => [b, smoothQuats(deltas[b], smooth)])),
      hips: smoothVecs(hips, smooth),
    };
  }
  const [a, z] = trim ? activeRange(motionEnergy(series.deltas, fps), fps) : [0, frames - 1];
  const kept = Object.fromEntries(bones.map((b) => [b, series.deltas[b].slice(a, z + 1)]));
  const keptHips = series.hips.slice(a, z + 1);
  const n = keptHips.length;

  // Face the camera at the first frame and start centred. Facing comes from
  // where the shoulders and hips actually are, not from the hip rotation,
  // because some files' "rest" pose is already the first frame.
  const side = sides[a];
  const f0 = new THREE.Vector3(-side.z, 0, side.x); // left × up, projected
  const yaw = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.atan2(f0.x, f0.z));
  const start = keptHips[0].clone().applyQuaternion(yaw);
  const out = { version: 1, fps, frames: n, duration: (n - 1) / fps, bones: {}, hips: [], rest: {}, frame };
  for (const b of bones) {
    const arr = [];
    let prev = null;
    for (const q of kept[b]) {
      const y = yaw.clone().multiply(q);
      if (prev && prev.dot(y) < 0) y.set(-y.x, -y.y, -y.z, -y.w); // keep sign continuity
      prev = y;
      arr.push(r5(y.x), r5(y.y), r5(y.z), r5(y.w));
    }
    out.bones[b] = arr;
  }
  for (const h of keptHips) {
    const v = h.clone().applyQuaternion(yaw);
    out.hips.push(r5(v.x - start.x), r5(v.y + lift), r5(v.z - start.z));
  }
  for (const [b, v] of Object.entries(rest)) out.rest[b] = [r5(v.x), r5(v.y), r5(v.z)];
  return out;
}

/** Triangular-weighted moving average of unit quaternions (sign-aligned). */
export function smoothQuats(qs, radius) {
  return qs.map((c, i) => {
    const acc = new THREE.Vector4(0, 0, 0, 0);
    for (let k = -radius; k <= radius; k++) {
      const q = qs[Math.min(qs.length - 1, Math.max(0, i + k))];
      const w = (radius + 1 - Math.abs(k)) * (q.dot(c) < 0 ? -1 : 1);
      acc.x += q.x * w; acc.y += q.y * w; acc.z += q.z * w; acc.w += q.w * w;
    }
    return new THREE.Quaternion(acc.x, acc.y, acc.z, acc.w).normalize();
  });
}

function smoothVecs(vs, radius) {
  return vs.map((_, i) => {
    const acc = new THREE.Vector3();
    let total = 0;
    for (let k = -radius; k <= radius; k++) {
      const w = radius + 1 - Math.abs(k);
      acc.addScaledVector(vs[Math.min(vs.length - 1, Math.max(0, i + k))], w);
      total += w;
    }
    return acc.divideScalar(total);
  });
}

/** Total angular speed (rad/s summed over bones) between consecutive frames. */
export function motionEnergy(deltas, fps) {
  const tracks = Object.values(deltas);
  const n = tracks[0]?.length ?? 0;
  return Array.from({ length: Math.max(0, n - 1) }, (_, f) =>
    tracks.reduce((sum, qs) => sum + qs[f].angleTo(qs[f + 1]), 0) * fps);
}

/**
 * [first, last] frame worth keeping: motion above a quarter of the clip's
 * busy (90th percentile) level, padded; lead-ins under a second are kept.
 */
export function activeRange(energy, fps, { pad = 0.5, ratio = 0.25, minCut = 1 } = {}) {
  const n = energy.length + 1;
  if (energy.length < 2) return [0, n - 1];
  const p90 = [...energy].sort((x, y) => x - y)[Math.floor(energy.length * 0.9)];
  const thr = p90 * ratio;
  const first = energy.findIndex((e) => e > thr);
  const last = energy.findLastIndex((e) => e > thr) + 1;
  if (first < 0) return [0, n - 1];
  let a = Math.max(0, first - Math.round(pad * fps));
  let z = Math.min(n - 1, last + Math.round(pad * fps));
  if (a < minCut * fps) a = 0;
  if (n - 1 - z < minCut * fps) z = n - 1;
  return [a, z];
}

const swapSide = (b) => (b.startsWith("left") ? `right${b.slice(4)}` : b.startsWith("right") ? `left${b.slice(5)}` : b);

/** Mirror left/right (new clip; mirroring twice restores the original). */
export function mirrorClip(clip) {
  const bones = {};
  for (const [b, arr] of Object.entries(clip.bones)) {
    bones[swapSide(b)] = arr.map((v, i) => (i % 4 === 1 || i % 4 === 2 ? -v || 0 : v));
  }
  const rest = {};
  for (const [b, v] of Object.entries(clip.rest)) rest[swapSide(b)] = [-v[0] || 0, v[1], v[2]];
  // a mirrored basis keeps its axes right-handed: side stays "left" after the swap
  const frame = {};
  for (const [b, q] of Object.entries(clip.frame ?? {})) frame[b] = [q[0], -q[1] || 0, -q[2] || 0, q[3]];
  return { ...clip, bones, rest, frame, hips: clip.hips.map((v, i) => (i % 3 === 0 ? -v || 0 : v)) };
}

/** Remove floor travel (keep sways): subtract a centred moving average of x/z. */
export function inPlace(clip, seconds = 1.5) {
  const n = clip.frames;
  const half = Math.max(1, Math.round((seconds * clip.fps) / 2));
  const hips = [...clip.hips];
  for (const axis of [0, 2]) {
    const src = Array.from({ length: n }, (_, f) => clip.hips[f * 3 + axis]);
    const prefix = [0];
    for (const v of src) prefix.push(prefix.at(-1) + v);
    for (let f = 0; f < n; f++) {
      const a = Math.max(0, f - half), b = Math.min(n - 1, f + half);
      hips[f * 3 + axis] = src[f] - (prefix[b + 1] - prefix[a]) / (b - a + 1);
    }
  }
  return { ...clip, hips };
}

/** Clip pose at time t (clamped): {q: {bone: Quaternion}, hips: Vector3}. */
export function sampleClip(clip, t) {
  const x = Math.max(0, Math.min(clip.frames - 1, t * clip.fps));
  // frames < 2 (corrupted clip) would give i = -1 and NaN quaternions
  const i = Math.max(0, Math.min(clip.frames - 2, Math.floor(x)));
  const w = x - i;
  const q = {};
  const a = new THREE.Quaternion(), b = new THREE.Quaternion();
  for (const [bone, arr] of Object.entries(clip.bones)) {
    a.fromArray(arr, i * 4);
    b.fromArray(arr, (i + 1) * 4);
    q[bone] = a.clone().slerp(b, w).normalize();
  }
  const h = clip.hips;
  const hips = new THREE.Vector3(
    h[i * 3] + (h[i * 3 + 3] - h[i * 3]) * w,
    h[i * 3 + 1] + (h[i * 3 + 4] - h[i * 3 + 1]) * w,
    h[i * 3 + 2] + (h[i * 3 + 5] - h[i * 3 + 2]) * w,
  );
  return { q, hips };
}

/**
 * Prepare playback of `clip` on a rig {bones: Set|Array of present humanoid
 * bones, rest: {bone: [x,y,z] canonical limb direction}}. Returns t -> {local, hips}.
 */
export function makeRetargeter(clip, rig) {
  const present = new Set(rig.bones);
  const fix = {};
  // torso: full frame alignment (swing + twist) when both sides know it
  for (const [b, q] of Object.entries(clip.frame ?? {})) {
    const v = rig.frame?.[b];
    if (v && clip.bones[b]) fix[b] = new THREE.Quaternion(...q).normalize().multiply(v.clone().normalize().invert());
  }
  // limbs: carry the torso alignment (twist), then swing onto the source's
  // rest direction. Bones are visited parent-first, so torso fixes exist.
  const torsoFix = (b) => {
    for (let p = HUMAN_PARENT[b]; p; p = HUMAN_PARENT[p]) if (clip.frame?.[p] && fix[p]) return fix[p];
    return null;
  };
  for (const b of HUMAN_BONES) {
    const s = clip.rest[b], v = rig.rest?.[b];
    if (!clip.bones[b] || !s || !v || fix[b]) continue;
    const t = torsoFix(b) ?? new THREE.Quaternion();
    const from = new THREE.Vector3(...v).normalize().applyQuaternion(t);
    fix[b] = new THREE.Quaternion().setFromUnitVectors(from, new THREE.Vector3(...s).normalize()).multiply(t).normalize();
  }
  for (const [b, from] of Object.entries(INHERIT_FIX)) if (!fix[b] && fix[from]) fix[b] = fix[from];
  const parentIn = (b, set) => {
    let p = HUMAN_PARENT[b];
    while (p && !set.has(p)) p = HUMAN_PARENT[p];
    return p ?? null;
  };
  const rigParent = Object.fromEntries([...present].map((b) => [b, parentIn(b, present)]));
  const ident = new THREE.Quaternion();
  return (t) => {
    const s = sampleClip(clip, t);
    const world = {};
    for (const b of HUMAN_BONES) {
      const d = s.q[b];
      if (d) world[b] = fix[b] ? d.clone().multiply(fix[b]) : d;
      else world[b] = world[HUMAN_PARENT[b]] ?? ident;
    }
    const local = {};
    for (const b of present) {
      const p = rigParent[b];
      local[b] = (p ? world[p].clone().invert() : new THREE.Quaternion()).multiply(world[b]).normalize();
    }
    return { local, hips: s.hips };
  };
}
