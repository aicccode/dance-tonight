// Shared UI state: persisted preferences + lazily created singletons.
import { api } from "./api.js";
import { currentLang, t } from "./i18n/index.js";
import { CoachPanel } from "./coach/coach.js";
import { createPoseDetector, startCamera } from "./pose.js";
import { VoiceCoach } from "./voice/voice.js";

const DEFAULTS = {
  latencyMs: 0,
  model: "lite",
  skeleton: true,
  voiceOn: true,
  eyesClosed: false,
  coachOn: true,
  speedRamp: true,
  voice: "bundled", // bundled per-language pack | browser (speechSynthesis)
  avatar: null,
  cameraId: "", // empty = system default camera
};

/** JSON from localStorage with a fallback: corrupted data must not break startup. */
export const loadJson = (key, fallback) => {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "null");
    return v ?? fallback;
  } catch {
    return fallback;
  }
};

export const prefs = { ...DEFAULTS, ...loadJson("dt.settings", {}) };
// the named zh voices (longhua/longhan/… TTS generation) were removed;
// migrate any legacy value to the bundled pack
if (prefs.voice !== "browser") prefs.voice = "bundled";
export const savePrefs = () => localStorage.setItem("dt.settings", JSON.stringify(prefs));

export const $ = (s) => document.querySelector(s);
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
export const fmtTime = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "-");

export function toast(msg, ms = 4000) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), ms);
}

export async function guard(fn) {
  try {
    return await fn();
  } catch (err) {
    console.error(err);
    toast(err.message || String(err));
    return undefined;
  }
}

// ---------------- camera + pose ----------------
let vision = null;
export async function ensureVision(onStatus = () => {}) {
  vision ??= { detector: null, stopCamera: null };
  if (!vision.stopCamera) {
    onStatus(t("prefs.camera"));
    vision.stopCamera = await startCamera($("#video"), prefs.cameraId);
  }
  if (!vision.detector) {
    onStatus(t("prefs.model"));
    vision.detector = await createPoseDetector(prefs.model);
  }
  return vision;
}

/** Switch to another camera at runtime (camera already open). */
export async function setCamera(deviceId) {
  prefs.cameraId = deviceId;
  savePrefs();
  if (!vision?.stopCamera) return; // not open yet: takes effect on next start
  vision.stopCamera();
  vision.stopCamera = await startCamera($("#video"), deviceId);
}

// ---------------- voice ----------------
let voice = null;
export async function ensureVoice(force = false) {
  voice ??= new VoiceCoach();
  await voice.load(prefs.voice, currentLang(), force);
  return voice;
}
export const currentVoice = () => voice;

// ---------------- coach ----------------
let panel = null;
let loadedAvatar = null;

export function coachPanel() {
  panel ??= new CoachPanel($("#coach-panel"));
  return panel;
}

/**
 * Show the coach with the chosen avatar (loads it on first use / change).
 * `slot`: element to dock into (practice/dance/settings); omit to float (game).
 * `force`: show even if "训练时显示教练" is off (settings preview).
 */
export async function showCoach({ slot = null, force = false } = {}) {
  if (!prefs.coachOn && !force) return null;
  const p = coachPanel();
  p.dock(slot);
  const list = await api.avatars();
  const ok = list.filter((a) => !a.error);
  if (!ok.length) return null;
  const meta = ok.find((a) => a.id === prefs.avatar) ?? ok[0];
  if (loadedAvatar !== meta.id) {
    p.show();
    await p.setAvatar(meta, await api.avatarData(meta.id));
    loadedAvatar = meta.id;
  }
  p.show();
  return p.coach;
}

export function hideCoach() {
  panel?.hide();
}

export function forgetAvatar() {
  loadedAvatar = null;
}
