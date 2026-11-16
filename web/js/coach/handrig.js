// Extra rigging for realistic coaches: a relaxed hand pose (motion capture has no
// finger data, so fingers would otherwise stay splayed) and "half" helper joints
// that keep knees and elbows from pinching thin when they bend.
import * as THREE from "three";

export const FINGERS = ["Thumb", "Index", "Middle", "Ring", "Little"];
const SEGMENTS = { Thumb: ["Metacarpal", "Proximal", "Distal"], other: ["Proximal", "Intermediate", "Distal"] };
const THUMB_SCALE = { Metacarpal: 0.5, Proximal: 1, Distal: 1.2 };
/** Default hand: fingers straight and together; Together = how much of the rest-pose spread to close (0..1). */
export const RELAXED = { Proximal: 0, Intermediate: 0, Distal: 0, Thumb: 0, Together: 1 };
const DEG = Math.PI / 180;

/**
 * Local rotations that curl each finger toward its palm.
 * @param {(bone: string) => THREE.Vector3|null} pos rest position of a humanoid bone,
 *   in the frame the normalized bones rotate in.
 * @returns {Map<string, THREE.Quaternion>}
 */
export function fingerCurls(pos, angles = RELAXED) {
  const out = new Map();
  for (const side of ["left", "right"]) {
    const P = (f, s) => pos(`${side}${f}${s}`);
    const hand = pos(`${side}Hand`), index = P("Index", "Proximal"), middle = P("Middle", "Proximal");
    const little = P("Little", "Proximal") ?? P("Ring", "Proximal");
    if (!hand || !index || !middle || !little) continue;
    const across = little.clone().sub(index), along = middle.clone().sub(hand);
    // chirality: for a left hand (index -> little) x (wrist -> middle) points out of the palm
    const palm = side === "left" ? across.cross(along) : along.cross(across);
    if (palm.lengthSq() < 1e-12) continue;
    palm.normalize();
    // the middle finger's direction, flattened into the palm plane: the others close onto it
    const midDir = (() => {
      const a = P("Middle", "Proximal"), b = P("Middle", "Intermediate");
      if (!a || !b) return null;
      const d = b.clone().sub(a);
      return d.sub(palm.clone().multiplyScalar(d.dot(palm))).normalize();
    })();
    const together = angles.Together ?? 0;
    for (const f of FINGERS) {
      const segs = f === "Thumb" ? SEGMENTS.Thumb : SEGMENTS.other;
      const pts = segs.map((s) => P(f, s));
      segs.forEach((s, i) => {
        if (!pts[i]) return;
        const next = pts[i + 1] ?? null;
        const dir = next ? next.clone().sub(pts[i]) : pts[i - 1] ? pts[i].clone().sub(pts[i - 1]) : null;
        if (!dir || dir.lengthSq() < 1e-12) return;
        dir.normalize();
        const q = new THREE.Quaternion();
        // close the spread at the knuckle: swing in the palm plane toward the middle finger
        if (i === 0 && f !== "Thumb" && f !== "Middle" && midDir && together > 0) {
          const flat = dir.clone().sub(palm.clone().multiplyScalar(dir.dot(palm))).normalize();
          const ang = Math.atan2(flat.clone().cross(midDir).dot(palm), flat.dot(midDir));
          q.setFromAxisAngle(palm, ang * together);
        }
        const bent = dir.clone().applyQuaternion(q);
        const axis = bent.cross(palm);
        const deg = f === "Thumb" ? angles.Thumb * THUMB_SCALE[s] : angles[s];
        if (axis.lengthSq() > 1e-12 && deg) q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis.normalize(), deg * DEG));
        out.set(`${side}${f}${s}`, q);
      });
    }
  }
  return out;
}

/**
 * Corrective shapes baked in Blender (drivers do not survive glTF): each is
 * driven by how far a joint bends, measured from the bone positions so it works
 * whatever the bones' local axes are.
 *   kneeFlex_<side> 0..90°, kneeDeep_<side> 90..130°, kneeLow_<side> up 0..30° then down to 0 at 90°,
 *   wristFlex_<side> 0..50° toward the palm, wristExt_<side> 0..50° toward the back.
 * @param {(bone: string) => THREE.Object3D|null} node raw humanoid bone by name
 */
