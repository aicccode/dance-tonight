// Dance view: list of routines and motion-capture clips on the left, the
// selected item on the right (routine overview, segment practice, or the mocap
// studio). The list never goes away, so switching dances keeps your place.
import { api } from "../api.js";
import { ROUTINES, bpmFit, dancePlan, generateDanceChart, routineMoves, routineTempo, segmentNotes } from "../core/dance.js";
import { DANCE_MOVES, DANCE_NAMES } from "../dance/dancemoves.js";
import { t } from "../i18n/index.js";
import { DancePractice } from "../dance/practice.js";
import { $, esc, ensureVision, ensureVoice, guard, hideCoach, loadJson, prefs, showCoach, toast } from "../prefs.js";
import { forkRoutine, newRoutine, upgradeRoutine, withParts } from "../core/choreo_edit.js";
import { preloadClipMoves, syncClipMoves } from "../dance/clipregistry.js";
import { closeEditor, editorDirty, initEditor, openEditor, startPreview } from "./choreo.js";
import { closeStudio, initStudio, openStudio } from "./studio.js";

const SEL_KEY = "dt.danceSelection";
const PANES = ["routine-detail", "routine-editor", "dance-practice", "studio", "dance-empty"];

let ctx = null; // {play(songs, mode, routine)}
let clips = [];
let mine = []; // user routines (moves of deleted clips pruned; .missing = how many)

async function loadLibrary() {
  [clips, mine] = await Promise.all([api.dances(), api.routines()]);
  syncClipMoves(clips);
  // sequences (older 8-beat routines are converted), split into practice parts
  mine = mine.map((r) => {
    const { routine, removed } = upgradeRoutine(r);
    return { ...withParts(routine), missing: removed };
  });
}
let tab = "all";
let selected = loadJson(SEL_KEY, null); // {kind, id}
let current = null; // {routine, seg} during segment practice
let practiceSpeed = 1; // 1.0× = the routine's own tempo
let dancePractice = null;
const learned = new Map(); // routine id -> Set of segment indexes

const segMoves = (seg) => seg.seq ?? seg.pattern.filter(Boolean);
const segIcons = (seg) => segMoves(seg).map((m) => DANCE_MOVES[m].icon).join(" ");
const routineById = (id) => ROUTINES.find((r) => r.id === id) ?? mine.find((r) => r.id === id);

export function initDance({ play }) {
  ctx = { play };
  initStudio({
    onImported: async (saved) => {
      await loadLibrary();
      if (tab === "routine") setTab("all");
      renderList();
      if (saved.length) select("clip", saved[0].id);
    },
  });

  initEditor({
    onSaved: async (saved) => {
      await loadLibrary();
      renderList();
      select("routine", saved.id, { scroll: true, force: true });
    },
    onCancel: () => {
      const back = selected?.kind === "routine" && routineById(selected.id);
      if (back) showRoutine(back);
      else showPane("dance-empty");
      markActive();
    },
  });

  $("#dance-list").addEventListener("click", (e) => {
    const item = e.target.closest(".item");
    if (!item) return;
    if (item.dataset.kind === "new") {
      editRoutine(newRoutine());
      return;
    }
    if (e.target.closest("[data-act=remove]")) {
      const clip = clips.find((c) => c.id === item.dataset.id);
      if (clip && confirm(t("dance.confirmDeleteClip").replace("{name}", clip.name))) guard(() => removeClip(clip.id));
      return;
    }
    select(item.dataset.kind, item.dataset.id);
  });
  $("#dance-tabs").addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab]")?.dataset.tab;
    if (t) setTab(t);
  });

  $("#rd-edit").addEventListener("click", () => editRoutine(routineById(selected.id)));
  $("#rd-fork").addEventListener("click", () => editRoutine(forkRoutine(routineById(selected.id))));
  $("#rd-delete").addEventListener("click", () => {
    const r = routineById(selected.id);
    if (r?.custom && confirm(t("dance.confirmDeleteRoutine").replace("{name}", r.name))) guard(async () => {
      await api.removeRoutine(r.id);
      await loadLibrary();
      selected = null;
      renderList();
      select("routine", ROUTINES[0].id, { scroll: true });
    });
  });
  $("#rd-practice").addEventListener("click", () => startSegmentPractice(routineById(selected.id), 0));
  $("#rd-perform").addEventListener("click", () => pickSongAndPerform(routineById(selected.id)));
  $("#rd-segments").addEventListener("click", (e) => {
    const i = Number(e.target.closest("[data-seg]")?.dataset.seg);
    if (!Number.isInteger(i)) return;
    const routine = routineById(selected.id);
    if (e.target.closest("[data-act=practice]")) startSegmentPractice(routine, i);
    else previewRoutine(routine, i);
  });
  $("#dp-prev").addEventListener("click", () => stepSegment(-1));
  $("#dp-next").addEventListener("click", () => stepSegment(1));
  $("#dp-quit").addEventListener("click", () => {
    stopPractice();
    showRoutine(current.routine);
  });
  $("#dp-speed").addEventListener("click", (e) => {
    const v = Number(e.target.closest("[data-speed]")?.dataset.speed);
    if (!v || !current) return;
    practiceSpeed = v;
    markSpeed();
    loadSegment();
  });
  $("#dp-perform").addEventListener("click", () => {
    if (current) pickSongAndPerform(current.routine);
  });
}

