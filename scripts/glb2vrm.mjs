// Turn a rigged, T-posed humanoid GLB (bones named after VRM humanoid bones,
// facing +Z) into a VRM 1.0 file the app can import as a coach.
//   node scripts/glb2vrm.mjs in.glb out.vrm "Name" "Author"
import { readFileSync, writeFileSync } from "node:fs";

const BONES = [
  "hips", "spine", "chest", "upperChest", "neck", "head", "leftEye", "rightEye", "jaw",
  "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
  "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
  "leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes",
  "rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes",
  ...["left", "right"].flatMap((side) => [
    ...["Metacarpal", "Proximal", "Distal"].map((s) => `${side}Thumb${s}`),
    ...["Index", "Middle", "Ring", "Little"].flatMap((f) => ["Proximal", "Intermediate", "Distal"].map((s) => `${side}${f}${s}`)),
  ]),
];
const REQUIRED = ["hips", "spine", "head", "leftUpperArm", "leftLowerArm", "leftHand", "rightUpperArm", "rightLowerArm",
  "rightHand", "leftUpperLeg", "leftLowerLeg", "leftFoot", "rightUpperLeg", "rightLowerLeg", "rightFoot"];

// ---------- spring bones (VRMC_springBone) from node extras written by the Blender export ----------
const qmul = (a, b) => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qrot = (q, v) => {
  const p = qmul(qmul(q, [v[0], v[1], v[2], 0]), [-q[0], -q[1], -q[2], q[3]]);
  return [p[0], p[1], p[2]];
};
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];

/** World rotation (quaternion) and position of every node; scale is assumed 1 (transforms applied). */
function worldTransforms(gltf) {
  const parent = new Map();
  gltf.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const out = new Array(gltf.nodes.length);
  const get = (i) => {
    if (out[i]) return out[i];
    const n = gltf.nodes[i];
    const r = n.rotation ?? [0, 0, 0, 1], t = n.translation ?? [0, 0, 0];
    if (!parent.has(i)) return (out[i] = { q: r, p: t });
    const P = get(parent.get(i));
    const pt = qrot(P.q, t);
    return (out[i] = { q: qmul(P.q, r), p: [P.p[0] + pt[0], P.p[1] + pt[1], P.p[2] + pt[2]] });
  };
  gltf.nodes.forEach((_, i) => get(i));
  return out;
}

const BODY_CAPSULES = [ // [from, to, radius] in metres (a 1.65 m figure)
  ["hips", "spine", 0.12], ["spine", "chest", 0.11], ["chest", "upperChest", 0.11], ["upperChest", "neck", 0.09],
  ["neck", "head", 0.05],
  ...["left", "right"].flatMap((s) => [
    [`${s}UpperArm`, `${s}LowerArm`, 0.045], [`${s}LowerArm`, `${s}Hand`, 0.035], [`${s}UpperLeg`, `${s}LowerLeg`, 0.07],
  ]),
];

/** VRMC_springBone from nodes tagged with extras.spring_chain (hair collides with the body, soft tissue does not). */
export function springBones(gltf) {
  const byName = new Map(gltf.nodes.map((n, i) => [n.name, i]));
  const W = worldTransforms(gltf);
  const local = (node, world) => { // world-space vector -> node-local offset
    return qrot(qinv(W[node].q), world);
  };
  const colliders = [];
  const head = byName.get("head");
  if (head !== undefined) colliders.push({ node: head, shape: { sphere: { offset: local(head, [0, 0.09, 0.01]), radius: 0.095 } } });
  for (const [a, b, r] of BODY_CAPSULES) {
    const i = byName.get(a), j = byName.get(b);
    if (i === undefined || j === undefined) continue;
    const d = [W[j].p[0] - W[i].p[0], W[j].p[1] - W[i].p[1], W[j].p[2] - W[i].p[2]];
    colliders.push({ node: i, shape: { capsule: { offset: [0, 0, 0], radius: r, tail: local(i, d) } } });
  }
  const chains = new Map();
  gltf.nodes.forEach((n, i) => {
    const c = n.extras?.spring_chain;
    if (c) chains.set(c, [...(chains.get(c) ?? []), i]);
  });
  const parent = new Map();
  gltf.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => parent.set(c, i)));
  const springs = [];
  for (const [name, ids] of chains) {
    const set = new Set(ids);
    let cur = ids.find((i) => !set.has(parent.get(i)));
    const ordered = [];
    while (cur !== undefined) {
      ordered.push(cur);
      cur = (gltf.nodes[cur].children ?? []).find((c) => set.has(c));
    }
    const e = gltf.nodes[ordered[0]].extras;
    springs.push({
      name,
      joints: ordered.map((node) => ({
        node, hitRadius: e.spring_radius ?? 0.02, stiffness: e.spring_stiffness ?? 1,
        gravityPower: e.spring_gravity ?? 0, gravityDir: [0, -1, 0], dragForce: e.spring_drag ?? 0.5,
      })),
      colliderGroups: String(e.spring_group).startsWith("hair") && colliders.length ? [0] : [],
    });
  }
  if (!springs.length) return null;
  return {
    specVersion: "1.0",
    colliders,
    colliderGroups: [{ name: "body", colliders: colliders.map((_, i) => i) }],
    springs,
  };
}

