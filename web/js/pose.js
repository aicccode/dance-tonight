// Camera + MediaPipe PoseLandmarker.
// MediaPipe files are vendored (scripts/vendor.mjs) and served via app://.
import { t } from "./i18n/index.js";
const VENDOR = new URL("../vendor/tasks-vision", import.meta.url).href;
const MODEL = (m) => new URL(`../vendor/models/pose_landmarker_${m}.task`, import.meta.url).href;

export async function startCamera(video, deviceId = "") {
  const base = { width: { ideal: 1280 }, height: { ideal: 720 } };
  const video_ = deviceId
    ? { ...base, deviceId: { exact: deviceId } }
    : { ...base, facingMode: "user" };
  const stream = await navigator.mediaDevices.getUserMedia({ video: video_, audio: false });
  video.srcObject = stream;
  await video.play();
  return () => stream.getTracks().forEach((t) => t.stop());
}

/** Camera input devices (labels need camera permission to be granted once). */
export async function listCameras() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices
    .filter((d) => d.kind === "videoinput")
    .map((d, i) => ({ id: d.deviceId, label: d.label || t("pose.camN").replace("{n}", i + 1) }));
}

export async function createPoseDetector(model = "lite") {
  const vision = await import(`${VENDOR}/vision_bundle.mjs`);
  const fileset = await vision.FilesetResolver.forVisionTasks(`${VENDOR}/wasm`);
  const models = [MODEL(model), MODEL("lite")];

  const make = (modelAssetPath, delegate) =>
    vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });

  // Try the chosen model with GPU, then CPU; fall back to the lite model.
  let landmarker = null;
  let lastErr = null;
  for (const path of models) {
    for (const delegate of ["GPU", "CPU"]) {
      try {
        landmarker = await make(path, delegate);
        break;
      } catch (err) {
        console.warn(`pose model failed (${delegate}, ${path})`, err);
        lastErr = err;
      }
    }
    if (landmarker) break;
  }
  if (!landmarker) {
    throw new Error(t("pose.modelFail").replace("{err}", lastErr?.message ?? lastErr));
  }

  let lastVideoTime = -1;
  let last = null;
  return {
    /** Returns latest landmarks (33 points) or null. Cheap to call every frame. */
    detect(video) {
      if (video.readyState < 2) return last;
      if (video.currentTime === lastVideoTime) return last;
      lastVideoTime = video.currentTime;
      const res = landmarker.detectForVideo(video, performance.now());
      last = res.landmarks?.[0] ?? null;
      return last;
    },
    close() {
      landmarker.close();
    },
  };
}
