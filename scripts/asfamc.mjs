// Acclaim ASF/AMC (CMU motion-capture database) -> BVH text.
// ASF bone transforms follow the Acclaim convention: local = C * M * C^-1,
// where C is the bone's axis frame and M the per-frame dof rotation; the joint
// sits at the end of its parent's segment (parent direction * length).
import * as THREE from "three";

const DEG = Math.PI / 180;

/** Rotation matrix for an Acclaim angle list applied in `order` (e.g. "XYZ"). */
function axisQuat(angles, order) {
  // Acclaim applies the first listed axis first: M = R_last ... R_first.
  const q = new THREE.Quaternion();
  const axes = { X: new THREE.Vector3(1, 0, 0), Y: new THREE.Vector3(0, 1, 0), Z: new THREE.Vector3(0, 0, 1) };
  [...order].forEach((ax, i) => {
    q.premultiply(new THREE.Quaternion().setFromAxisAngle(axes[ax], (angles[i] ?? 0) * DEG));
  });
  return q;
}

export function parseAsf(text) {
  const lines = text.split(/\r?\n/);
  const bones = { root: { name: "root", dir: [0, 0, 0], length: 0, axis: [0, 0, 0], order: "XYZ", dof: [] } };
  const children = {};
  let scale = 1, section = "", cur = null;
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    if (line.startsWith(":")) {
      section = line.split(/\s+/)[0];
      continue;
    }
    const tok = line.split(/\s+/);
    if (section === ":units" && tok[0] === "length") scale = Number(tok[1]);
    if (section === ":root" && tok[0] === "axis") bones.root.order = tok[1];
    if (section === ":root" && tok[0] === "orientation") bones.root.axis = tok.slice(1, 4).map(Number);
    if (section === ":bonedata") {
      if (tok[0] === "begin") cur = { dof: [], order: "XYZ" };
      else if (tok[0] === "end") bones[cur.name] = cur;
      else if (tok[0] === "name") cur.name = tok[1];
      else if (tok[0] === "direction") cur.dir = tok.slice(1, 4).map(Number);
      else if (tok[0] === "length") cur.length = Number(tok[1]);
      else if (tok[0] === "axis") {
        cur.axis = tok.slice(1, 4).map(Number);
        cur.order = tok[4] ?? "XYZ";
      } else if (tok[0] === "dof") cur.dof = tok.slice(1).map((d) => d.toLowerCase());
    }
    if (section === ":hierarchy" && tok[0] !== "begin" && tok[0] !== "end") {
      children[tok[0]] = [...(children[tok[0]] ?? []), ...tok.slice(1)];
    }
  }
  // CMU lengths are inches scaled by `length`; convert to metres.
  const unit = (1 / scale) * 0.0254;
  return { bones, children, unit };
}

/** Frames of {bone: number[]} (root includes TX TY TZ RX RY RZ). */
export function parseAmc(text) {
  const frames = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(":")) continue;
    if (/^\d+$/.test(line)) {
      cur = {};
      frames.push(cur);
      continue;
    }
    if (!cur) continue;
    const [name, ...vals] = line.split(/\s+/);
    cur[name] = vals.map(Number);
  }
  return frames;
}

function boneRotation(bone, values) {
  if (bone.name === "root") {
    return axisQuat(values.slice(3, 6), "XYZ");
  }
  const angles = { x: 0, y: 0, z: 0 };
  bone.dof.forEach((d, i) => {
    if (d[0] === "r") angles[d[1]] = values?.[i] ?? 0;
  });
  const order = bone.dof.filter((d) => d[0] === "r").map((d) => d[1].toUpperCase()).join("") || "XYZ";
  const m = axisQuat(order.split("").map((a) => angles[a.toLowerCase()]), order);
  const c = axisQuat(bone.axis, bone.order);
  return c.clone().multiply(m).multiply(c.clone().invert());
}

const fmt = (v) => (Math.abs(v) < 1e-9 ? "0" : v.toFixed(5).replace(/0+$/, "").replace(/\.$/, ""));

/** Convert parsed ASF + AMC frames into BVH text, keeping every `step`-th frame. */
export function toBvh(asf, frames, { fps = 120, step = 1 } = {}) {
  const { bones, children, unit } = asf;
  const order = [];
  const lines = [];
  const offsetOf = (name, parent) => {
    if (!parent || parent === "root") return [0, 0, 0];
    const p = bones[parent];
    return p.dir.map((d) => d * p.length * unit);
  };
  const emit = (name, parent, depth) => {
    const pad = "  ".repeat(depth);
    order.push(name);
    lines.push(`${pad}${parent ? "JOINT" : "ROOT"} ${name}`, `${pad}{`);
    lines.push(`${pad}  OFFSET ${offsetOf(name, parent).map(fmt).join(" ")}`);
    lines.push(`${pad}  CHANNELS ${parent ? "3" : "6 Xposition Yposition Zposition"} Zrotation Yrotation Xrotation`);
    const kids = children[name] ?? [];
    for (const k of kids) emit(k, name, depth + 1);
    if (!kids.length) {
      const b = bones[name];
      lines.push(`${pad}  End Site`, `${pad}  {`, `${pad}    OFFSET ${b.dir.map((d) => fmt(d * b.length * unit)).join(" ")}`, `${pad}  }`);
    }
    lines.push(`${pad}}`);
  };
  emit("root", null, 0);

  const kept = frames.filter((_, i) => i % step === 0);
  const euler = new THREE.Euler();
  const motion = kept.map((f) => {
    const vals = [];
    for (const name of order) {
      const v = f[name];
      if (name === "root") vals.push(...[0, 1, 2].map((i) => (v?.[i] ?? 0) * unit));
      euler.setFromQuaternion(boneRotation(bones[name], v), "ZYX");
      vals.push(euler.z / DEG, euler.y / DEG, euler.x / DEG);
    }
    return vals.map(fmt).join(" ");
  });
  return [
    "HIERARCHY", ...lines,
    "MOTION", `Frames: ${kept.length}`, `Frame Time: ${fmt(step / fps)}`, ...motion, "",
  ].join("\n");
}
