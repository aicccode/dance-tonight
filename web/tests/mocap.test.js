import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { BVHLoader } from "three/addons/loaders/BVHLoader.js";
import {
  HUMAN_BONES, HUMAN_PARENT, activeRange, bakeClip, inPlace, makeRetargeter, mapBones, mirrorClip, normName, sampleClip, smoothQuats,
} from "../js/coach/mocap.js";
import { parseAmc, parseAsf, toBvh } from "../../scripts/asfamc.mjs";

/** Exact-geometry bake: no smoothing or trimming on these tiny clips. */
const bake = (opts) => bakeClip({ smooth: 0, trim: false, ...opts });

const near = (a, b, eps = 1e-3) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);
const nearV = (a, b, eps = 1e-3) => [0, 1, 2].forEach((i) => near(a.getComponent(i), b[i], eps));
const DEG = Math.PI / 180;

test("normName strips namespaces and punctuation", () => {
  assert.equal(normName("mixamorig:LeftForeArm"), "leftforearm");
  assert.equal(normName("Armature|mixamorig1:Hips"), "hips");
  assert.equal(normName("Left_Up-Leg"), "leftupleg");
  // three's FBXLoader sanitises "mixamorig:Hips" to "mixamorigHips"
  assert.equal(normName("mixamorigLeftForeArm"), "leftforearm");
  assert.equal(normName("mixamorig12Hips"), "hips");
  assert.equal(normName("Bip01 L UpperArm"), "lupperarm");
});

test("mapBones understands Mixamo, CMU and generic BVH naming", () => {
  const mixamo = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "Head", "LeftShoulder", "LeftArm", "LeftForeArm",
    "LeftHand", "RightShoulder", "RightArm", "RightForeArm", "RightHand", "LeftUpLeg", "LeftLeg", "LeftFoot",
    "LeftToeBase", "RightUpLeg", "RightLeg", "RightFoot", "RightToeBase"].map((n) => `mixamorig:${n}`);
  const m = mapBones(mixamo);
  assert.equal(Object.keys(m).length, HUMAN_BONES.length);
  assert.equal(m.leftLowerArm, "mixamorig:LeftForeArm");
  assert.equal(m.leftLowerLeg, "mixamorig:LeftLeg");
  assert.equal(m.chest, "mixamorig:Spine1");
  assert.equal(m.upperChest, "mixamorig:Spine2");

  const cmu = mapBones(["root", "lhipjoint", "lfemur", "ltibia", "lfoot", "ltoes", "rfemur", "rtibia", "rfoot",
    "rtoes", "lowerback", "upperback", "thorax", "lowerneck", "upperneck", "head", "lclavicle", "lhumerus",
    "lradius", "lwrist", "lhand", "rclavicle", "rhumerus", "rradius", "rwrist", "rhand"]);
  assert.equal(cmu.hips, "root");
  assert.equal(cmu.leftUpperLeg, "lfemur");
  assert.equal(cmu.rightLowerArm, "rradius");
  assert.equal(cmu.leftHand, "lhand", "the hand segment, not the short wrist link");
  assert.equal(cmu.upperChest, "thorax");

  const generic = mapBones(["Hips", "Chest", "Neck", "Head", "LeftCollar", "LeftUpArm", "LeftLowArm", "LeftHand",
    "RightCollar", "RightUpArm", "RightLowArm", "RightHand", "LeftUpLeg", "LeftLowLeg", "LeftFoot",
    "RightUpLeg", "RightLowLeg", "RightFoot"]);
  assert.equal(generic.leftShoulder, "LeftCollar");
  assert.equal(generic.leftUpperArm, "LeftUpArm");
  assert.equal(generic.rightLowerLeg, "RightLowLeg");
});

/** A T-pose test rig (metres, Y up, facing +Z, performer's left = +X). */
function rig({ armsDownDeg = 0 } = {}) {
  const make = (name, pos, parent) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(...pos);
    parent?.add(b);
    return b;
  };
  const hips = make("Hips", [0, 1, 0]);
  const spine = make("Spine", [0, 0.1, 0], hips);
  const chest = make("Chest", [0, 0.2, 0], spine);
  const neck = make("Neck", [0, 0.25, 0], chest);
  make("Head", [0, 0.1, 0], neck);
  for (const [s, x] of [["Left", 1], ["Right", -1]]) {
    const sh = make(`${s}Shoulder`, [0.05 * x, 0.2, 0], chest);
    const ua = make(`${s}Arm`, [0.1 * x, 0, 0], sh);
    ua.rotation.z = -x * armsDownDeg * DEG;
    const la = make(`${s}ForeArm`, [0.28 * x, 0, 0], ua);
    make(`${s}Hand`, [0.25 * x, 0, 0], la);
    const ul = make(`${s}UpLeg`, [0.1 * x, -0.05, 0], hips);
    const ll = make(`${s}Leg`, [0, -0.45, 0], ul);
    const ft = make(`${s}Foot`, [0, -0.45, 0], ll);
    make(`${s}ToeBase`, [0, -0.05, 0.12], ft);
  }
  const root = new THREE.Group();
  root.add(hips);
  return root;
}