export function glbToVrm(glb, { name = "Realistic coach", author = "Unknown" } = {}) {
  if (glb.toString("latin1", 0, 4) !== "glTF") throw new Error("not a GLB file");
  const jsonLen = glb.readUInt32LE(12);
  if (glb.toString("latin1", 16, 20) !== "JSON") throw new Error("GLB has no JSON chunk");
  const gltf = JSON.parse(glb.toString("utf8", 20, 20 + jsonLen));
  const rest = glb.subarray(20 + jsonLen); // BIN chunk (header included), unchanged

  const byName = new Map(gltf.nodes.map((n, i) => [n.name, i]));
  const humanBones = {};
  for (const b of BONES) if (byName.has(b)) humanBones[b] = { node: byName.get(b) };
  const missing = REQUIRED.filter((b) => !humanBones[b]);
  if (missing.length) throw new Error(`missing humanoid bones: ${missing.join(", ")}`);

  const range = (out) => ({ inputMaxValue: 90, outputScale: out });
  gltf.extensions = {
    ...gltf.extensions,
    VRMC_vrm: {
      specVersion: "1.0",
      meta: {
        name, version: "1.0", authors: [author],
        licenseUrl: "https://vrm.dev/licenses/1.0/",
        avatarPermission: "onlyAuthor", commercialUsage: "personalNonProfit", creditNotation: "required",
        allowExcessivelyViolentUsage: false, allowExcessivelySexualUsage: false, allowPoliticalOrReligiousUsage: false,
        allowAntisocialOrHateUsage: false, allowRedistribution: false, modification: "prohibited",
      },
      humanoid: { humanBones },
      ...(humanBones.leftEye && humanBones.rightEye ? {
        lookAt: {
          type: "bone", offsetFromHeadBone: [0, 0.06, 0],
          rangeMapHorizontalInner: range(12), rangeMapHorizontalOuter: range(12),
          rangeMapVerticalDown: range(8), rangeMapVerticalUp: range(8),
        },
      } : {}),
    },
  };
  const springs = springBones(gltf);
  if (springs) gltf.extensions.VRMC_springBone = springs;
  gltf.extensionsUsed = [...new Set([...(gltf.extensionsUsed ?? []), "VRMC_vrm", ...(springs ? ["VRMC_springBone"] : [])])];

  let json = Buffer.from(JSON.stringify(gltf), "utf8");
  const pad = (4 - (json.length % 4)) % 4;
  json = Buffer.concat([json, Buffer.alloc(pad, 0x20)]);
  const header = Buffer.alloc(20);
  header.write("glTF", 0, "latin1");
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + json.length + rest.length, 8);
  header.writeUInt32LE(json.length, 12);
  header.write("JSON", 16, "latin1");
  return Buffer.concat([header, json, rest]);
}

if (process.argv[1]?.endsWith("glb2vrm.mjs")) {
  const [, , input, output, name, author] = process.argv;
  if (!input || !output) {
    console.error("usage: node scripts/glb2vrm.mjs in.glb out.vrm [name] [author]");
    process.exit(2);
  }
  const vrm = glbToVrm(readFileSync(input), { name, author });
  writeFileSync(output, vrm);
  console.log(`wrote ${output} (${(vrm.length / 1048576).toFixed(1)} MB)`);
}
