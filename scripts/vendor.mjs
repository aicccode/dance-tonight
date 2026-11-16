// Copy browser libraries from node_modules into web/vendor (served via app://).
// Run automatically after `npm install` (postinstall). The MediaPipe pose model
// is downloaded once from Google Storage if missing (uses your proxy env).
import { cpSync, existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = (p) => join(root, "node_modules", p);
const out = (p) => join(root, "web", "vendor", p);

const copies = [
  ["three/build/three.module.js", "three/build/three.module.js"],
  ["three/build/three.core.js", "three/build/three.core.js"],
  ["three/examples/jsm/loaders/GLTFLoader.js", "three/examples/jsm/loaders/GLTFLoader.js"],
  ["three/examples/jsm/utils/BufferGeometryUtils.js", "three/examples/jsm/utils/BufferGeometryUtils.js"],
  ["three/examples/jsm/loaders/FBXLoader.js", "three/examples/jsm/loaders/FBXLoader.js"],
  ["three/examples/jsm/environments/RoomEnvironment.js", "three/examples/jsm/environments/RoomEnvironment.js"],
  ["three/examples/jsm/loaders/BVHLoader.js", "three/examples/jsm/loaders/BVHLoader.js"],
  ["three/examples/jsm/libs/fflate.module.js", "three/examples/jsm/libs/fflate.module.js"],
  ["three/examples/jsm/curves/NURBSCurve.js", "three/examples/jsm/curves/NURBSCurve.js"],
  ["three/examples/jsm/curves/NURBSUtils.js", "three/examples/jsm/curves/NURBSUtils.js"],
  ["three/examples/jsm/utils/SkeletonUtils.js", "three/examples/jsm/utils/SkeletonUtils.js"],
  ["@pixiv/three-vrm/lib/three-vrm.module.min.js", "three-vrm/three-vrm.module.js"],
  ["@mediapipe/tasks-vision/vision_bundle.mjs", "tasks-vision/vision_bundle.mjs"],
  ["@mediapipe/tasks-vision/wasm", "tasks-vision/wasm"],
  ["onnxruntime-web/dist/ort.wasm.min.mjs", "ort/ort.wasm.min.mjs"],
  ["onnxruntime-web/dist/ort-wasm-simd-threaded.mjs", "ort/ort-wasm-simd-threaded.mjs"],
  ["onnxruntime-web/dist/ort-wasm-simd-threaded.wasm", "ort/ort-wasm-simd-threaded.wasm"],
];
for (const d of ["three", "three-vrm", "tasks-vision", "ort"]) rmSync(out(d), { recursive: true, force: true });
for (const [from, to] of copies) {
  if (!existsSync(nm(from))) throw new Error(`missing ${from} — run npm install`);
  mkdirSync(dirname(out(to)), { recursive: true });
  cpSync(nm(from), out(to), { recursive: true });
}

const model = out("models/pose_landmarker_lite.task");
if (!existsSync(model) || statSync(model).size < 5_000_000) {
  mkdirSync(dirname(model), { recursive: true });
  console.log("downloading MediaPipe pose model…");
  execFileSync("curl", ["-fL", "--retry", "5", "-C", "-", "-o", `${model}.part`,
    "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task"], { stdio: "inherit" });
  cpSync(`${model}.part`, model);
  rmSync(`${model}.part`);
}
console.log("vendor ok");