const track = (name, times, quats) => new THREE.QuaternionKeyframeTrack(`${name}.quaternion`, times, quats.flatMap((q) => q.toArray()));
const qAxis = (x, y, z, deg) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(x, y, z).normalize(), deg * DEG);

test("bakeClip stores world-space deltas in the canonical frame", () => {
  const root = rig();
  const down = qAxis(0, 0, 1, -70); // left arm (+X) swings down
  const clip = new THREE.AnimationClip("t", 1, [track("LeftArm", [0, 1], [new THREE.Quaternion(), down])]);
  const baked = bake({ root, clip, fps: 10 });
  assert.equal(baked.frames, 11);
  near(baked.duration, 1);
  const end = sampleClip(baked, 1).q.leftUpperArm;
  assert.ok(end.angleTo(down) < 1e-3);
  // the child inherits the swing in world space
  assert.ok(sampleClip(baked, 1).q.leftLowerArm.angleTo(down) < 1e-3);
  nearV(new THREE.Vector3(...baked.rest.leftUpperArm), [1, 0, 0]);
  nearV(new THREE.Vector3(...baked.rest.leftLowerLeg), [0, -1, 0]);
  near(sampleClip(baked, 0.5).q.leftUpperArm.angleTo(new THREE.Quaternion()), 35 * DEG);
});

test("bakeClip is independent of the source's axis convention and facing", () => {
  const motion = () => new THREE.AnimationClip("t", 1, [
    track("LeftArm", [0, 1], [new THREE.Quaternion(), qAxis(0, 0, 1, -60)]),
    new THREE.VectorKeyframeTrack("Hips.position", [0, 1], [0, 1, 0, 0, 1, 0.5]),
  ]);
  const ref = bake({ root: rig(), clip: motion(), fps: 4 });

  // Z-up and facing the other way (e.g. an exporter with different axes)
  const zUp = rig();
  zUp.rotation.set(Math.PI / 2, 0, Math.PI);
  const other = bake({ root: zUp, clip: motion(), fps: 4 });
  for (const b of Object.keys(ref.bones)) {
    ref.bones[b].forEach((v, i) => near(v, other.bones[b][i], 2e-4));
  }
  ref.hips.forEach((v, i) => near(v, other.hips[i], 2e-4));
  // walks forward toward the viewer by 0.5m = 0.5 leg lengths
  near(ref.hips.at(-1), 0.5 / 0.95, 1e-3);
});

test("bakeClip rejects rigs it cannot recognise and clips without motion", () => {
  const root = new THREE.Group();
  root.add(Object.assign(new THREE.Bone(), { name: "Foo" }));
  assert.throws(() => bake({ root, clip: new THREE.AnimationClip("t", 1, []) }), /无法识别骨骼/);
  assert.throws(() => bake({ root: rig(), clip: new THREE.AnimationClip("t", 0, []) }), /没有动画/);
});

test("retargeting reproduces limb directions on an A-pose avatar", () => {
  const baked = bake({
    root: rig(), fps: 2,
    clip: new THREE.AnimationClip("t", 1, [track("LeftArm", [0, 1], [new THREE.Quaternion(), qAxis(0, 0, 1, 90)])]),
  });
  // T-pose avatar: identity at rest, arm points straight up at the end
  const tpose = { bones: HUMAN_BONES, rest: baked.rest };
  const run = makeRetargeter(baked, tpose);
  assert.ok(run(0).local.leftUpperArm.angleTo(new THREE.Quaternion()) < 1e-6);
  const up = new THREE.Vector3(1, 0, 0).applyQuaternion(
    run(1).local.leftShoulder.clone().multiply(run(1).local.leftUpperArm));
  nearV(up, [0, 1, 0]);

  // A-pose avatar (arms 45° down): rest corrected so the start pose is a T-pose
  const a = [Math.SQRT1_2, -Math.SQRT1_2, 0];
  const apose = { bones: HUMAN_BONES, rest: { ...baked.rest, leftUpperArm: a, leftLowerArm: a } };
  const r = makeRetargeter(baked, apose)(0);
  const world = r.local.hips.clone().multiply(r.local.spine).multiply(r.local.chest)
    .multiply(r.local.upperChest).multiply(r.local.leftShoulder).multiply(r.local.leftUpperArm);
  nearV(new THREE.Vector3(...a).applyQuaternion(world), [1, 0, 0]);
  // forearm stays aligned with the upper arm (local ≈ identity)
  assert.ok(r.local.leftLowerArm.angleTo(new THREE.Quaternion()) < 1e-3);
});

