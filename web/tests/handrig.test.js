import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { FINGERS, fingerCurls, halfJointRig } from "../js/coach/handrig.js";

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

/** A flat left hand in the scene frame: fingers along +X, palm facing -Y, thumb toward +Z. */
function flatLeftHand() {
  const p = {
    leftHand: [0, 0, 0],
    leftThumbMetacarpal: [0.02, 0, 0.03], leftThumbProximal: [0.05, 0, 0.05], leftThumbDistal: [0.08, 0, 0.06],
  };
  FINGERS.slice(1).forEach((f, i) => {
    const z = 0.02 - i * 0.015;
    p[`left${f}Proximal`] = [0.1, 0, z];
    p[`left${f}Intermediate`] = [0.14, 0, z];
    p[`left${f}Distal`] = [0.17, 0, z];
  });
  return (name) => (p[name] ? new THREE.Vector3(...p[name]) : null);
}

test("fingerCurls bends every finger joint toward the palm", () => {
  const curls = fingerCurls(flatLeftHand(), { Proximal: 20, Intermediate: 30, Distal: 20, Thumb: 10 });
  const q = curls.get("leftIndexIntermediate");
  assert.ok(q, "index finger gets a curl");
  // a finger segment pointing along +X must swing toward the palm (-Y) when rotated
  const tip = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
  assert.ok(tip.y < -0.4, `tip moves toward the palm, got ${tip.y}`);
  near(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0).angleTo(q), 30 * Math.PI / 180, 1e-6);
  assert.ok(curls.has("leftThumbProximal"));
  assert.ok(!curls.has("rightIndexProximal"), "missing hand is skipped");
});

test("fingerCurls closes a splayed hand: fingertips converge toward the middle finger", () => {
  // splayed left hand: fingers fan out in the palm plane (XZ), palm facing -Y
  const p = { leftHand: [0, 0, 0] };
  const fan = { Index: 18, Middle: 0, Ring: -14, Little: -28 };
  for (const [f, a] of Object.entries(fan)) {
    const d = [Math.cos(a * Math.PI / 180), 0, Math.sin(a * Math.PI / 180)];
    const base = [0.1, 0, 0.02 - Object.keys(fan).indexOf(f) * 0.015];
    p[`left${f}Proximal`] = base;
    p[`left${f}Intermediate`] = base.map((v, i) => v + d[i] * 0.04);
    p[`left${f}Distal`] = base.map((v, i) => v + d[i] * 0.07);
  }
  p.leftThumbMetacarpal = [0.02, 0, 0.04]; p.leftThumbProximal = [0.05, 0, 0.07]; p.leftThumbDistal = [0.08, 0, 0.09];
  const pos = (n) => (p[n] ? new THREE.Vector3(...p[n]) : null);
  const curls = fingerCurls(pos, { Proximal: 0, Intermediate: 0, Distal: 0, Thumb: 0, Together: 1 });
  const dirOf = (f) => {
    const d = pos(`left${f}Intermediate`).sub(pos(`left${f}Proximal`)).normalize();
    return d.applyQuaternion(curls.get(`left${f}Proximal`) ?? new THREE.Quaternion());
  };
  const mid = dirOf("Middle");
  for (const f of ["Index", "Ring", "Little"]) {
    assert.ok(dirOf(f).angleTo(mid) < 3 * Math.PI / 180, `${f} lines up with the middle finger`);
  }
});

test("fingerCurls returns nothing for an avatar without finger bones", () => {
  const pos = (n) => (n === "leftHand" ? new THREE.Vector3() : null);
  assert.equal(fingerCurls(pos).size, 0);
});

