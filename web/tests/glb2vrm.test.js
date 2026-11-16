import { test } from "node:test";
import assert from "node:assert/strict";
import { glbToVrm, springBones } from "../../scripts/glb2vrm.mjs";

/** Minimal glTF: a T-posed humanoid chain plus a 2-joint hair spring and a 1-joint breast spring. */
function rig() {
  const nodes = [];
  const add = (name, t, extras) => (nodes.push({ name, translation: t, children: [], ...(extras ? { extras } : {}) }), nodes.length - 1);
  const link = (p, c) => nodes[p].children.push(c);
  const hips = add("hips", [0, 0.9, 0]);
  const spine = add("spine", [0, 0.1, 0]); link(hips, spine);
  const chest = add("chest", [0, 0.12, 0]); link(spine, chest);
  const upperChest = add("upperChest", [0, 0.12, 0]); link(chest, upperChest);
  const neck = add("neck", [0, 0.15, 0]); link(upperChest, neck);
  const head = add("head", [0, 0.08, 0]); link(neck, head);
  for (const [s, x] of [["left", 1], ["right", -1]]) {
    const ua = add(`${s}UpperArm`, [0.18 * x, 0.1, 0]); link(upperChest, ua);
    const la = add(`${s}LowerArm`, [0.25 * x, 0, 0]); link(ua, la);
    const hand = add(`${s}Hand`, [0.24 * x, 0, 0]); link(la, hand);
    const ul = add(`${s}UpperLeg`, [0.09 * x, -0.05, 0]); link(hips, ul);
    const ll = add(`${s}LowerLeg`, [0, -0.4, 0]); link(ul, ll);
    const foot = add(`${s}Foot`, [0, -0.4, 0]); link(ll, foot);
  }
  const hp = { spring_group: "hair", spring_stiffness: 0.7, spring_gravity: 0.35, spring_drag: 0.4, spring_radius: 0.015 };
  const h1 = add("hair_00_1", [0, 0.1, -0.05], { ...hp, spring_chain: "hair_00" }); link(head, h1);
  const h2 = add("hair_00_2", [0, -0.05, -0.03], { ...hp, spring_chain: "hair_00" }); link(h1, h2);
  const he = add("hair_00_end", [0, -0.04, 0], { ...hp, spring_chain: "hair_00" }); link(h2, he);
  const bp = { spring_group: "breast", spring_stiffness: 1.6, spring_gravity: 0.06, spring_drag: 0.55, spring_radius: 0.04 };
  const br = add("leftBreast", [0.06, 0.02, 0.05], { ...bp, spring_chain: "leftBreast" }); link(chest, br);
  const be = add("leftBreast_end", [0, 0, 0.06], { ...bp, spring_chain: "leftBreast" }); link(br, be);
  for (const n of nodes) if (!n.children.length) delete n.children;
  return { asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [hips] }], nodes };
}

function glb(gltf) {
  let json = Buffer.from(JSON.stringify(gltf));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const h = Buffer.alloc(20);
  h.write("glTF", 0, "latin1"); h.writeUInt32LE(2, 4); h.writeUInt32LE(20 + json.length, 8);
  h.writeUInt32LE(json.length, 12); h.write("JSON", 16, "latin1");
  return Buffer.concat([h, json]);
}
const parse = (buf) => JSON.parse(buf.toString("utf8", 20, 20 + buf.readUInt32LE(12)));

test("springBones builds one spring per chain, joints ordered root to tip", () => {
  const g = rig();
  const sb = springBones(g);
  const names = sb.springs.map((s) => s.name).sort();
  assert.deepEqual(names, ["hair_00", "leftBreast"]);
  const hair = sb.springs.find((s) => s.name === "hair_00");
  assert.deepEqual(hair.joints.map((j) => g.nodes[j.node].name), ["hair_00_1", "hair_00_2", "hair_00_end"]);
  assert.equal(hair.joints[0].stiffness, 0.7);
  assert.equal(hair.joints[0].gravityPower, 0.35);
  assert.deepEqual(hair.joints[0].gravityDir, [0, -1, 0]);
  assert.equal(hair.joints[0].hitRadius, 0.015);
  assert.ok(hair.colliderGroups.length === 1, "hair collides with the body");
  const breast = sb.springs.find((s) => s.name === "leftBreast");
  assert.equal(breast.colliderGroups.length, 0, "soft tissue does not collide (no jitter)");
});

test("springBones adds body colliders with offsets in the node's local space", () => {
  const sb = springBones(rig());
  assert.ok(sb.colliders.length >= 8);
  const headSphere = sb.colliders.find((c) => c.shape.sphere);
  assert.ok(headSphere.shape.sphere.radius > 0.05);
  const caps = sb.colliders.filter((c) => c.shape.capsule);
  assert.ok(caps.every((c) => c.shape.capsule.tail.some((v) => Math.abs(v) > 0.01)), "capsules span to the child bone");
  assert.equal(sb.colliderGroups[0].colliders.length, sb.colliders.length);
});

test("glbToVrm writes the jaw and the spring bone extension", () => {
  const g = rig();
  g.nodes.push({ name: "jaw", translation: [0, 0.02, 0.05] });
  g.nodes[g.nodes.findIndex((n) => n.name === "head")].children.push(g.nodes.length - 1);
  const out = parse(glbToVrm(glb(g), { name: "t", author: "a" }));
  const hb = out.extensions.VRMC_vrm.humanoid.humanBones;
  assert.equal(out.nodes[hb.jaw.node].name, "jaw");
  assert.ok(out.extensions.VRMC_springBone.springs.length === 2);
  assert.ok(out.extensionsUsed.includes("VRMC_springBone"));
});

test("glbToVrm leaves out the spring extension when the rig has no spring bones", () => {
  const g = rig();
  for (const n of g.nodes) delete n.extras;
  const out = parse(glbToVrm(glb(g)));
  assert.equal(out.extensions.VRMC_springBone, undefined);
});