test("retargeting skips bones the avatar lacks without losing their rotation", () => {
  const baked = bake({
    root: rig(), fps: 2,
    clip: new THREE.AnimationClip("t", 1, [track("Chest", [0, 1], [new THREE.Quaternion(), qAxis(1, 0, 0, 30)])]),
  });
  const bones = HUMAN_BONES.filter((b) => b !== "chest" && b !== "upperChest");
  const local = makeRetargeter(baked, { bones, rest: baked.rest })(1).local;
  // neck's parent is now spine, so the chest bend lands on the neck
  near(local.neck.angleTo(new THREE.Quaternion()), 30 * DEG);
  assert.equal(local.chest, undefined);
});

test("mirrorClip swaps sides, reflects rotations, and is its own inverse", () => {
  const baked = bake({
    root: rig(), fps: 2,
    clip: new THREE.AnimationClip("t", 1, [
      track("LeftArm", [0, 1], [new THREE.Quaternion(), qAxis(0, 0, 1, -60)]),
      track("Hips", [0, 1], [new THREE.Quaternion(), qAxis(0, 1, 0, 90)]),
      new THREE.VectorKeyframeTrack("Hips.position", [0, 1], [0, 1, 0, 0.3, 1, 0]),
    ]),
  });
  const m = mirrorClip(baked);
  const s = sampleClip(m, 1);
  // the right arm does the reflection of what the left arm did
  const orig = new THREE.Vector3(1, 0, 0).applyQuaternion(sampleClip(baked, 1).q.leftUpperArm);
  nearV(new THREE.Vector3(-1, 0, 0).applyQuaternion(s.q.rightUpperArm), [-orig.x, orig.y, orig.z]);
  assert.ok(orig.y < -0.8, "source arm really swung down");
  // the other arm only follows the (mirrored) hip turn
  assert.ok(s.q.leftUpperArm.angleTo(s.q.hips) < 1e-4);
  // left turn becomes a right turn, travel flips side
  nearV(new THREE.Vector3(0, 0, 1).applyQuaternion(s.q.hips), [-1, 0, 0]);
  assert.ok(s.hips.x < 0);
  nearV(new THREE.Vector3(...m.rest.rightUpperArm), [-1, 0, 0]);
  assert.deepEqual(mirrorClip(m), baked);
});

test("inPlace removes floor travel but keeps local sway", () => {
  const n = 61;
  const hips = [];
  for (let f = 0; f < n; f++) hips.push(f * 0.05 + 0.1 * Math.sin(f), 0.01 * f, 0.02 * f);
  const clip = { fps: 30, frames: n, duration: 2, bones: {}, rest: {}, hips };
  const out = inPlace(clip, 1);
  for (let f = 15; f < 46; f++) {
    near(out.hips[f * 3 + 2], 0, 1e-9);
    assert.ok(Math.abs(out.hips[f * 3]) < 0.12);
  }
  assert.equal(out.hips[31 * 3 + 1], hips[31 * 3 + 1], "vertical motion untouched");
  assert.notEqual(out.hips, clip.hips, "returns a new clip");
});

// --- ASF/AMC (CMU) -> BVH -> bake ---------------------------------------------
const ASF = `:version 1.10
:units
  mass 1.0
  length 0.45
  angle deg
:root
   order TX TY TZ RX RY RZ
   axis XYZ
   position 0 0 0
   orientation 0 0 0
:bonedata
  begin
     id 1
     name lfemur
     direction 0 -1 0
     length 18
     axis 0 0 20 XYZ
    dof rx ry rz
  end
  begin
     id 2
     name ltibia
     direction 0 -1 0
     length 18
     axis 0 0 20 XYZ
    dof rx
  end
:hierarchy
  begin
    root lfemur
    lfemur ltibia
  end
`;
const AMC = `:FULLY-SPECIFIED
:DEGREES
1
root 0 40 0 0 0 0
lfemur 0 0 0
ltibia 0
2
root 0 40 0 0 0 0
lfemur -90 0 0
ltibia 0
`;