test("halfJointRig drives helpers at half the source rotation", () => {
  const root = new THREE.Group();
  const upper = new THREE.Bone(); upper.name = "leftUpperLeg";
  const lower = new THREE.Bone(); lower.name = "leftLowerLeg";
  const half = new THREE.Bone(); half.name = "leftLowerLegHalf";
  const rest = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.3);
  lower.quaternion.copy(rest); half.quaternion.copy(rest);
  upper.add(lower, half); root.add(upper);
  const rig = halfJointRig(root);
  assert.equal(rig.count, 1);
  const bend = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.2);
  lower.quaternion.copy(rest).multiply(bend);
  rig.update();
  const got = rest.clone().invert().multiply(half.quaternion);
  near(got.angleTo(new THREE.Quaternion()), 0.6);
  // the half rotation is about the same hinge axis
  const axis = new THREE.Vector3(got.x, got.y, got.z).normalize();
  near(Math.abs(axis.x), 1);
});

test("halfJointRig ignores scenes without helper bones", () => {
  const rig = halfJointRig(new THREE.Group());
  assert.equal(rig.count, 0);
  rig.update();
});

import { bendCorrectives } from "../js/coach/handrig.js";

/** A minimal humanoid: thigh -> shin -> foot chain plus a morph-target mesh. */
function legRig() {
  const root = new THREE.Group();
  const hips = new THREE.Bone(); root.add(hips);
  const upper = new THREE.Bone(); upper.position.set(0.1, 0, 0); hips.add(upper);
  const lower = new THREE.Bone(); lower.position.set(0, -0.4, 0); upper.add(lower);
  const foot = new THREE.Bone(); foot.position.set(0, -0.4, 0); lower.add(foot);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.morphTargetDictionary = { kneeFlex_left: 0, kneeDeep_left: 1, wristFlex_left: 2, kneeLow_left: 3 };
  mesh.morphTargetInfluences = [0, 0, 0, 0];
  root.add(mesh);
  const bones = { leftUpperLeg: upper, leftLowerLeg: lower, leftFoot: foot };
  root.updateMatrixWorld(true);
  return { root, mesh, lower, node: (n) => bones[n] ?? null };
}

test("bendCorrectives drives knee shapes from the bend angle", () => {
  const { root, mesh, lower, node } = legRig();
  const rig = bendCorrectives(root, node);
  assert.equal(rig.count, 3, "knee shapes found, wrist shape skipped without wrist bones");
  const bend = (deg) => {
    lower.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), (deg * Math.PI) / 180);
    root.updateMatrixWorld(true);
    rig.update();
    return [...mesh.morphTargetInfluences];
  };
  near(bend(0)[0], 0);
  near(bend(45)[0], 0.5, 1e-3);
  near(bend(90)[0], 1, 1e-3);
  near(bend(90)[1], 0, 1e-3);
  near(bend(110)[1], 0.5, 1e-3);
  near(bend(130)[1], 1, 1e-3);
  near(bend(-30)[0], 1 / 3, 1e-3); // the knee bends one way: magnitude only
});

test("bendCorrectives: the small-bend knee shape peaks at 30 deg and hands over by 90 deg", () => {
  const { root, mesh, lower, node } = legRig();
  const rig = bendCorrectives(root, node);
  const at = (deg) => {
    lower.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), (deg * Math.PI) / 180);
    root.updateMatrixWorld(true); rig.update();
    return mesh.morphTargetInfluences[3];
  };
  near(at(0), 0); near(at(15), 0.5, 1e-3); near(at(30), 1, 1e-3); near(at(60), 0.5, 1e-3); near(at(90), 0, 1e-3); near(at(120), 0, 1e-3);
});

test("bendCorrectives is a no-op for avatars without corrective shapes", () => {
  const root = new THREE.Group();
  const rig = bendCorrectives(root, () => null);
  assert.equal(rig.count, 0);
  rig.update();
});