/** Called when the dance view is shown. */
export async function enterDance() {
  await loadLibrary();
  renderList();
  if (editorDirty()) {
    showPane("routine-editor"); // unsaved draft survives a trip to another view
    startPreview();
    return;
  }
  const ok = selected && (selected.kind === "routine" ? routineById(selected.id) : clips.some((c) => c.id === selected.id && !c.error));
  select(ok ? selected.kind : "routine", ok ? selected.id : ROUTINES[0].id, { scroll: true });
}

/** Called when another view is shown. */
export function leaveDance() {
  stopPractice();
  closeStudio();
  // an open editor keeps its draft; it is still there when you come back
}

function setTab(t) {
  tab = t;
  document.querySelectorAll("#dance-tabs [data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
  renderList();
}

function renderList() {
  const list = $("#dance-list");
  const top = list.scrollTop;
  const show = (kind) => tab === "all" || tab === kind;
  const ok = clips.filter((c) => !c.error);
  const groups = [];
  if (show("routine")) {
    groups.push([t("dance.groupRoutines"), ROUTINES.map((r) => item("routine", r.id, "🎵", r.name,
      `${r.desc}`, `${r.bpm[0]}-${r.bpm[1]}`))]);
  }
  if (show("routine") || show("user")) {
    groups.push([t("dance.groupMine"), [
      ...mine.map((r) => item("routine", r.id, "✏️", r.name, r.desc || t("dance.segs").replace("{n}", r.segments.length), `${r.bpm[0]}-${r.bpm[1]}`)),
      `<button class="item new-item" data-kind="new" data-id="new"><span class="ico">＋</span><span><span class="name">${t("dance.newRoutine")}</span><span class="sub">${t("dance.newRoutineSub")}</span></span><span></span></button>`,
    ]]);
  }
  if (show("clip") || show("user")) {
    const mine = ok.filter((c) => c.kind === "user");
    groups.push([t("dance.groupImported"), mine.length ? mine.map((c) => item("clip", c.id, "📥", c.name,
      `${c.style}${c.source ? ` · ${c.source}` : ""}`, `${c.duration.toFixed(0)}s`, true))
      : [`<p class="muted small" style="padding:4px 10px 8px">${t("dance.noImport")}</p>`]]);
  }
  list.innerHTML = groups.filter(([, items]) => items.length)
    .map(([title, items]) => `<div class="group">${title}</div>${items.join("")}`).join("");
  list.scrollTop = top;
  markActive();
}

function item(kind, id, icon, name, sub, side, removable = false) {
  return `<button class="item" data-kind="${kind}" data-id="${esc(id)}">
    <span class="ico">${icon}</span>
    <span><span class="name">${esc(name)}</span><span class="sub">${esc(sub ?? "")}</span></span>
    <span class="side">${esc(side)}${removable ? ` <span class="x" data-act="remove" title="${t("dance.del")}">✕</span>` : ""}</span>
  </button>`;
}

function markActive({ scroll = false } = {}) {
  for (const el of document.querySelectorAll("#dance-list .item")) {
    const on = !!selected && el.dataset.kind === selected.kind && el.dataset.id === selected.id;
    el.classList.toggle("active", on);
    if (on && scroll) el.scrollIntoView({ block: "nearest" });
  }
}

function showPane(name) {
  for (const p of PANES) $(`#${p}`).hidden = p !== name;
}

function select(kind, id, { scroll = false, force = false } = {}) {
  if (!force && editorDirty() && !confirm(t("dance.confirmUnsaved"))) return;
  if (!$("#routine-editor").hidden || force) closeEditor();
  stopPractice();
  closeStudio();
  selected = { kind, id };
  localStorage.setItem(SEL_KEY, JSON.stringify(selected));
  markActive({ scroll });
  if (kind === "routine") {
    showRoutine(routineById(id));
  } else {
    showPane("studio");
    guard(() => openStudio(id));
  }
}

async function removeClip(id) {
  await api.removeDance(id);
  await loadLibrary();
  if (selected?.id === id) {
    closeStudio();
    selected = null;
    showPane("dance-empty");
  }
  renderList();
}

// ---------------- routines ----------------
function editRoutine(routine) {
  if (editorDirty() && !confirm(t("dance.confirmUnsaved"))) return;
  stopPractice();
  closeStudio();
  for (const el of document.querySelectorAll("#dance-list .item")) el.classList.toggle("active", el.dataset.kind === "new" && !routine.id);
  showPane("routine-editor");
  openEditor(routine);
  startPreview();
}

function showRoutine(routine) {
  showPane("routine-detail");
  $("#rd-edit").hidden = !routine.custom;
  $("#rd-delete").hidden = !routine.custom;
  $("#rd-fork").hidden = !!routine.custom;
  const done = learned.get(routine.id) ?? new Set();
  $("#rd-title").textContent = routine.missing
    ? t("dance.missingMoves").replace("{name}", routine.name).replace("{n}", routine.missing)
    : routine.name;
  const bpmRange = t("dance.bpmRange").replace("{lo}", routine.bpm[0]).replace("{hi}", routine.bpm[1]);
  $("#rd-meta").textContent = routine.seq
    ? [routine.desc, bpmRange, t("dance.metaSeq").replace("{n}", routine.seq.length), t("dance.metaParts").replace("{n}", routine.segments.length)].filter(Boolean).join(" · ")
    : [routine.desc, bpmRange, t("dance.segs").replace("{n}", routine.segments.length), t("dance.metaMoves").replace("{n}", routineMoves(routine).length)].filter(Boolean).join(" · ");
  $("#rd-segments").innerHTML = routine.segments.map((s, i) => `
    <div class="seg-card" data-seg="${i}" role="button" tabindex="0" title="${t("dance.segPreview")}">
      <b>${i + 1}. ${esc(s.name)} ${done.has(i) ? `<span class="tag train">${t("dance.learned")}</span>` : ""}</b>
      <div class="moves">${segIcons(s)}</div>
      <div class="card-foot">
        <small>${(s.seq ? segMoves(s) : [...new Set(segMoves(s))]).map((m) => esc(DANCE_MOVES[m].name)).join(" · ")}</small>
        <button data-act="practice">${t("dance.practiceSeg")}</button>
      </div>
    </div>`).join("");
  previewRoutine(routine, null);
}

/** Loop the whole routine (or one segment) on the docked preview coach. */
async function previewRoutine(routine, segIdx) {
  const bpm = routineTempo(routine); // 1.0×
  const segLen = (8 * 60) / bpm;
  const segs = segIdx == null ? routine.segments.map((s, i) => [s, i]) : [[routine.segments[segIdx], segIdx]];
  const notes = routine.seq
    ? segmentNotes({ seq: segIdx == null ? routine.seq : routine.segments[segIdx].seq }, bpm) // one pass, back to back
    : segs.flatMap(([seg], k) => segmentNotes(seg, bpm).map((n) => ({ ...n, t: n.t + k * segLen })));
  $("#rd-preview").textContent = segIdx == null ? t("dance.previewAll") : t("dance.previewSeg").replace("{n}", segIdx + 1).replace("{name}", routine.segments[segIdx].name);
  document.querySelectorAll("#rd-segments .seg-card").forEach((c) => c.classList.toggle("active", Number(c.dataset.seg) === segIdx));
  const coach = await showCoach({ slot: $("#routine-coach") }).catch(() => null);
  await preloadClipMoves(notes.map((n) => n.move)).catch(() => {});
  if (!$("#routine-detail").hidden) coach?.demoNotes(notes, bpm, 1.2);
}

function markSpeed() {
  document.querySelectorAll("#dp-speed [data-speed]").forEach((b) => b.classList.toggle("active", Number(b.dataset.speed) === practiceSpeed));
}

async function startSegmentPractice(routine, segIdx) {
  current = { routine, seg: segIdx };
  practiceSpeed = 1;
  markSpeed();
  showPane("dance-practice");
  loadSegment();
  await guard(async () => {
    await preloadClipMoves(routineMoves(routine)).catch(() => {});
    const v = await ensureVision((m) => ($("#dp-tip").textContent = m));
    const coach = await showCoach({ slot: $("#dance-coach") }).catch(() => null);
    const voice = prefs.voiceOn ? await ensureVoice() : null;
    dancePractice ??= new DancePractice({
      canvas: $("#dance-canvas"), video: $("#video"), detector: v.detector, coach, voice,
      els: { meter: $("#dp-meter"), tip: $("#dp-tip"), loops: $("#dp-loops") },
    });
    Object.assign(dancePractice, { detector: v.detector, coach, voice });
    if ($("#dance-practice").hidden) return; // left while loading
    dancePractice.start();
    loadSegment();
  });
}

function loadSegment() {
  const { routine, seg } = current;
  const done = learned.get(routine.id) ?? new Set();
  $("#dp-title").textContent = t("dance.segTitle").replace("{name}", routine.name).replace("{n}", seg + 1).replace("{total}", routine.segments.length).replace("{seg}", routine.segments[seg].name);
  $("#dp-segs").innerHTML = routine.segments
    .map((s, i) => `<span class="seg ${i === seg ? "now" : ""} ${done.has(i) ? "done" : ""}">${i + 1} ${esc(s.name)} ${segIcons(s)}</span>`)
    .join("");
  $("#dp-prev").disabled = seg === 0;
  $("#dp-next").textContent = seg === routine.segments.length - 1 ? t("dance.allLearned") : t("dance.nextSeg");
  dancePractice?.load(routine.segments[seg], Math.round(routineTempo(routine) * practiceSpeed));
  if (seg === 0) dancePractice?.voice?.say("dance.intro", { duck: false });
}

function stepSegment(d) {
  const { routine, seg } = current;
  if (!learned.has(routine.id)) learned.set(routine.id, new Set());
  learned.get(routine.id).add(seg);
  const next = seg + d;
  if (next >= routine.segments.length) {
    dancePractice?.voice?.say("dance.all", { duck: false });
    pickSongAndPerform(routine);
    return;
  }
  if (next < 0) return;
  current.seg = next;
  if (d > 0) dancePractice?.voice?.say("dance.next", { duck: false });
  loadSegment();
}

function stopPractice() {
  dancePractice?.stop();
  hideCoach();
}

async function pickSongAndPerform(routine) {
  const songs = (await api.songs()).filter((s) => s.status === "ready");
  if (!songs.length) {
    toast(t("dance.toastNoSongs"));
    return;
  }
  const fit = [...songs].sort((a, b) => bpmFit(a.tempo, routine) - bpmFit(b.tempo, routine));
  const best = fit[0];
  const pick = fit.length > 1
    ? fit.find((s) => bpmFit(s.tempo, routine) === 0 && s.id !== best.id) ?? best
    : best;
  stopPractice();
  showRoutine(routine);
  if (prefs.voiceOn) (await ensureVoice().catch(() => null))?.say("dance.perform", { duck: false });
  ctx.play([pick], "dance", routine);
}

/** Build the dance chart for a song (called from the session flow). */
export async function danceChartFor(song, routine) {
  await preloadClipMoves(routineMoves(routine)).catch(() => {});
  const analysis = await api.analysis(song.id);
  const notes = generateDanceChart(analysis, routine);
  return {
    song_id: song.id, mode: "dance", day: 0, plan: dancePlan(),
    tempo: analysis.tempo, beats: analysis.beats, notes,
    // a custom sequence is danced once: the session ends after its last move
    endAt: notes.endAt ?? null,
    duration: notes.endAt ? Math.min(notes.endAt, analysis.duration) : analysis.duration,
    best: song.best_dance ?? null,
  };
}

export { DANCE_NAMES };