test("ASF/AMC converts to BVH with Acclaim axis frames", () => {
  const asf = parseAsf(ASF);
  assert.equal(asf.bones.lfemur.length, 18);
  assert.deepEqual(asf.children.root, ["lfemur"]);
  const frames = parseAmc(AMC);
  assert.equal(frames.length, 2);
  assert.deepEqual(frames[1].lfemur, [-90, 0, 0]);

  const bvh = toBvh(asf, frames, { fps: 120 });
  assert.match(bvh, /ROOT root/);
  assert.match(bvh, /Frames: 2/);
  const { skeleton, clip } = new BVHLoader().parse(bvh);
  const root = new THREE.Group();
  root.add(skeleton.bones[0]);
  const mixer = new THREE.AnimationMixer(root);
  mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play().clampWhenFinished = true;
  const knee = () => {
    root.updateMatrixWorld(true);
    return root.getObjectByName("ltibia").getWorldPosition(new THREE.Vector3());
  };
  const len = 18 / 0.45 * 0.0254;
  mixer.setTime(0);
  nearV(knee(), [0, 40 / 0.45 * 0.0254 - len, 0]);
  // rx -90 about the femur's (tilted) X axis swings the thigh forward/up to +Z
  mixer.setTime(clip.duration);
  const k = knee().sub(new THREE.Vector3(0, 40 / 0.45 * 0.0254, 0));
  // rotation of (0,-1,0) by -90° about a = (cos20°, sin20°, 0)
  const a = new THREE.Vector3(Math.cos(20 * DEG), Math.sin(20 * DEG), 0);
  const expected = new THREE.Vector3(0, -1, 0).applyAxisAngle(a, -90 * DEG).multiplyScalar(len);
  nearV(k, expected.toArray());
  assert.ok(k.z > 0.9 * len, `knee forward: ${k.toArray()}`);

  const step = toBvh(asf, [...frames, ...frames], { fps: 120, step: 2 });
  assert.match(step, /Frames: 2/);
  assert.match(step, /Frame Time: 0.01667/);
});

test("bakeClip measures hip height from the floor, not the rest-pose origin", () => {
  // CMU-style: rest pose hangs at the origin, the animation stands on y=0
  const root = rig();
  root.getObjectByName("Hips").position.set(0, 0, 0);
  const clip = new THREE.AnimationClip("t", 1, [
    new THREE.VectorKeyframeTrack("Hips.position", [0, 0.5, 1], [0, 0.95, 0, 0, 0.95 + 0.19, 0, 0, 0.95, 0]),
  ]);
  const baked = bake({ root, clip, fps: 2 });
  near(baked.hips[1], 0, 1e-4); // standing
  near(baked.hips[4], 0.2, 1e-4); // jump: 0.19 m = 0.2 leg lengths
});

test("smoothing removes jitter without shifting a steady motion", () => {
  const qs = Array.from({ length: 31 }, (_, f) => qAxis(0, 0, 1, f * 2 + (f % 2 ? 1 : -1)));
  const sm = smoothQuats(qs, 2);
  for (let f = 3; f < 28; f++) near(sm[f].angleTo(qAxis(0, 0, 1, f * 2)), 0, 0.3 * DEG);
  // sign-flipped samples are the same rotation and must not cancel out
  const flipped = qs.map((q, i) => (i % 3 ? q : new THREE.Quaternion(-q.x, -q.y, -q.z, -q.w)));
  near(smoothQuats(flipped, 2)[15].angleTo(sm[15]), 0, 1e-6);
});

test("activeRange trims long motionless lead-in and lead-out only", () => {
  const fps = 10;
  const still = Array(30).fill(1), busy = Array(40).fill(20);
  assert.deepEqual(activeRange([...still, ...busy, ...still], fps), [25, 75]);
  // under a second of stillness is part of the dance (a held pose)
  assert.deepEqual(activeRange([...Array(8).fill(1), ...busy, ...Array(8).fill(1)], fps), [0, 56]);
  assert.deepEqual(activeRange(Array(20).fill(0), fps), [0, 20]);
  assert.deepEqual(activeRange([5], fps), [0, 1]);
});

test("bakeClip trims a still lead-in and faces the viewer at the new start", () => {
  const turn = [0, 0, 0, 0, 0, 90, 180, 270, 360].map((d) => qAxis(0, 1, 0, d));
  const times = [0, 1, 2, 3, 3.5, 4, 4.5, 5, 5.5];
  const clip = new THREE.AnimationClip("t", 5.5, [track("Hips", times, turn)]);
  const baked = bakeClip({ root: rig(), clip, fps: 10, smooth: 0 });
  assert.ok(baked.duration < 3.5 && baked.duration > 2.4, `trimmed to ${baked.duration}`);
  nearV(new THREE.Vector3(0, 0, 1).applyQuaternion(sampleClip(baked, 0).q.hips), [0, 0, 1]);
  const full = bakeClip({ root: rig(), clip, fps: 10, smooth: 0, trim: false });
  near(full.duration, 5.5);
});