export function bendCorrectives(root, node) {
  const meshes = [];
  root.traverse((o) => o.morphTargetDictionary && meshes.push(o));
  const wp = (n) => node(n)?.getWorldPosition(new THREE.Vector3()) ?? null;
  const SPECS = [];
  for (const side of ["left", "right"]) {
    const leg = [`${side}UpperLeg`, `${side}LowerLeg`, `${side}Foot`];
    const wrist = [`${side}LowerArm`, `${side}Hand`, `${side}MiddleProximal`];
    SPECS.push(
      { name: `kneeFlex_${side}`, chain: leg, from: 0, to: 90 },
      { name: `kneeDeep_${side}`, chain: leg, from: 90, to: 130 },
      { name: `kneeLow_${side}`, chain: leg, from: 0, peak: 30, to: 90 },
      { name: `wristFlex_${side}`, chain: wrist, from: 0, to: 50, sign: 1, side },
      { name: `wristExt_${side}`, chain: wrist, from: 0, to: 50, sign: -1, side },
    );
  }
  const bend = (spec) => {
    const [a, b, c] = spec.chain.map(wp);
    const d1 = b.clone().sub(a).normalize(), d2 = c.clone().sub(b).normalize();
    let ang = d1.angleTo(d2) / DEG;
    if (spec.sign) {
      const i = wp(`${spec.side}IndexProximal`), l = wp(`${spec.side}LittleProximal`);
      const across = l.sub(i), along = c.clone().sub(b);
      const palm = spec.side === "left" ? across.cross(along) : along.cross(across);
      if (d2.clone().sub(d1).dot(palm) < 0) ang = -ang;
    }
    return ang;
  };
  const active = SPECS.filter((s) => meshes.some((m) => s.name in m.morphTargetDictionary)
    && s.chain.every((n) => node(n)) && (!s.sign || (node(`${s.side}IndexProximal`) && node(`${s.side}LittleProximal`))));
  root.updateMatrixWorld(true);
  for (const s of active) s.rest = bend(s);
  return {
    count: active.length,
    update() {
      for (const s of active) {
        let a = bend(s) - s.rest;
        a = s.sign ? a * s.sign : Math.abs(a);
        const w = s.peak === undefined
          ? Math.min(1, Math.max(0, (a - s.from) / (s.to - s.from)))
          : Math.max(0, Math.min((a - s.from) / (s.peak - s.from), (s.to - a) / (s.to - s.peak), 1));
        for (const m of meshes) {
          const i = m.morphTargetDictionary[s.name];
          if (i !== undefined) m.morphTargetInfluences[i] = w;
        }
      }
    },
  };
}

/**
 * Helper bones named `<bone>Half` follow half of `<bone>`'s rotation away from
 * rest. Build it while the skeleton is in its rest pose; call update() after
 * the humanoid has been posed each frame.
 */
export function halfJointRig(root) {
  const pairs = [];
  root.traverse((o) => {
    if (!o.isBone || !o.name.endsWith("Half")) return;
    const src = root.getObjectByName(o.name.slice(0, -4));
    if (src) pairs.push({ helper: o, src, restH: o.quaternion.clone(), restSInv: src.quaternion.clone().invert() });
  });
  const delta = new THREE.Quaternion(), half = new THREE.Quaternion(), id = new THREE.Quaternion();
  return {
    count: pairs.length,
    update() {
      for (const p of pairs) {
        delta.copy(p.restSInv).multiply(p.src.quaternion);
        half.copy(id).slerp(delta, 0.5);
        p.helper.quaternion.copy(p.restH).multiply(half);
      }
    },
  };
}

/**
 * Twist bones exported with the realistic coach. `<side>LowerArmTwist` takes half
 * of the hand's twist about the forearm (so the wrist is not wrung like a
 * candy wrapper); `<side>UpperArmTwist` / `<side>UpperLegTwist` undo half of
 * their limb's own twist near the shoulder / hip. Build in the rest pose; call
 * update() after the humanoid has been posed.
 * @param {(bone: string) => THREE.Object3D|null} node raw bone by name
 */
export function twistRig(root, node) {
  const specs = [];
  root.traverse((o) => {
    if (!o.isBone || !o.name.endsWith("Twist")) return;
    const base = o.name.slice(0, -5); // leftLowerArm, leftUpperArm, leftUpperLeg
    const side = base.startsWith("left") ? "left" : "right";
    const limb = base.slice(side.length);
    const src = limb === "LowerArm" ? `${side}Hand` : base;
    const srcChild = { LowerArm: `${side}MiddleProximal`, UpperArm: `${side}LowerArm`, UpperLeg: `${side}LowerLeg` }[limb];
    const baseChild = { LowerArm: `${side}Hand`, UpperArm: `${side}LowerArm`, UpperLeg: `${side}LowerLeg` }[limb];
    const S = node(src), SC = node(srcChild) ?? node(src)?.children.find((c) => c.isBone), BC = node(baseChild);
    if (!S || !SC || !BC || !o.parent) return;
    const axisS = SC.position.clone().normalize();                                    // source twist axis (source local)
    const axisT = BC.position.clone().applyQuaternion(o.quaternion.clone().invert()).normalize(); // same limb axis, twist-bone local
    specs.push({ bone: o, S, axisS, axisT, k: limb === "LowerArm" ? 0.5 : -0.5,
      restS: S.quaternion.clone(), restSInv: S.quaternion.clone().invert(), restT: o.quaternion.clone() });
  });
  const d = new THREE.Quaternion(), q = new THREE.Quaternion();
  return {
    count: specs.length,
    update() {
      for (const s of specs) {
        d.copy(s.restSInv).multiply(s.S.quaternion);
        if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w); // q and -q are the same rotation: take the short way round
        const proj = d.x * s.axisS.x + d.y * s.axisS.y + d.z * s.axisS.z;
        const angle = 2 * Math.atan2(proj, d.w);
        q.setFromAxisAngle(s.axisT, s.k * angle);
        s.bone.quaternion.copy(s.restT).multiply(q);
      }
    },
  };
}
