// Motion-capture dance studio (right pane of the dance view): a large 3D coach
// with slow motion, looped sections, mirror, orbit camera and an optional
// side-by-side view of your own camera. Also handles importing clips.
import { api } from "../api.js";
import { Coach } from "../coach/coach.js";
import { inPlace, mirrorClip } from "../coach/mocap.js";
import { clipSections } from "../core/danceclip.js";
import { importMotionFiles, importSummary } from "../dance/motionimport.js";
import { t } from "../i18n/index.js";
import { $, ensureVision, esc, guard, prefs, toast } from "../prefs.js";

const SECTION_HANG = 0.6; // pause at the end of a looped section (real seconds)
const VIEWS = { front: 0, side: Math.PI / 2, back: Math.PI };
// Clip styles are stored in their canonical (zh) form; only the label is translated.
const STYLE_KEYS = { "现代舞": "style.0", "爵士": "style.1", "街舞": "style.2", "韩舞": "style.3", "其他": "style.4" };
const styleLabel = (v) => (STYLE_KEYS[v] ? t(STYLE_KEYS[v]) : v ?? "");

let coach = null;
let loadedAvatar = null;
let st = null; // studio state while open
let raf = 0;
let onImported = () => {};

const fmt = (s) => `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`;

export function initStudio(opts = {}) {
  onImported = opts.onImported ?? onImported;
  $("#btn-import-motion").addEventListener("click", () => guard(importMotion));
  $("#mixamo-link").addEventListener("click", (e) => {
    e.preventDefault();
    api.openExternal("https://www.mixamo.com/");
  });

  $("#st-play").addEventListener("click", () => setPlaying(!st?.playing));
  $("#st-speed").addEventListener("click", (e) => {
    const v = Number(e.target.closest("button")?.dataset.speed);
    if (st && v) setSpeed(v);
  });
  $("#st-view").addEventListener("click", (e) => {
    const v = e.target.closest("button")?.dataset.view;
    if (!st || !v) return;
    coach.setOrbit(VIEWS[v]);
    // seen from behind, her left is your left: mirroring would confuse
    if (v !== "side") {
      $("#st-mirror").checked = v === "front";
      rebuildClip();
    }
    markButtons();
  });
  $("#st-sections").addEventListener("click", (e) => {
    const i = Number(e.target.closest("[data-sec]")?.dataset.sec);
    if (st && Number.isInteger(i)) gotoSection(i);
  });
  $("#st-seek").addEventListener("input", (e) => {
    if (!st) return;
    st.t = (Number(e.target.value) / 1000) * st.clip.duration;
    st.sec = sectionAt(st.t);
    st.hang = 0;
    updateUi();
  });
  for (const id of ["#st-mirror", "#st-inplace"]) $(id).addEventListener("change", rebuildClip);
  $("#st-cam").addEventListener("change", () => guard(toggleCamera));
  orbitDrag($("#studio-canvas"));
  const typing = (e) => e.target.closest("input:not([type=checkbox]):not([type=range]), select, textarea");
  // Space is ours while the studio is open (also stop it "clicking" a focused button)
  addEventListener("keyup", (e) => {
    if (st && !$("#studio").hidden && e.code === "Space" && !typing(e)) e.preventDefault();
  });
  addEventListener("keydown", (e) => {
    if (!st || $("#studio").hidden || typing(e)) return;
    if (e.code === "Space") {
      e.preventDefault();
      setPlaying(!st.playing);
    } else if (e.code === "ArrowRight") gotoSection(Math.min(st.sections.length - 1, st.sec + 1));
    else if (e.code === "ArrowLeft") gotoSection(Math.max(0, st.sec - 1));
  });
}

async function importMotion() {
  const files = await api.pickMotionFiles();
  if (!files?.length) return;
  // the loaders are only needed here; keep them out of app start-up
  const { bakeMotion } = await import("../coach/mocap_load.js");
  const style = $("#motion-style").value;
  const button = $("#btn-import-motion");
  button.disabled = true;
  try {
    const result = await importMotionFiles(files, {
      read: (f) => api.motionFileBytes(f.token),
      bake: (f) => bakeMotion(f, { name: f.name, style, source: `${f.name}.${f.ext}` }),
      save: (clip) => api.saveDance(clip),
      onProgress: async ({ index, total, name }) => {
        toast(total > 1
          ? t("studio.convertingN").replace("{i}", index + 1).replace("{total}", total).replace("{name}", name)
          : t("studio.converting").replace("{name}", name), 60000);
        await new Promise((r) => setTimeout(r, 30)); // let the toast paint before the heavy parse
      },
    });
    toast(importSummary(result), result.failed.length ? 12000 : 5000);
    if (result.ok.length) await onImported(result.ok);
  } finally {
    button.disabled = false;
  }
}

async function ensureCoach() {
  coach ??= new Coach($("#studio-canvas"));
  const ok = (await api.avatars()).filter((a) => !a.error);
  if (!ok.length) throw new Error(t("studio.noAvatar"));
  const meta = ok.find((a) => a.id === prefs.avatar) ?? ok[0];
  if (loadedAvatar !== meta.id) {
    await coach.load(await api.avatarData(meta.id));
    loadedAvatar = meta.id;
    $("#st-avatar").textContent = `${meta.name}${meta.author ? ` · by ${meta.author}` : ""}`;
  }
  coach.resize();
  coach.start();
  return coach;
}