test("bendCorrectives tells wrist flexion (toward the palm) from extension", () => {
  // left arm along +X, palm facing -Y, little finger toward -Z
  const root = new THREE.Group();
  const fore = new THREE.Bone(); root.add(fore);
  const hand = new THREE.Bone(); hand.position.set(0.25, 0, 0); fore.add(hand);
  const mk = (x, z) => { const b = new THREE.Bone(); b.position.set(x, 0, z); hand.add(b); return b; };
  const bones = { leftLowerArm: fore, leftHand: hand, leftMiddleProximal: mk(0.1, 0), leftIndexProximal: mk(0.1, 0.02), leftLittleProximal: mk(0.1, -0.03) };
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.morphTargetDictionary = { wristFlex_left: 0, wristExt_left: 1 }; mesh.morphTargetInfluences = [0, 0];
  root.add(mesh); root.updateMatrixWorld(true);
  const rig = bendCorrectives(root, (n) => bones[n] ?? null);
  assert.equal(rig.count, 2);
  const tilt = (deg) => {
    hand.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (deg * Math.PI) / 180);
    root.updateMatrixWorld(true); rig.update(); return [...mesh.morphTargetInfluences];
  };
  const palmSide = tilt(-25); // rotating about +Z by a negative angle swings the fingers toward -Y (the palm)
  near(palmSide[0], 0.5, 1e-3); near(palmSide[1], 0);
  const backSide = tilt(25);
  near(backSide[0], 0); near(backSide[1], 0.5, 1e-3);
});

import { twistRig } from "../js/coach/handrig.js";

/** Upper arm -> lower arm -> hand along +X, with twist bones as children like the exported rig. */
function armRig() {
  const root = new THREE.Group();
  const B = (name, x, parent) => { const b = new THREE.Bone(); b.name = name; b.position.set(x, 0, 0); (parent ?? root).add(b); return b; };
  const ua = B("leftUpperArm", 0);
  const la = B("leftLowerArm", 0.25, ua);
  const hand = B("leftHand", 0.24, la);
  B("leftMiddleProximal", 0.08, hand);
  const uaT = B("leftUpperArmTwist", 0, ua);
  const laT = B("leftLowerArmTwist", 0.12, la);
  // the forearm twist bone has its own rest orientation (e.g. a different roll)
  laT.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.4);
  root.updateMatrixWorld(true);
  const node = (n) => root.getObjectByName(n) ?? null;
  return { root, ua, la, hand, uaT, laT, node };
}
const twistAngle = (q, axis) => 2 * Math.atan2(q.x * axis.x + q.y * axis.y + q.z * axis.z, q.w);

test("twistRig: the forearm twist bone takes half of the hand's twist", () => {
  const { root, hand, laT, node } = armRig();
  const rest = laT.quaternion.clone();
  const rig = twistRig(root, node);
  assert.equal(rig.count, 2);
  hand.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 1.2);   // pronation: twist about the forearm axis
  rig.update();
  const d = rest.clone().invert().multiply(laT.quaternion);
  const axis = new THREE.Vector3(1, 0, 0).applyQuaternion(rest.clone().invert());
  near(twistAngle(d, axis), 0.6, 1e-6);
});

test("twistRig: swing without twist leaves the twist bones alone", () => {
  const { root, hand, ua, uaT, laT, node } = armRig();
  const r1 = uaT.quaternion.clone(), r2 = laT.quaternion.clone();
  const rig = twistRig(root, node);
  hand.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.7);     // wrist flexion only
  ua.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), 0.5);       // arm swing only
  rig.update();
  near(r1.angleTo(uaT.quaternion), 0, 1e-6);
  near(r2.angleTo(laT.quaternion), 0, 1e-6);
});

test("twistRig: the upper-arm twist bone undoes half of the arm's own twist", () => {
  const { root, ua, uaT, node } = armRig();
  const rig = twistRig(root, node);
  ua.quaternion.setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.8);
  rig.update();
  near(twistAngle(uaT.quaternion, new THREE.Vector3(1, 0, 0)), -0.4, 1e-6);
});

test("twistRig: a rotation stored with negative w gives the same (short) twist", () => {
  const { root, hand, laT, node } = armRig();
  const rest = laT.quaternion.clone();
  const rig = twistRig(root, node);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.3);
  hand.quaternion.set(-q.x, -q.y, -q.z, -q.w);            // same rotation, opposite sign (mocap data often has this)
  rig.update();
  const d = rest.clone().invert().multiply(laT.quaternion);
  near(Math.abs(twistAngle(d.w < 0 ? d.set(-d.x, -d.y, -d.z, -d.w) : d, new THREE.Vector3(1, 0, 0).applyQuaternion(rest.clone().invert()))), 0.15, 1e-6);
});