test("a source whose 'rest' is already a turned pose still lines up (torso twist)", () => {
  // Some exporters store the first animation frame as the rest pose. Here the
  // pelvis is turned 40° in that "rest" and the animation holds it there.
  const ref = bake({ root: rig(), clip: new THREE.AnimationClip("t", 1, [track("Hips", [0, 1], [new THREE.Quaternion(), new THREE.Quaternion()])]), fps: 2 });
  const tpose = {
    bones: HUMAN_BONES, rest: ref.rest,
    frame: Object.fromEntries(Object.entries(ref.frame).map(([b, q]) => [b, new THREE.Quaternion(...q)])),
  };
  const turned = rig();
  const hips = turned.getObjectByName("Hips");
  hips.quaternion.copy(qAxis(0, 1, 0, 40));
  const held = track("Hips", [0, 1], [hips.quaternion.clone(), hips.quaternion.clone()]);
  const baked = bake({ root: turned, clip: new THREE.AnimationClip("t", 1, [held]), fps: 2 });
  const local = makeRetargeter(baked, tpose)(0.5).local;
  // the whole body was turned, so after facing the viewer nothing is twisted
  for (const b of ["hips", "spine", "chest", "leftUpperLeg", "leftUpperArm"]) {
    assert.ok(local[b].angleTo(new THREE.Quaternion()) < 1e-3, `${b} ${local[b].angleTo(new THREE.Quaternion())}`);
  }
  // mirrored frames stay valid rotations
  const m = mirrorClip(baked);
  assert.ok(Math.abs(new THREE.Quaternion(...m.frame.hips).length() - 1) < 1e-4);
  assert.ok(makeRetargeter(m, tpose)(0.5).local.hips.angleTo(new THREE.Quaternion()) < 1e-3);
});

test("Mixamo-named FBX (rest = first frame) retargets like the original BVH", async () => {
  // Fixture: CMU #05_11 as BVH, and the same take re-exported by Blender as an
  // FBX with mixamorig: names at 24 fps (time x1.25) whose stored rest pose is
  // the first frame, not a T-pose. three's FBXLoader also flattens the names.
  const { readFileSync } = await import("node:fs");
  const { FBXLoader } = await import("three/addons/loaders/FBXLoader.js");
  const fx = (f) => new URL(`./fixtures/${f}`, import.meta.url);
  const fb = readFileSync(fx("cmu_05_11_mixamo.fbx"));
  const froot = new FBXLoader().parse(fb.buffer.slice(fb.byteOffset, fb.byteOffset + fb.byteLength), "");
  const F = bake({ root: froot, clip: froot.animations[0] });
  const { skeleton, clip } = new BVHLoader().parse(readFileSync(fx("cmu_05_11.bvh"), "utf8"));
  const broot = new THREE.Group();
  broot.add(skeleton.bones[0]);
  const B = bake({ root: broot, clip });
  const rig = {
    bones: HUMAN_BONES, rest: B.rest,
    frame: Object.fromEntries(Object.entries(B.frame).map(([b, q]) => [b, new THREE.Quaternion(...q)])),
  };
  const [rf, rb] = [makeRetargeter(F, rig), makeRetargeter(B, rig)];
  const world = (local) => {
    const w = {};
    for (const b of HUMAN_BONES) w[b] = (HUMAN_PARENT[b] ? w[HUMAN_PARENT[b]].clone() : new THREE.Quaternion()).multiply(local[b]);
    return w;
  };
  const limbs = ["leftUpperArm", "rightUpperArm", "leftLowerArm", "rightLowerArm", "leftUpperLeg", "rightLowerLeg", "leftFoot"];
  let worst = 0, chest = 0;
  for (let t = 0; t <= 4.8; t += 0.4) {
    const wb = world(rb(t).local), wf = world(rf(t * 1.25).local);
    for (const b of limbs) {
      const v = new THREE.Vector3(...B.rest[b]);
      worst = Math.max(worst, v.clone().applyQuaternion(wb[b]).angleTo(v.clone().applyQuaternion(wf[b])));
    }
    chest = Math.max(chest, wb.chest.angleTo(wf.chest));
  }
  assert.ok(worst < 5 * DEG, `limb direction error ${worst / DEG}°`);
  assert.ok(chest < 5 * DEG, `chest orientation error ${chest / DEG}°`);
});