let openSeq = 0;
export async function openStudio(id) {
  closeStudio();
  const seq = ++openSeq;
  const [data] = await Promise.all([api.danceData(id), ensureCoach()]);
  if (seq !== openSeq) return; // another clip was picked meanwhile
  st = {
    id, data, clip: null, t: 0, sec: 0, hang: 0, speed: 1, playing: true,
    sections: clipSections(data.duration), last: performance.now(),
  };
  setPlaying(true);
  $("#st-title").textContent = data.name;
  $("#st-credit").textContent = [
    esc(styleLabel(data.style)), t("studio.seconds").replace("{n}", data.duration.toFixed(1)), data.desc,
    data.credit ? `${t("studio.credit")}${data.source} · ${data.credit}` : "",
  ].filter(Boolean).join(" · ");
  $("#st-sections").innerHTML = st.sections
    .map((s, i) => `<span class="seg" data-sec="${i}">${t("studio.section").replace("{n}", i + 1)} <small>${fmt(s.start)}</small></span>`).join("");
  coach.setOrbit(VIEWS.front);
  $("#st-mirror").checked = true;
  rebuildClip();
  coach.playClip(st.clip, () => st?.t ?? 0);
  markButtons();
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(loop);
}

function rebuildClip() {
  if (!st) return;
  let clip = st.data;
  if ($("#st-inplace").checked) clip = inPlace(clip);
  if ($("#st-mirror").checked) clip = mirrorClip(clip);
  st.clip = clip;
  if (coach?.clip) coach.playClip(clip, () => st?.t ?? 0);
}

function sectionAt(t) {
  const i = st.sections.findIndex((s) => t < s.end - 1e-6);
  return i < 0 ? st.sections.length - 1 : i;
}

function loop(now) {
  if (!st) return;
  const dt = Math.min(0.1, (now - st.last) / 1000);
  st.last = now;
  if (st.playing) advance(dt);
  updateUi();
  raf = requestAnimationFrame(loop);
}

function advance(dt) {
  const loopSec = $("#st-loop").checked;
  const sec = st.sections[st.sec];
  const end = loopSec ? sec.end : st.clip.duration;
  if (st.hang > 0) {
    st.hang -= dt;
    if (st.hang <= 0) st.t = loopSec ? sec.start : 0;
    return;
  }
  st.t += dt * st.speed;
  if (st.t >= end) {
    st.t = end;
    st.hang = SECTION_HANG;
    st.loops = (st.loops ?? 0) + 1;
  }
  if (!loopSec) st.sec = sectionAt(st.t);
}

function updateUi() {
  $("#st-seek").value = String(Math.round((st.t / st.clip.duration) * 1000));
  $("#st-time").textContent = `${fmt(st.t)} / ${fmt(st.clip.duration)} · ${st.speed}×`;
  document.querySelectorAll("#st-sections .seg").forEach((el, i) => el.classList.toggle("now", i === st.sec));
}

function gotoSection(i) {
  st.sec = i;
  st.t = st.sections[i].start;
  st.hang = 0;
}

function setPlaying(on) {
  if (!st) return;
  st.playing = on;
  $("#st-play").innerHTML = on
    ? '<svg viewBox="0 0 16 16"><rect x="3" y="2" width="3.5" height="12" rx="1"/><rect x="9.5" y="2" width="3.5" height="12" rx="1"/></svg>'
    : '<svg viewBox="0 0 16 16"><path d="M4 2.5v11a.8.8 0 0 0 1.2.7l9-5.5a.8.8 0 0 0 0-1.4l-9-5.5A.8.8 0 0 0 4 2.5z"/></svg>';
  $("#st-play").title = on ? t("studio.pause") : t("studio.play");
}

function setSpeed(v) {
  st.speed = v;
  markButtons();
}

function markButtons() {
  document.querySelectorAll("#st-speed button").forEach((b) => b.classList.toggle("active", Number(b.dataset.speed) === st.speed));
  const orbit = coach?.orbit ?? 0;
  document.querySelectorAll("#st-view button").forEach((b) => b.classList.toggle("active", Math.abs(VIEWS[b.dataset.view] - orbit) < 1e-3));
}

function orbitDrag(canvas) {
  canvas.addEventListener("pointerdown", (e) => {
    if (!coach) return;
    const x0 = e.clientX, o0 = coach.orbit;
    canvas.setPointerCapture(e.pointerId);
    const move = (ev) => {
      coach.setOrbit(o0 - (ev.clientX - x0) * 0.01);
      markButtons();
    };
    const up = () => {
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
    };
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
  });
}

async function toggleCamera() {
  const on = $("#st-cam").checked;
  $("#st-me").hidden = !on;
  if (!on) return;
  await ensureVision();
  $("#st-video").srcObject = $("#video").srcObject;
  await $("#st-video").play().catch(() => {});
  coach?.resize();
}

export function closeStudio() {
  openSeq++;
  cancelAnimationFrame(raf);
  st = null;
  coach?.stopClip();
  coach?.stop();
  $("#st-cam").checked = false;
  $("#st-me").hidden = true;
}
