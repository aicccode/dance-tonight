// Baked dance-clip format, shared by the main process (storage/validation) and
// the renderer (playback). No three.js here: the main process doesn't ship it.
import { t } from "../i18n/index.js";

export const HUMAN_BONES = [
  "hips", "spine", "chest", "upperChest", "neck", "head",
  "leftShoulder", "leftUpperArm", "leftLowerArm", "leftHand",
  "rightShoulder", "rightUpperArm", "rightLowerArm", "rightHand",
  "leftUpperLeg", "leftLowerLeg", "leftFoot", "leftToes",
  "rightUpperLeg", "rightLowerLeg", "rightFoot", "rightToes",
];

export const MAX_CLIP_SECONDS = 600;
export const DANCE_STYLES = ["现代舞", "爵士", "街舞", "韩舞", "其他"];

export class ClipError extends Error {}

const text = (v, max, fallback = "") => String(v ?? fallback).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
const finiteArray = (a, n) => Array.isArray(a) && a.length === n && a.every((v) => typeof v === "number" && Number.isFinite(v));

/** Validate an untrusted baked clip; returns a clean copy with known fields only. */
export function validateClip(raw) {
  if (!raw || typeof raw !== "object") throw new ClipError(t("clip.errInvalid"));
  const { fps, frames } = raw;
  if (raw.version !== 1) throw new ClipError(t("clip.errVersion"));
  if (!Number.isInteger(fps) || fps < 10 || fps > 120) throw new ClipError(t("clip.errFps"));
  if (!Number.isInteger(frames) || frames < 2 || frames > fps * MAX_CLIP_SECONDS + 1) throw new ClipError(t("clip.errFrames"));
  const bones = {};
  for (const [b, arr] of Object.entries(raw.bones ?? {})) {
    if (!HUMAN_BONES.includes(b)) throw new ClipError(t("clip.errBone", { bone: b }));
    if (!finiteArray(arr, frames * 4)) throw new ClipError(t("clip.errBoneData", { bone: b }));
    bones[b] = arr;
  }
  if (!bones.hips) throw new ClipError(t("clip.errHips"));
  if (!finiteArray(raw.hips, frames * 3)) throw new ClipError(t("clip.errHipsData"));
  const rest = {};
  for (const [b, v] of Object.entries(raw.rest ?? {})) {
    if (!HUMAN_BONES.includes(b) || !finiteArray(v, 3)) throw new ClipError(t("clip.errRestData", { bone: b }));
    rest[b] = v;
  }
  const frame = {};
  for (const [b, q] of Object.entries(raw.frame ?? {})) {
    if (!HUMAN_BONES.includes(b) || !finiteArray(q, 4)) throw new ClipError(t("clip.errTorsoData", { bone: b }));
    frame[b] = q;
  }
  const style = DANCE_STYLES.includes(raw.style) ? raw.style : "其他";
  return {
    version: 1, fps, frames, duration: (frames - 1) / fps, bones, hips: raw.hips, rest, frame,
    name: text(raw.name, 40, t("clip.untitled")) || t("clip.untitled"), style,
    desc: text(raw.desc, 200), credit: text(raw.credit, 200), source: text(raw.source, 120),
  };
}

/** Split a clip into practice sections of roughly `target` seconds. */
export function clipSections(duration, target = 4) {
  if (!(duration > 0)) return [];
  const n = Math.max(1, Math.round(duration / target));
  const len = duration / n;
  return Array.from({ length: n }, (_, i) => ({ start: i * len, end: (i + 1) * len, name: `第 ${i + 1} 节` }));
}
