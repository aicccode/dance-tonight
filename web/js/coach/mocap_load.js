// Load a user's motion file (Mixamo FBX, BVH, VRMA/GLB) and bake it.
import * as THREE from "three";
import { BVHLoader } from "three/addons/loaders/BVHLoader.js";
import { FBXLoader } from "three/addons/loaders/FBXLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { t } from "../i18n/index.js";
import { bakeClip } from "./mocap.js";

const buffer = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const longest = (clips) => [...(clips ?? [])].sort((a, b) => b.duration - a.duration)[0] ?? null;

async function loadGltf(bytes) {
  const gltf = await new GLTFLoader().parseAsync(buffer(bytes), "");
  const human = gltf.parser.json.extensions?.VRMC_vrm_animation?.humanoid?.humanBones;
  let map;
  if (human) {
    // VRMA names its humanoid bones explicitly: node index -> object name
    const byIndex = new Map();
    gltf.scene.traverse((o) => {
      const idx = gltf.parser.associations.get(o)?.nodes;
      if (idx !== undefined) byIndex.set(idx, o.name);
    });
    map = {};
    for (const [bone, { node }] of Object.entries(human)) {
      if (byIndex.has(node)) map[bone] = byIndex.get(node);
    }
  }
  return { root: gltf.scene, clip: longest(gltf.animations), map };
}

/** Parse a motion file into {root, clip, map?} without baking. */
export async function loadMotion({ ext, bytes }) {
  const kind = String(ext).toLowerCase();
  if (kind === "bvh") {
    const { skeleton, clip } = new BVHLoader().parse(new TextDecoder().decode(bytes));
    const root = new THREE.Group();
    root.add(skeleton.bones[0]);
    return { root, clip };
  }
  if (kind === "fbx") {
    const root = new FBXLoader().parse(buffer(bytes), "");
    return { root, clip: longest(root.animations) };
  }
  if (kind === "vrma" || kind === "glb") return loadGltf(bytes);
  throw new Error(t("coach.badFormat"));
}

/** Motion file -> baked clip ready to save. */
export async function bakeMotion(file, meta = {}) {
  let parsed;
  try {
    parsed = await loadMotion(file);
  } catch (err) {
    console.warn("motion parse failed", err);
    throw new Error(t("coach.parseFailed"));
  }
  if (!parsed.clip) throw new Error(t("coach.noAnim"));
  return { ...meta, ...bakeClip({ ...parsed, fps: 30 }) };
}
